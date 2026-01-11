const express = require('express');
const Keycloak = require('keycloak-connect');
const session = require('express-session');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const cors = require('cors');

// Cargar variables de entorno
dotenv.config();

const app = express();

// --- 1. MIDDLEWARES (Configuración de máxima compatibilidad) ---
app.use(express.json());

// CORS configurado para permitir todo y evitar bloqueos en el navegador
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// --- 4. CONFIGURACIÓN DE KEYCLOAK (Sincronizada con tu "iss") ---
const keycloakConfig = {
  realm: 'ChefMatchRealm',
  'auth-server-url': 'https://keycloak.ltu-m7011e-5.se',
  resource: 'user-service',
  'bearer-only': true,
  'credentials': {
    'secret': 'BMBPc41R99uSJXaC8V9MKefx0k14gKR3'
  },
  'verify-token-audience': false, // Lo dejamos en false para evitar bloqueos estrictos
  'ssl-required': 'none',
  'confidential-port': 0
};

const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);
app.use(keycloak.middleware());

// --- 5. RUTAS ---

// Healthcheck para verificar si el Ingress llega al Pod
app.get('/health', (req, res) => {
  console.log('🔍 Healthcheck recibido');
  res.status(200).json({ status: 'UP', service: 'user-service' });
});

// Ruta principal del botón "Italiana"
app.post('/users/preferences', keycloak.protect(), async (req, res) => {
  try {
    console.log('📩 --- NUEVA PETICIÓN RECIBIDA ---');
    
    const preferences = req.body.category || req.body.preferences;
    const userId = req.kauth.grant.access_token.content.sub;

    console.log(`👤 Usuario ID: ${userId}`);
    console.log(`🍴 Preferencia: ${preferences}`);

    if (!preferences) {
      console.warn('⚠️ Petición sin preferencias');
      return res.status(400).json({ error: 'Faltan preferencias' });
    }

    const message = {
      userId: userId,
      newPreferences: preferences,
      action: 'PREFERENCES_UPDATED',
      date: new Date().toISOString()
    };

    if (channel) {
      channel.sendToQueue('user_updates', Buffer.from(JSON.stringify(message)));
      console.log('📢 Evento enviado a RabbitMQ con éxito');
      res.json({ message: 'Preferencias actualizadas correctamente', data: message });
    } else {
      console.error('❌ RabbitMQ no disponible');
      res.status(503).json({ error: 'RabbitMQ no disponible' });
    }
  } catch (err) {
    console.error('🔥 Error interno:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- 6. ARRANQUE ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 User Service ejecutándose en puerto ${PORT}`);
  console.log(`🔑 Keycloak Resource: ${keycloakConfig.resource}`);
});