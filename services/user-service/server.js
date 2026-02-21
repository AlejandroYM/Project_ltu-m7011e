process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const { authenticateJWT } = require('./middleware/auth');

dotenv.config();
const app = express();

// --- 1. CONFIGURACIÓN SWAGGER (REQ16) ---
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'ChefMatch User Service API',
    version: '1.0.0',
    description: 'API para la gestión de preferencias de usuario y comunicación con RabbitMQ',
  },
  servers: [{ url: '/users' }],
  paths: {
    '/health': {
      get: {
        summary: 'Estado del servicio',
        responses: {
          200: { description: 'Servicio funcionando correctamente' }
        }
      }
    },
    '/preferences': {
      post: {
        summary: 'Actualiza preferencias del usuario (Requiere JWT)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  category: { type: 'string', example: 'Vegana' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Preferencia enviada a RabbitMQ' },
          401: { description: 'No autorizado' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};

// --- 2. MIDDLEWARES ---
app.set('trust proxy', true); 
app.use(express.json());
app.use(cors({ 
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization'] 
}));

// --- 3. RABBITMQ (REQ15) ---
let channel;
async function connectRabbit() {
  if (process.env.NODE_ENV === 'test') return; 
  try {
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq-service:5672';
    const conn = await amqplib.connect(rabbitUrl);
    channel = await conn.createChannel();
    await channel.assertQueue('user_updates'); 
    console.log('✅ RabbitMQ conectado y cola lista');
  } catch (err) { 
    console.error('❌ Error RabbitMQ:', err.message);
    setTimeout(connectRabbit, 5000); 
  }
}
connectRabbit();

const userRouter = express.Router();
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// LATENCY - Response time histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

// TRAFFIC - Request counter
const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// ERRORS - Error counter
const httpRequestErrors = new client.Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'status_code', 'error_type']
});


const client = require('prom-client');

// [Copy the same metrics code from Step 1]

// Add metrics endpoint
app.get('/users/metrics', async (req, res) => {
  res.setHeader('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});

// --- 4. RUTAS ---

// Ruta pública (health check)
userRouter.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'user-service' });
});

// Ruta protegida con JWT (sin client secret hardcodeado)
userRouter.post('/preferences', authenticateJWT, async (req, res) => {
  try {
    const preferences = req.body.category || req.body.preferences;
    const userId = req.user.sub; // ✅ Ahora desde req.user (no req.kauth)
    
    if (!preferences) return res.status(400).json({ error: 'Faltan datos' });

    const message = { 
      userId,
      category: preferences.category || preferences,
      action: 'PREFERENCES_UPDATED',
      timestamp: new Date().toISOString()
    };
    
    if (channel) {
      channel.sendToQueue('user_updates', Buffer.from(JSON.stringify(message)));
      console.log(`📤 Mensaje enviado a RabbitMQ: ${JSON.stringify(message)}`);
    }
    
    res.json({ success: true, message: 'Preferencias actualizadas y enviadas a RabbitMQ' });
  } catch (err) {
    console.error('❌ Error en /preferences:', err.message);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// Swagger UI
app.use('/users/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Montar rutas
app.use('/users', userRouter);

// --- 5. SERVIDOR ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 User Service corriendo en puerto ${PORT}`);
  console.log(`📖 Documentación en: https://ltu-m7011e-5.se/users/api-docs`);
});

module.exports = app;
