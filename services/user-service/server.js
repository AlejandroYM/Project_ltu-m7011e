const express = require('express');
const Keycloak = require('keycloak-connect');
const session = require('express-session');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const cors = require('cors');

// Cargar variables de entorno
dotenv.config();

const app = express();

// --- 1. MIDDLEWARES ---
app.use(express.json());
app.use(cors()); // Permite la comunicación desde el dominio del frontend

// --- 2. CONFIGURACIÓN DE SESIÓN (Requerida por Keycloak-Connect) ---
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
const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'ChefMatchRealm',
  'auth-server-url': process.env.KEYCLOAK_URL || 'https://keycloak.ltu-m7011e-5.se',
  resource: 'frontend-client', // Sincronizado con tu Client ID de Keycloak para evitar 403
  'bearer-only': true,
  'verify-token-audience': false, // Ignora discrepancias menores de audiencia
  'ssl-required': 'none'
};

const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);
app.use(keycloak.middleware());

// --- 5. RUTAS ---

// Healthcheck para Kubernetes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'user-service' });
});

// Actualizar preferencias (Botón "Italiana")
app.post('/users/preferences', keycloak.protect(), async (req, res) => {
  try {
    const preferences = req.body.category || req.body.preferences;
    
    // Extraer datos del token
    const tokenContent = req.kauth.grant.access_token.content;
    const userId = tokenContent.sub;

    console.log(`📩 Petición recibida del usuario: ${userId}`);
    console.log(`🍴 Preferencia: ${preferences}`);

    if (!preferences) {
      return res.status(400).json({ error: 'Faltan preferencias' });
    }

    const message = {
      userId: userId,
      newPreferences: preferences,
      action: 'PREFERENCES_UPDATED',
      date: new Date()
    };

    if (channel) {
      channel.sendToQueue('user_updates', Buffer.from(JSON.stringify(message)));
      console.log('📢 Evento enviado a RabbitMQ con éxito');
      res.json({ message: 'Preferencias actualizadas correctamente', data: message });
    } else {
      res.status(503).json({ error: 'RabbitMQ no disponible' });
    }
  } catch (err) {
    console.error('🔥 Error en el servidor:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- 6. ARRANQUE DEL SERVIDOR ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 User Service ejecutándose en puerto ${PORT}`);
  console.log(`🔑 Keycloak Resource: ${keycloakConfig.resource}`);
});