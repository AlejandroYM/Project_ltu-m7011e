process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const Keycloak = require('keycloak-connect');
const session = require('express-session');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

dotenv.config();
const app = express();

// --- 1. CONFIGURACIÓN SWAGGER (REQ16) ---
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ChefMatch User Service API',
      version: '1.0.0',
      description: 'API para la gestión de preferencias de usuario y comunicación con RabbitMQ',
    },
    servers: [{ url: '/users' }], // Importante para que las peticiones vayan al path correcto
  },
  apis: ['./server.js'], 
};
const swaggerDocs = swaggerJsdoc(swaggerOptions);

// --- 2. MIDDLEWARES ---
app.set('trust proxy', true); 
app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));

const memoryStore = new session.MemoryStore();
app.use(session({ 
    secret: 'clave_secreta_chefmatch', 
    resave: false, 
    saveUninitialized: true, 
    store: memoryStore 
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

// --- 4. KEYCLOAK (REQ20) ---
const keycloak = new Keycloak({ store: memoryStore }, {
  realm: 'ChefMatchRealm',
  'auth-server-url': 'https://keycloak.ltu-m7011e-5.se',
  resource: 'user-service',
  'clientId': 'user-service',
  'bearer-only': true,
  'credentials': { 'secret': 'BMBPc41R99uSJXaC8V9MKefx0k14gKR3' },
  'verify-token-audience': false,
  'ssl-required': 'none'
});
app.use(keycloak.middleware());

const userRouter = express.Router();

// --- 5. RUTAS Y DOCUMENTACIÓN (REQ14 & REQ16) ---

/**
 * @openapi
 * /health:
 * get:
 * description: Retorna el estado del servicio
 * responses:
 * 200:
 * description: Servicio funcionando correctamente
 */
userRouter.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'user-service' });
});

/**
 * @openapi
 * /preferences:
 * post:
 * description: Actualiza las preferencias del usuario
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * category:
 * type: string
 * responses:
 * 200:
 * description: OK
 * 403:
 * description: No autorizado
 */

userRouter.post('/preferences', keycloak.protect(), async (req, res) => {
  try {
    const preferences = req.body.category || req.body.preferences;
    const userId = req.kauth.grant.access_token.content.sub;
    
    if (!preferences) return res.status(400).json({ error: 'Faltan datos' });

    const message = { 
        userId, 
        newPreferences: preferences, 
        action: 'PREFERENCES_UPDATED', 
        date: new Date().toISOString() 
    };

    if (process.env.NODE_ENV === 'test' || channel) {
      if (channel) channel.sendToQueue('user_updates', Buffer.from(JSON.stringify(message)));
      return res.json({ message: 'OK', data: message });
    }
    res.status(503).json({ error: 'RabbitMQ no disponible' });
  } catch (err) { 
      res.status(500).json({ error: 'Error interno' }); 
  }
});

// --- 6. REGISTRO DE RUTAS ---
// La ruta de Swagger debe ir ANTES que el router de /users
app.use('/users/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.use('/users', userRouter);

// --- 7. ARRANQUE ---
const PORT = 8000;
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`🚀 User Service corriendo en puerto ${PORT}`);
        console.log(`📖 Documentación en: https://ltu-m7011e-5.se/users/api-docs`);
    });
}

module.exports = app;