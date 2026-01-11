const express = require('express');
const Keycloak = require('keycloak-connect');
const session = require('express-session');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const cors = require('cors');

// Cargar variables de entorno
dotenv.config();

const app = express();

// --- 1. MIDDLEWARES BÁSICOS ---
app.use(express.json());
app.use(cors()); // Permite peticiones desde el frontend

// --- 2. CONFIGURACIÓN DE SESIÓN ---
const memoryStore = new session.MemoryStore();
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_para_desarrollo',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

// --- 3. CONFIGURACIÓN DE RABBITMQ ---
let channel;
async function connectRabbit() {
  try {
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq-service:5672';
    const conn = await amqplib.connect(rabbitUrl);
    channel = await conn.createChannel();
    await channel.assertQueue('user_updates'); 
    console.log('✅ Conectado a RabbitMQ - Cola: user_updates');
  } catch (err) {
    console.error('❌ Error conectando a RabbitMQ:', err.message);
    setTimeout(connectRabbit, 5000);
  }
}
connectRabbit();

// --- 4. CONFIGURACIÓN DE KEYCLOAK ---
// IMPORTANTE: 'resource' debe coincidir con lo que pusiste en el Audience Mapper de Keycloak
const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'ChefMatchRealm',
  'auth-server-url': process.env.KEYCLOAK_URL || 'https://keycloak.ltu-m7011e-5.se',
  'ssl-required': 'external',
  resource: 'user-service', 
  'bearer-only': true 
};

const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);
app.use(keycloak.middleware());

// --- 5. RUTAS ---

// Healthcheck
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'user-service' });
});

// Actualizar preferencias (El botón "Italiana")
app.post('/users/preferences', keycloak.protect(), async (req, res) => {
  try {
    const preferences = req.body.category || req.body.preferences;
    
    // Extraemos el ID de usuario del token de Keycloak
    const userId = req.kauth.grant.access_token.content.sub;

    if (!preferences) {
      return res.status(400).json({ error: 'Faltan las preferencias en el body' });
    }

    const message = {
      userId: userId,
      newPreferences: preferences,
      action: 'PREFERENCES_UPDATED',
      timestamp: new Date().toISOString()
    };

    if (channel) {
      channel.sendToQueue('user_updates', Buffer.from(JSON.stringify(message)));
      console.log(`📢 Evento enviado a RabbitMQ para usuario: ${userId}`);
      return res.json({ 
        status: 'success', 
        message: 'Preferencias guardadas y enviadas a RabbitMQ',
        data: message 
      });
    } else {
      throw new Error('Canal RabbitMQ no disponible');
    }
  } catch (error) {
    console.error('🔥 Error en /users/preferences:', error.message);
    res.status(500).json({ error: 'Error interno al procesar preferencias' });
  }
});

// --- 6. ARRANQUE ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 User Service en puerto ${PORT}`);
  console.log(`🔑 Keycloak Resource: ${keycloakConfig.resource}`);
});