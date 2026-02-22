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

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// ✅ URLs corregidas — mismo namespace chefmatch, puerto correcto
const USER_SERVICE_URL = 'http://user-service:8000';
const RECIPE_SERVICE_URL = 'http://recipe-service:8000';

// ✅ Usar MONGO_URI (nombre correcto del secret)
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo-service:27017/chefmatch', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch((error) => {
  console.error('❌ MongoDB connection error:', error);
});

// --- RABBITMQ CONSUMER ---
async function startConsuming() {
  try {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq-service:5672');
    const channel = await conn.createChannel();
    await channel.assertQueue('user_updates');

    console.log('📥 Recommendation Service waiting for messages...');

    channel.consume('user_updates', async (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        if (event.action === 'PREFERENCES_UPDATED') {
          console.log(`✅ RabbitMQ: User ${event.userId} updated preferences.`);
          await generateRecommendationsForUser(event.userId);
        }
        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error('❌ RabbitMQ Error:', err.message);
  }
}

startConsuming();

// ✅ GENERAR Y GUARDAR RECOMENDACIONES
async function generateRecommendationsForUser(userId) {
  try {
    console.log(`🔄 Generating recommendations for user ${userId}`);

    let categoryPref = null;
    try {
      const userRes = await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
      const userData = userRes.data;
      if (userData.category) categoryPref = userData.category;
      else if (userData.preferences?.category) categoryPref = userData.preferences.category;
      else if (userData.preference) categoryPref = userData.preference;
    } catch (e) {
      console.log(`⚠️ Could not get preferences for user ${userId}`);
      return;
    }

    if (!categoryPref) {
      console.log(`⚠️ No category preference found for user ${userId}`);
      return;
    }

    const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes`);
    const allRecipes = Array.isArray(recipesRes.data)
      ? recipesRes.data
      : recipesRes.data.recipes || [];

    const safePref = categoryPref.toLowerCase().trim();
    const matchingRecipes = allRecipes.filter(r =>
      r.category && r.category.toLowerCase().trim() === safePref
    );

    if (matchingRecipes.length === 0) {
      console.log(`⚠️ No recipes found for category ${categoryPref}`);
      return;
    }

    await Recommendation.deleteMany({ userId });

    const recommendations = matchingRecipes.slice(0, 5).map((recipe, index) => ({
      userId,
      recipeName: recipe.name,
      recipeId: recipe._id || recipe.id,
      category: categoryPref,
      score: 100 - (index * 5),
      reason: 'preference_match'
    }));

    await Recommendation.insertMany(recommendations, { ordered: false })
      .catch(err => { if (err.code !== 11000) throw err; });

    console.log(`✅ Generated ${recommendations.length} recommendations for user ${userId}`);
  } catch (error) {
    console.error(`❌ Error generating recommendations:`, error.message);
  }
}

// --- REST API ---

// ✅ OBTENER RECOMENDACIONES
app.get('/recommendations/:userId', authenticateJWT, async (req, res) => {
  const { userId } = req.params;
  const queryCategory = req.query.category;

  try {
    if (queryCategory) {
      console.log(`🎯 Category forced by frontend: "${queryCategory}"`);

      const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes`);
      const allRecipes = Array.isArray(recipesRes.data)
        ? recipesRes.data
        : recipesRes.data.recipes || [];

      const safePref = queryCategory.toLowerCase().trim();
      const match = allRecipes.filter(r =>
        r.category && r.category.toLowerCase().trim() === safePref
      );

      if (match.length > 0) {
        const randomRecipe = match[Math.floor(Math.random() * match.length)];
        return res.json([randomRecipe.name]);
      } else {
        return res.json([`We don't have recipes for ${queryCategory} yet.`]);
      }
    }

    const recommendations = await Recommendation.find({ userId })
      .sort({ score: -1 })
      .limit(5)
      .lean();

    if (recommendations.length > 0) {
      const recipeNames = recommendations.map(r => r.recipeName);
      console.log(`💾 Returning ${recipeNames.length} recommendations from MongoDB`);
      return res.json(recipeNames);
    }

    console.log(`🔄 No recommendations found, generating for user ${userId}`);
    await generateRecommendationsForUser(userId);

    const newRecommendations = await Recommendation.find({ userId })
      .sort({ score: -1 })
      .limit(5)
      .lean();

    if (newRecommendations.length > 0) {
      return res.json(newRecommendations.map(r => r.recipeName));
    }

    return res.json(["Select a category to see your recommendation."]);

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.json(["Error fetching recommendation"]);
  }
});

// --- MÉTRICAS PROMETHEUS ---
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestErrors = new client.Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'status_code', 'error_type']
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'recommendation-service' });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Recommendation Service listening on port ${PORT}`);
});

module.exports = app;
