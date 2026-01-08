const express = require('express');
const amqplib = require('amqplib');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
app.use(express.json());

// Almacenamiento volátil para las recomendaciones generadas
let userRecommendations = {}; 

// --- CONFIGURACIÓN DE RABBITMQ (REQ15 - Consumer) ---
async function startConsuming() {
  try {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq-service:5672');
    const channel = await conn.createChannel();
    await channel.assertQueue('user_updates');

    console.log('📥 Recommendation Service esperando mensajes en "user_updates"...');

    channel.consume('user_updates', (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        console.log('✨ Nuevo evento recibido:', event.action);

        // LÓGICA DINÁMICA (REQ2): 
        // Si el usuario cambió preferencias, generamos nuevas recomendaciones
        if (event.action === 'PREFERENCES_UPDATED') {
          userRecommendations[event.userId] = [
            `Receta basada en tus nuevos gustos: ${event.newPreferences}`,
            "Sugerencia del día: Ensalada César",
            "Popular en tu zona: Tacos al Pastor"
          ];
          console.log(`✅ Recomendaciones actualizadas para usuario: ${event.userId}`);
        }
        
        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error('❌ Error en el Consumer de RabbitMQ:', err.message);
  }
}

startConsuming();

// --- API REST (REQ14) ---

// Endpoint para que el Frontend pida las recomendaciones de un usuario
app.get('/api/recommendations/:userId', (req, res) => {
  const userId = req.params.userId;
  const recommendations = userRecommendations[userId] || ["Explora nuestras recetas populares"];
  res.json({ userId, recommendations });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'recommendation-service' });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Recommendation Service escuchando en puerto ${PORT}`);
});

module.exports = app;