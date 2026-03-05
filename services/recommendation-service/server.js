process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const mongoose = require('mongoose');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const axios = require('axios');
const { authenticateJWT } = require('./middleware/auth');
const cors = require('cors');
const client = require('prom-client');
const Recommendation = require('./models/Recommendation');
const swaggerUi = require('swagger-ui-express');

const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use(helmet());
app.use(mongoSanitize());
app.use(xss());

const RECIPE_SERVICE_URL = process.env.RECIPE_SERVICE_URL || 'http://recipe-service:8000';

// KEYCLOACK - CLIENT CREDENTIALS
// The recommendation-service acts as a machine client (no user).
// It obtains its own token to call GET /recipes (which now requires JWT).
// Requires a Keycloak client 'recommendation-service' with "Service Accounts Enabled" = true.
const KC_URL    = process.env.KEYCLOAK_URL    || 'https://keycloak.ltu-m7011e-5.se';
const KC_REALM  = process.env.KEYCLOAK_REALM  || 'ChefMatchRealm';
const KC_CLIENT = process.env.KEYCLOAK_RECOMMENDATION_CLIENT_ID     || 'recommendation-service';
const KC_SECRET = process.env.KEYCLOAK_RECOMMENDATION_CLIENT_SECRET || '';

let serviceToken     = null;
let serviceTokenExp  = 0; // timestamp of expiration in ms

async function getServiceToken() {
  // Reutilize the token if it still has more than 30 seconds of life
  if (serviceToken && Date.now() < serviceTokenExp - 30000) {
    return serviceToken;
  }

  try {
    const params = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     KC_CLIENT,
      client_secret: KC_SECRET
    });

    const res = await axios.post(
      `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    serviceToken    = res.data.access_token;
    serviceTokenExp = Date.now() + (res.data.expires_in * 1000);

    console.log('🔑 Service token obtenido de Keycloak (válido para recommendation-service)');
    return serviceToken;
  } catch (err) {
    console.error('❌ Error obteniendo service token:', err.response?.data || err.message);
    return null;
  }
}

// ============================================
// MONGODB
// ============================================
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo-service:27017/chefmatch')
  .then(() => console.log('✅ Recommendation Service conectado a MongoDB'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ============================================
// PROMETHEUS
// ============================================
client.collectDefaultMetrics({ timeout: 5000 });
const httpRequestDuration = new client.Histogram({ name: 'http_request_duration_seconds', help: 'Duration', labelNames: ['method','route','status_code'], buckets: [0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5] });
const httpRequestTotal    = new client.Counter({ name: 'http_requests_total', help: 'Total', labelNames: ['method','route','status_code'] });
const httpRequestErrors   = new client.Counter({ name: 'http_request_errors_total', help: 'Errors', labelNames: ['method','route','status_code','error_type'] });

app.use((req, res, next) => {
  const start = Date.now(), oe = res.end;
  res.end = function(...args) {
    const d = (Date.now() - start) / 1000, r = req.route ? req.route.path : req.path;
    httpRequestDuration.labels(req.method, r, res.statusCode).observe(d);
    httpRequestTotal.labels(req.method, r, res.statusCode).inc();
    if (res.statusCode >= 400) httpRequestErrors.labels(req.method, r, res.statusCode, res.statusCode >= 500 ? 'server_error' : 'client_error').inc();
    oe.apply(res, args);
  };
  next();
});

// CENTRAL LOGIC: generate and persist recommendations
// 1. Requests recipes from the recipe-service ALREADY SORTED by averageRating desc
//    using the ?sort=rating_desc parameter that the recipe-service already supports.
// 2. Filters by category (case-insensitive).
// 3. Saves up to 10 recipes in MongoDB with their averageRating for pagination.
async function generateAndSave(userId, category) {
  try {
    // Obtener token de servicio para autenticarse ante el recipe-service
    const token = await getServiceToken();
    if (!token) {
      console.error('❌ Could not obtain service token — aborting generateAndSave');
      return [];
    }

    // Asking for sorted results from the recipe-service to minimize our in-memory sorting and ensure we get the top-rated recipes first.
    const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes?sort=rating_desc`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const allRecipes = Array.isArray(recipesRes.data)
      ? recipesRes.data
      : recipesRes.data.recipes || [];

    const safeCat = category.toLowerCase().trim();

    // Filter by category while preserving the rating order that already comes from the API
    const matching = allRecipes.filter(r =>
      r.category && r.category.toLowerCase().trim() === safeCat
    );

    if (matching.length === 0) {
      console.log(`⚠️ No recipes found for category "${category}"`);
      return [];
    }

    // Save up to 10 to have some margin for pagination (index=0..9) without needing to regenerate immediately.
    const top10 = matching.slice(0, 10);

    // Delete previous recommendations of the user for this category and replace with the new ones.
    await Recommendation.deleteMany({ userId });

    const docs = top10.map((recipe, i) => {
      // averageRating comes from the recipe-service (4–10 base or calculated by votes)
      const recipeRating = typeof recipe.averageRating === 'number' && recipe.averageRating > 0
        ? recipe.averageRating
        : 5.0; // security fallback 

      return {
        userId,
        recipeName:   recipe.name,
        recipeId:     String(recipe._id || recipe.id || ''),
        category,
        recipeRating,
        score:        parseFloat((recipeRating * 10).toFixed(1)),
        reason:       'preference_match'
      };
    });

    await Recommendation.insertMany(docs, { ordered: false })
      .catch(err => { if (err.code !== 11000) throw err; });

    console.log(`✅ ${docs.length} recommendations saved for ${userId} (${category}) — top rating: ${docs[0]?.recipeRating}`);
    return docs;
  } catch (err) {
    console.error('❌ generateAndSave error:', err.message);
    return [];
  }
}

