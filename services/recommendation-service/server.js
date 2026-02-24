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
// Acepta una categoría directamente — no necesita llamar al user-service
// ============================================
async function generateAndSave(userId, category) {
  try {
    const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes`);
    const allRecipes = Array.isArray(recipesRes.data)
      ? recipesRes.data
      : recipesRes.data.recipes || [];

    const safeCat = category.toLowerCase().trim();
    const matching = allRecipes.filter(r =>
      r.category && r.category.toLowerCase().trim() === safeCat
    );

    if (matching.length === 0) {
      console.log(`⚠️ No recipes found for category ${category}`);
      return [];
    }

    // Mezclar para variedad
    const shuffled = matching.sort(() => Math.random() - 0.5);
    const top5 = shuffled.slice(0, 5);

    // Borrar recomendaciones anteriores del usuario y reemplazar
    await Recommendation.deleteMany({ userId });

    const docs = top5.map((recipe, i) => ({
      userId,
      recipeName: recipe.name,
      recipeId:   String(recipe._id || recipe.id || ''),
      category,
      score:      100 - (i * 5),
      reason:     'preference_match'
    }));

    // insertMany con ordered:false para ignorar duplicados por índice único
    await Recommendation.insertMany(docs, { ordered: false })
      .catch(err => { if (err.code !== 11000) throw err; });

    console.log(`✅ ${docs.length} recomendaciones guardadas en MongoDB para ${userId} (${category})`);
    return docs.map(d => d.recipeName);
  } catch (err) {
    console.error('❌ generateAndSave error:', err.message);
    return [];
  }
}

// ============================================
// RABBITMQ
// Escucha PREFERENCES_UPDATED → genera recomendaciones
// Escucha USER_DELETED        → borra recomendaciones en cascada
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
// ============================================
app.get('/recommendations/:userId', authenticateJWT, async (req, res) => {
  const { userId } = req.params;
  const queryCategory = req.query.category;

  try {
    if (queryCategory) {
      // ✅ ANTES: devolvía directamente sin guardar nada en MongoDB
      // ✅ AHORA: genera, guarda en MongoDB Y devuelve
      console.log(`🎯 Categoría recibida del frontend: "${queryCategory}" para ${userId}`);
      const names = await generateAndSave(userId, queryCategory);
      if (names.length > 0) {
        return res.json([names[Math.floor(Math.random() * names.length)]]);
      }
      return res.json([`We don't have recipes for ${queryCategory} yet.`]);
    }

    // Sin categoría en query → leer de MongoDB
    const saved = await Recommendation.find({ userId })
      .sort({ score: -1 })
      .limit(5)
      .lean();

    if (saved.length > 0) {
      console.log(`💾 Devolviendo ${saved.length} recomendaciones de MongoDB para ${userId}`);
      return res.json(saved.map(r => r.recipeName));
    }

    return res.json(["Select a category to see your recommendation."]);

  } catch (err) {
    console.error('❌ Error en /recommendations:', err.message);
    res.json(["Error fetching recommendation"]);
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
