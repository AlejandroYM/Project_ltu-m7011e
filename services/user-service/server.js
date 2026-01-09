const express = require('express');
const Keycloak = require('keycloak-connect');
const session = require('express-session');
const amqplib = require('amqplib');
const dotenv = require('dotenv');

// Cargar variables de entorno
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

// --- 2. CONFIGURACIÓN DE RABBITMQ (REQ15) ---
let channel;
async function connectRabbit() {
  try {
    // En K8s usa amqp://rabbitmq-service:5672
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    channel = await conn.createChannel();
    await channel.assertQueue('user_updates'); 
    console.log('✅ Conectado a RabbitMQ - Cola: user_updates');
  } catch (err) {
    console.error('❌ Error conectando a RabbitMQ:', err.message);
    // Reintentar conexión tras 5 segundos
    setTimeout(connectRabbit, 5000);
  }
}
connectRabbit();

// --- 3. CONFIGURACIÓN DE KEYCLOAK (Bearer-only para APIs) ---
const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'ChefMatchRealm',
  'auth-server-url': process.env.KEYCLOAK_URL || 'https://keycloak.ltu-m7011e-5.se',
  resource: 'user-service',
  'bearer-only': true  // VITAL: Evita redirecciones 302 en peticiones API
};

const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);
app.use(keycloak.middleware());

// --- 4. RUTAS ---

// Healthcheck para Kubernetes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'user-service', timestamp: new Date() });
});

// Actualizar preferencias (REQ2 + REQ15)
app.post('/users/preferences', keycloak.protect(), async (req, res) => {
  // Aceptamos 'category' (del nuevo frontend) o 'preferences' (del viejo)
  const preferences = req.body.category || req.body.preferences;
  const userId = req.kauth.grant.access_token.content.sub;

  if (!preferences) {
    console.log('⚠️ Petición recibida sin preferencias en body:', req.body);
    return res.status(400).json({ error: 'Faltan las preferencias (category o preferences)' });
  }

  const message = {
    userId: userId,
    newPreferences: preferences,
    action: 'PREFERENCES_UPDATED',
    date: new Date()
  };

  if (channel) {
    try {
      channel.sendToQueue('user_updates', Buffer.from(JSON.stringify(message)));
      console.log('📢 Evento enviado a RabbitMQ:', message.action, 'para user:', userId);
      res.json({ message: 'Preferencias actualizadas correctamente', data: message });
    } catch (sendErr) {
      console.error('❌ Error al enviar a RabbitMQ:', sendErr);
      res.status(500).json({ error: 'Error al procesar el evento de mensajería' });
    }
  } else {
    console.error('❌ RabbitMQ no está disponible');
    res.status(503).json({ error: 'Servicio de mensajería no disponible temporalmente' });
  }
});

// --- 5. MANEJO DE ERRORES ---
app.use((err, req, res, next) => {
  console.error('🔥 Error detectado:', err.stack);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    details: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// --- 6. ARRANQUE DEL SERVIDOR ---
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 User Service ejecutándose en puerto ${PORT}`);
  console.log(`🔑 Keycloak URL: ${keycloakConfig['auth-server-url']}`);
});