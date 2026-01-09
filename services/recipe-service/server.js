const express = require('express');
const Keycloak = require('keycloak-connect');
const session = require('express-session');
const amqplib = require('amqplib');
const dotenv = require('dotenv');

// Cargar variables de entorno (.env)
dotenv.config();

const app = express();
app.use(express.json());

// --- 1. CONFIGURACIÓN DE SESIÓN (Requerido por Keycloak-Connect) ---
const memoryStore = new session.MemoryStore();
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_para_desarrollo',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

// --- 2. CONFIGURACIÓN DE RABBITMQ (REQ15 - Event-Driven) ---
let channel;
async function connectRabbit() {
  try {
    // CAMBIO CLAVE: Usamos el nombre del Service de Kubernetes para evitar ETIMEDOUT
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq-service:5672';
    const conn = await amqplib.connect(rabbitUrl);
    channel = await conn.createChannel();
    await channel.assertQueue('user_updates'); 
    console.log('✅ Conectado a RabbitMQ - Service: rabbitmq-service');
  } catch (err) {
    console.error('❌ Error conectando a RabbitMQ:', err.message);
  }
}
connectRabbit();

// --- 3. CONFIGURACIÓN DE KEYCLOAK (REQ20) ---
const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'ChefMatchRealm',
  'auth-server-url': process.env.KEYCLOAK_URL || 'http://localhost:8080/',
  resource: 'user-service',
  'ssl-required': 'external',
  'public-client': true
};

const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);
app.use(keycloak.middleware());

// --- 4. RUTAS DEL MICROSERVICIO (REQ14 - Observabilidad) ---

// Healthcheck para Kubernetes (Indica que el pod está vivo y funcionando)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    service: 'user-service', 
    timestamp: new Date() 
  });
});

// Actualizar preferencias (REQ2 + REQ15)
app.post('/users/preferences', keycloak.protect(), async (req, res) => {
  const { preferences } = req.body;
  const userId = req.kauth.grant.access_token.content.sub;

  if (!preferences) {
    return res.status(400).json({ error: 'Faltan las preferencias' });
  }

  const message = {
    userId: userId,
    newPreferences: preferences,
    action: 'PREFERENCES_UPDATED',
    date: new Date()
  };

  // Enviar evento a la cola para que Recommendation Service lo procese
  if (channel) {
    channel.sendToQueue('user_updates', Buffer.from(JSON.stringify(message)));
    console.log('📢 Evento enviado a RabbitMQ:', message.action);
  }

  res.json({ message: 'Preferencias actualizadas correctamente', data: message });
});

// --- 5. MANEJO DE ERRORES ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    details: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// --- 6. ARRANQUE DEL SERVIDOR ---
// Usamos el puerto 3004 para evitar conflictos en el clúster
const PORT = process.env.PORT || 80; 

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 User Service escuchando en el puerto ${PORT}`);
    console.log(`🔒 Protección Keycloak activada`);
    console.log(`💓 Endpoint de salud disponible en /health`);
  });
}

module.exports = app;