// ============================================
// RABBITMQ
// ============================================
async function startConsuming() {
  try {
    const conn = await amqplib.connect(
      process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq-service:5672'
    );
    const channel = await conn.createChannel();
    await channel.assertQueue('user_updates');
    await channel.assertQueue('user_events');

    console.log('📥 Recommendation Service listening RabbitMQ...');

    // PREFERENCES_UPDATED -> regerenate recommendations with the new category
    channel.consume('user_updates', async (msg) => {
      if (msg !== null) {
        try {
          const event = JSON.parse(msg.content.toString());
          if (event.action === 'PREFERENCES_UPDATED' && event.userId && event.category) {
            console.log(`📨 PREFERENCES_UPDATED for ${event.userId} → ${event.category}`);
            await generateAndSave(event.userId, event.category);
          }
        } catch (e) {
          console.error('Error processing user_updates:', e.message);
        }
        channel.ack(msg);
      }
    });

    // USER_DELETED → delete all recommendations of that user to keep the DB clean
    channel.consume('user_events', async (msg) => {
      if (msg !== null) {
        try {
          const event = JSON.parse(msg.content.toString());
          if (event.action === 'USER_DELETED' && event.userId) {
            console.log(`🗑️ USER_DELETED: deleting recommendations ${event.userId}`);
            await Recommendation.deleteMany({ userId: event.userId });
          }
        } catch (e) {
          console.error('Error processing user_events:', e.message);
        }
        channel.ack(msg);
      }
    });

  } catch (err) {
    console.error('❌ RabbitMQ error:', err.message);
    setTimeout(startConsuming, 5000);
  }
}

startConsuming();
// ============================================
// SWAGGER DOCS - RECOMMENDATION SERVICE (REQ16)
// ============================================
const swaggerDocument = {
  openapi: '3.0.0',
  info: { 
    title: 'ChefMatch Recommendation Service API', 
    version: '1.0.0', 
    description: 'Dynamic suggestion engine based on history, user interactions, and recipe popularity.' 
  },
  servers: [{ url: '/recommendations' }],
  paths: {
    '/{userId}': {
      get: { 
        summary: 'Get the top recommendation for the user', 
        description: 'Returns the highest-rated recommended recipe for the user. If the category is provided, it filters and generates recommendations on the fly by querying the recipe service.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter suggestions by category (e.g., Vegan)' },
          { name: 'index', in: 'query', schema: { type: 'integer' }, description: 'Posición de la recomendación (0 = la de mayor nota)' }
        ],
        responses: { 
          200: { description: 'Recommendation successfully returned (Array with recipe name)' },
          401: { description: 'Invalid or missing JWT token' }
        } 
      }
    },
    '/{userId}/all': {
      get: { 
        summary: 'Get the full ranking of saved recommendations', 
        description: 'Returns all saved recommendations for the user, sorted from highest to lowest score.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { 
          200: { description: 'Complete list of recommendations successfully obtained' },
          401: { description: 'Invalid or missing JWT token' }
        } 
      }
    }
  },
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
};

