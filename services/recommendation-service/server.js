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

const RECIPE_SERVICE_URL = process.env.RECIPE_SERVICE_URL || 'http://recipe-service:8000';

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

// ============================================
// LÓGICA CENTRAL: generar y persistir recomendaciones
//
// 1. Pide las recetas al recipe-service YA ORDENADAS por averageRating desc
//    usando el parámetro ?sort=rating_desc que el recipe-service ya soporta.
// 2. Filtra por categoría (case-insensitive).
// 3. Guarda hasta 10 recetas en MongoDB con su averageRating para poder paginar.
// ============================================
async function generateAndSave(userId, category) {
  try {
    // Pedir recetas ordenadas por rating descendente directamente al recipe-service
    const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes?sort=rating_desc`);
    const allRecipes = Array.isArray(recipesRes.data)
      ? recipesRes.data
      : recipesRes.data.recipes || [];

    const safeCat = category.toLowerCase().trim();

    // Filtrar por categoría manteniendo el orden de rating que ya viene del API
    const matching = allRecipes.filter(r =>
      r.category && r.category.toLowerCase().trim() === safeCat
    );

    if (matching.length === 0) {
      console.log(`⚠️ No recipes found for category "${category}"`);
      return [];
    }

    // Guardar hasta 10 para tener margen de paginación
    const top10 = matching.slice(0, 10);

    // Borrar recomendaciones anteriores del usuario para esta categoría y reemplazar
    await Recommendation.deleteMany({ userId });

    const docs = top10.map((recipe, i) => {
      // averageRating ya viene del recipe-service (4–10 base o calculado por votos)
      const recipeRating = typeof recipe.averageRating === 'number' && recipe.averageRating > 0
        ? recipe.averageRating
        : 5.0; // fallback de seguridad

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

    console.log(`✅ ${docs.length} recomendaciones guardadas para ${userId} (${category}) — top rating: ${docs[0]?.recipeRating}`);
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

    console.log('📥 Recommendation Service escuchando RabbitMQ...');

    // PREFERENCES_UPDATED → regenerar recomendaciones con la nueva categoría
    channel.consume('user_updates', async (msg) => {
      if (msg !== null) {
        try {
          const event = JSON.parse(msg.content.toString());
          if (event.action === 'PREFERENCES_UPDATED' && event.userId && event.category) {
            console.log(`📨 PREFERENCES_UPDATED para ${event.userId} → ${event.category}`);
            await generateAndSave(event.userId, event.category);
          }
        } catch (e) {
          console.error('Error procesando user_updates:', e.message);
        }
        channel.ack(msg);
      }
    });

    // USER_DELETED → borrar todas sus recomendaciones
    channel.consume('user_events', async (msg) => {
      if (msg !== null) {
        try {
          const event = JSON.parse(msg.content.toString());
          if (event.action === 'USER_DELETED' && event.userId) {
            console.log(`🗑️ USER_DELETED: borrando recomendaciones de ${event.userId}`);
            await Recommendation.deleteMany({ userId: event.userId });
          }
        } catch (e) {
          console.error('Error procesando user_events:', e.message);
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
// GET /recommendations/:userId
//
// Query params:
//   ?category=Vegan     → filtra/regenera por categoría
//   ?index=0            → posición deseada (0-based, 0 = la mejor nota)
//
// Comportamiento:
//   - Con ?category: si no hay recomendaciones guardadas para esa categoría,
//     las genera llamando al recipe-service. Devuelve la receta en la posición
//     indicada por ?index (por defecto 0 = la de mayor nota).
//   - Sin ?category: devuelve de las guardadas en MongoDB la del índice solicitado.
//
// Ejemplos:
//   GET /recommendations/123?category=Vegan           → 1ª receta vegana (mayor nota)
//   GET /recommendations/123?category=Vegan&index=1   → 2ª receta vegana
//   GET /recommendations/123?category=Vegan&index=2   → 3ª receta vegana
//   GET /recommendations/123                          → mejor receta guardada
//   GET /recommendations/123?index=2                  → 3ª mejor receta guardada
// ============================================
app.get('/recommendations/:userId', authenticateJWT, async (req, res) => {
  const { userId } = req.params;
  const queryCategory = req.query.category;
  const index = Math.max(0, parseInt(req.query.index, 10) || 0);

  try {
    if (queryCategory) {
      console.log(`🎯 Categoría: "${queryCategory}" | índice: ${index} | usuario: ${userId}`);

      // Buscar recomendaciones ya guardadas para esta categoría
      let saved = await Recommendation.find({
        userId,
        category: { $regex: new RegExp(`^${queryCategory}$`, 'i') }
      })
        .sort({ recipeRating: -1 })
        .lean();

      // Si no hay nada guardado, generarlo ahora
      if (saved.length === 0) {
        const generated = await generateAndSave(userId, queryCategory);
        // generateAndSave ya devuelve los docs ordenados por recipeRating desc
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

    // Sin categoría: leer de MongoDB ordenado por recipeRating desc
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
    console.error('❌ Error en /recommendations:', err.message);
    res.json(["Error fetching recommendation"]);
  }
});

// ============================================
// GET /recommendations/:userId/all
// Devuelve el ranking completo de recomendaciones guardadas, de mayor a menor nota.
// Útil para debug o para mostrar lista en el frontend.
// ============================================
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
    console.error('❌ Error en /recommendations/all:', err.message);
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
app.listen(PORT, () => console.log(`🚀 Recommendation Service en puerto ${PORT}`));

module.exports = app;
