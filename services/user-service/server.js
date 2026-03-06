const express = require('express');
const mongoose = require('mongoose');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const { authenticateJWT } = require('./middleware/auth');
const client = require('prom-client');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

dotenv.config();
const app = express();

const User = require('./models/User');

// ============================================
// SWAGGER
// ============================================
const swaggerDocument = {
  openapi: '3.0.0',
  info: { title: 'ChefMatch User Service API', version: '1.0.0', description: 'User and preference management' },
  servers: [{ url: '/users' }],
  paths: {
    '/health': { get: { summary: 'Service status', responses: { 200: { description: 'OK' } } } },
    '/{id}': {
      get: {
        summary: 'Get user by Keycloak ID',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User found' }, 404: { description: 'Not found' } }
      }
    },
    '/preferences': {
      post: {
        summary: 'Update user preferences',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { category: { type: 'string' } } } } } },
        responses: { 200: { description: 'Updated preferences' } }
      }
    },
    '/account': {
      delete: {
        summary: 'Delete user account',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Deleted account' } }
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

app.use(helmet());
app.use(mongoSanitize());
app.use(xss());

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
  .then(() => console.log('✅ User Service connected to MongoDB'))
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
    console.log('✅ RabbitMQ connected and queues ready');
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

// GET /users/:id — obtain or create user in MongoDB
// Fixes the 404 that appeared in the frontend console
userRouter.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // Only the user themselves can view their profile
    if (req.user.sub !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let user = await User.findByKeycloakId(id);

    // If the user doesn't exist, we create it (upsert on first access)
    if (!user) {
      user = new User({
        keycloakId: id,
        email: req.user.email || `${id}@unknown.com`,
        preferences: {}
      });
      await user.save();
      console.log(`👤 New user created in MongoDB: ${id}`);
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

// POST /users/preferences - save to MongoDB + publish to RabbitMQ
userRouter.post('/preferences', authenticateJWT, async (req, res) => {
  try {
    const userId   = req.user.sub;
    const category = req.body.category || req.body.preferences;

    if (!category) return res.status(400).json({ error: 'The category field is missing.' });

    // Upsert: update if exists, otherwise create
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
    console.log(`✅ Preferences saved in MongoDB for ${userId}: ${category}`);

    // Publicate in RabbitMQ so other services can react
    const message = {
      userId,
      category,
      action: 'PREFERENCES_UPDATED',
      timestamp: new Date().toISOString()
    };
    if (channel) {
      channel.sendToQueue('user_updates', Buffer.from(JSON.stringify(message)));
      console.log(`📤 Message sent to RabbitMQ: ${JSON.stringify(message)}`);
    }

    res.json({ success: true, message: 'Saved preferences', category });
  } catch (err) {
    console.error('Error POST /preferences:', err.message);
    res.status(500).json({ error: 'Error processing request' });
  }
});

// Delete /users/account — removes the user from MongoDB and publishes USER_DELETED 
// to RabbitMQ for cascading deletion in recipe-service
// the recipe-service listens to that event and deletes in cascade: recipes, meal plans and ratings
userRouter.delete('/account', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.sub;

    // 1. Remove the user from MongoDB
    const deleted = await User.findOneAndDelete({ keycloakId: userId });
    if (deleted) {
      console.log(`🗑️ User ${userId} removed from MongoDB`);
    } else {
      console.log(`⚠️ User ${userId} it was not in MongoDB (either already deleted or never created)`);
    }

    // 2. Publishes USER_DELETED in RabbitMQ for cascading deletion in recipe-service
    const message = {
      userId,
      action: 'USER_DELETED',
      date: new Date().toISOString()
    };
    if (channel) {
      await channel.assertQueue('user_events');
      channel.sendToQueue('user_events', Buffer.from(JSON.stringify(message)));
      console.log(`📢 USER_DELETED published in RabbitMQ for ${userId}`);
    }

    res.json({ message: 'Account deleted. All associated recipes, plans, and ratings will be deleted in the background.' });
  } catch (err) {
    console.error('Error DELETE /account:', err.message);
    res.status(500).json({ error: 'Internal error processing user cancellation' });
  }
});

// ============================================
// HEALTH CHECK — public, at root (for Kubernetes probes)
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'user-service' });
});

// ============================================
// SWAGGER UI + Route Mounting
// ============================================
app.use('/users/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/users', userRouter);

// ============================================
// ARRANGE
// ============================================
const PORT = process.env.PORT || 8000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 User Service in port ${PORT}`);
    console.log(`📖 Docs: https://ltu-m7011e-5.se/users/api-docs`);
  });
}
module.exports = app;