app.use('/recommendations/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// GET /recommendations/:userId
//
// Query params:
//   ?category=Vegan     → filter/regenerate by category
//   ?index=0            → desired position (0-based, 0 = highest rating)
//
// Behavior:
//   - With ?category: if there are no saved recommendations for that category,
//     it generates them by calling the recipe-service. Returns the recipe at the
//     position indicated by ?index (default 0 = highest rating).
//   - Without ?category: returns from MongoDB the one at the requested index.
//
// Examples:
//   GET /recommendations/123?category=Vegan           → 1st vegan recipe (highest rating)
//   GET /recommendations/123?category=Vegan&index=1   → 2nd vegan recipe
//   GET /recommendations/123?category=Vegan&index=2   → 3rd vegan recipe
//   GET /recommendations/123                          → best saved recipe
//   GET /recommendations/123?index=2                  → 3rd best saved recipe
app.get('/recommendations/:userId', authenticateJWT, async (req, res) => {
  const { userId } = req.params;
  const queryCategory = req.query.category;
  const index = Math.max(0, parseInt(req.query.index, 10) || 0);

  try {
    if (queryCategory) {
      console.log(`🎯 Category: "${queryCategory}" | index: ${index} | user: ${userId}`);

      // Search recommendations already saved for this category 
      let saved = await Recommendation.find({
        userId,
        category: { $regex: new RegExp(`^${queryCategory}$`, 'i') }
      })
        .sort({ recipeRating: -1 })
        .lean();

      // If there is nothing saved, generate it now
      if (saved.length === 0) {
        const generated = await generateAndSave(userId, queryCategory);
        // generateAndSave already returns the docs sorted by recipeRating desc
        saved = generated.sort((a, b) => b.recipeRating - a.recipeRating);
      }

      if (saved.length === 0) {
        return res.json([`We don't have recipes for "${queryCategory}" yet.`]);
      }

      const clampedIndex = Math.min(index, saved.length - 1);
      const pick = saved[clampedIndex];

      console.log(`📌 #${clampedIndex + 1} de ${saved.length}: "${pick.recipeName}" (rating: ${pick.recipeRating})`);
      return res.json([pick.recipeName]);
    }

    // Whithout category: read from MongoDB sorted by recipeRating desc
    const saved = await Recommendation.find({ userId })
      .sort({ recipeRating: -1 })
      .lean();

    if (saved.length === 0) {
      return res.json(["Select a category to see your recommendation."]);
    }

    const clampedIndex = Math.min(index, saved.length - 1);
    const pick = saved[clampedIndex];

    console.log(`💾 #${clampedIndex + 1} de ${saved.length}: "${pick.recipeName}" (rating: ${pick.recipeRating})`);
    return res.json([pick.recipeName]);

  } catch (err) {
    console.error('❌ Error in /recommendations:', err.message);
    res.json(["Error fetching recommendation"]);
  }
});

// GET /recommendations/:userId/all
// Returns the full ranking of saved recommendations, from highest to lowest rating.
// Useful for debugging or to show a list in the frontend.
app.get('/recommendations/:userId/all', authenticateJWT, async (req, res) => {
  const { userId } = req.params;
  try {
    const saved = await Recommendation.find({ userId })
      .sort({ recipeRating: -1 })
      .lean();

    return res.json(saved.map((r, i) => ({
      position: i + 1,
      name:     r.recipeName,
      category: r.category,
      rating:   r.recipeRating
    })));
  } catch (err) {
    console.error('❌ Error in /recommendations/all:', err.message);
    res.status(500).json({ error: 'Error fetching recommendations' });
  }
});

// ============================================
// HEALTH + METRICS
// ============================================
app.get('/health', (req, res) => res.json({ status: 'UP', service: 'recommendation-service' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Recommendation Service in port ${PORT}`));

module.exports = app;
