process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const mongoose = require('mongoose');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const { authenticateJWT } = require('./middleware/auth');
const client = require('prom-client');

dotenv.config();
const app = express();

const User = require('./models/User');

// ============================================
// SWAGGER
// ============================================
const swaggerDocument = {
  openapi: '3.0.0',
  info: { title: 'ChefMatch User Service API', version: '1.0.0', description: 'Gestión de usuarios y preferencias' },
  servers: [{ url: '/users' }],
  paths: {
    '/health': { get: { summary: 'Estado del servicio', responses: { 200: { description: 'OK' } } } },
    '/{id}': {
      get: {
        summary: 'Obtener usuario por Keycloak ID',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Usuario encontrado' }, 404: { description: 'No encontrado' } }
      }
    },
    '/preferences': {
      post: {
        summary: 'Actualizar preferencias del usuario',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { category: { type: 'string' } } } } } },
        responses: { 200: { description: 'Preferencias actualizadas' } }
      }
    },
    '/account': {
      delete: {
        summary: 'Borrar cuenta del usuario',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Cuenta eliminada' } }
      }
    }
  },
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
};

// ============================================
// MIDDLEWARES
// ============================================
app.set('trust proxy', true);
app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));

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

app.get('/users/metrics', async (req, res) => {
  res.setHeader('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});

// ============================================
// MONGODB
// ============================================
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo-service:27017/chefmatch')
  .then(() => console.log('✅ User Service conectado a MongoDB'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ============================================
// RABBITMQ
// ============================================
let channel;
async function connectRabbit() {
  if (process.env.NODE_ENV === 'test') return;
  try {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq-service:5672');
    channel = await conn.createChannel();
    await channel.assertQueue('user_updates');
    await channel.assertQueue('user_events');
    console.log('✅ RabbitMQ conectado y colas listas');
  } catch (err) {
    console.error('❌ RabbitMQ error:', err.message);
    setTimeout(connectRabbit, 5000);
  }
}
connectRabbit();

// ============================================
// RUTAS
// ============================================
const userRouter = express.Router();

// Health check — público
userRouter.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'user-service' });
});

// ✅ GET /users/:id — obtener o crear usuario en MongoDB
// Arregla el 404 que aparecía en la consola del frontend
userRouter.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // Solo el propio usuario puede ver su perfil
    if (req.user.sub !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let user = await User.findByKeycloakId(id);

    // Si no existe todavía lo creamos (upsert en el primer acceso)
    if (!user) {
      user = new User({
        keycloakId: id,
        email: req.user.email || `${id}@unknown.com`,
        preferences: {}
      });
      await user.save();
      console.log(`👤 Nuevo usuario creado en MongoDB: ${id}`);
    }

    res.json({
      keycloakId: user.keycloakId,
      email:      user.email,
      preference: user.preferences?.category || null,
      category:   user.preferences?.category || null,
      preferences: user.preferences,
      createdAt:  user.createdAt
    });
  } catch (err) {
    console.error('Error GET /users/:id:', err.message);
    res.status(500).json({ error: 'Error fetching user' });
  }
});

// ✅ POST /users/preferences — guardar en MongoDB + publicar en RabbitMQ
userRouter.post('/preferences', authenticateJWT, async (req, res) => {
  try {
    const userId   = req.user.sub;
    const category = req.body.category || req.body.preferences;

    if (!category) return res.status(400).json({ error: 'Falta el campo category' });

    // Upsert: actualizar o crear
    let user = await User.findByKeycloakId(userId);
    if (!user) {
      user = new User({
        keycloakId: userId,
        email: req.user.email || `${userId}@unknown.com`,
        preferences: { category }
      });
    } else {
      user.preferences = { ...user.preferences, category };
    }
    await user.save();
    console.log(`✅ Preferencias guardadas en MongoDB para ${userId}: ${category}`);

    // Publicar en RabbitMQ para que otros servicios reaccionen
    const message = {
      userId,
      category,
      action: 'PREFERENCES_UPDATED',
      timestamp: new Date().toISOString()
    };
    if (channel) {
      channel.sendToQueue('user_updates', Buffer.from(JSON.stringify(message)));
      console.log(`📤 Mensaje enviado a RabbitMQ: ${JSON.stringify(message)}`);
    }

    res.json({ success: true, message: 'Preferencias guardadas', category });
  } catch (err) {
    console.error('Error POST /preferences:', err.message);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// ✅ DELETE /users/account — borrar usuario de MongoDB + evento USER_DELETED en RabbitMQ
// El recipe-service escucha ese evento y borra en cascada: recetas, meal plans y ratings
userRouter.delete('/account', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.sub;

    // 1. Borrar el usuario de MongoDB
    const deleted = await User.findOneAndDelete({ keycloakId: userId });
    if (deleted) {
      console.log(`🗑️ Usuario ${userId} eliminado de MongoDB`);
    } else {
      console.log(`⚠️ Usuario ${userId} no estaba en MongoDB (ya eliminado o nunca creado)`);
    }

    // 2. Publicar USER_DELETED en RabbitMQ para cascada en recipe-service
    const message = {
      userId,
      action: 'USER_DELETED',
      date: new Date().toISOString()
    };
    if (channel) {
      await channel.assertQueue('user_events');
      channel.sendToQueue('user_events', Buffer.from(JSON.stringify(message)));
      console.log(`📢 USER_DELETED publicado en RabbitMQ para ${userId}`);
    }

    res.json({ message: 'Cuenta eliminada. Todas las recetas, planes y valoraciones asociados se eliminarán en segundo plano.' });
  } catch (err) {
    console.error('Error DELETE /account:', err.message);
    res.status(500).json({ error: 'Error interno procesando la baja del usuario' });
  }
});

// ============================================
// SWAGGER UI + MONTAJE DE RUTAS
// ============================================
app.use('/users/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/users', userRouter);

// ============================================
// ARRANQUE
// ============================================
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 User Service en puerto ${PORT}`);
  console.log(`📖 Docs: https://ltu-m7011e-5.se/users/api-docs`);
});

module.exports = app;
