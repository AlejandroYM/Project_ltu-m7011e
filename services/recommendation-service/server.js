const express = require('express');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const axios = require('axios');
const cors = require('cors');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const USER_SERVICE_URL = 'http://user-service:8000';
const RECIPE_SERVICE_URL = 'http://recipe-service.todo-app.svc.cluster.local:3002';

let userRecommendations = {}; 

// --- CONSUMER RABBITMQ (REQ15) ---
async function startConsuming() {
  try {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq-service:5672');
    const channel = await conn.createChannel();
    await channel.assertQueue('user_updates');

    console.log('📥 Recommendation Service esperando mensajes...');

    channel.consume('user_updates', (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        if (event.action === 'PREFERENCES_UPDATED') {
             console.log(`✅ RabbitMQ: Usuario ${event.userId} actualizó preferencias.`);
        }
        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error('❌ Error RabbitMQ:', err.message);
  }
}

startConsuming();

// --- API REST (REQ14) ---

app.get('/recommendations/:userId', async (req, res) => {
  const { userId } = req.params;
  const queryCategory = req.query.category; // NUEVO: Leemos parámetro de URL

  try {
    let categoryPref = null;

    // 1. PRIORIDAD MÁXIMA: Si el frontend nos dice la categoría explícitamente, la usamos.
    if (queryCategory) {
        categoryPref = queryCategory;
        console.log(`🎯 Categoría forzada por frontend: "${categoryPref}"`);
    } else {
        // 2. Si no, intentamos buscarla en la base de datos (persistencia)
        try {
            const userRes = await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
            const userData = userRes.data;
            
            if (userData.category) categoryPref = userData.category;
            else if (userData.preferences?.category) categoryPref = userData.preferences.category;
            else if (userData.preference) categoryPref = userData.preference;

            if (categoryPref) console.log(`💾 Preferencia recuperada de BD: "${categoryPref}"`);
        } catch (e) {
            console.log("⚠️ No se pudo recuperar preferencia del User Service.");
        }
    }

    // 3. Si DESPUÉS de todo esto no tenemos categoría, devolvemos mensaje de espera (NO receta random)
    if (!categoryPref) {
        return res.json(["Selecciona una categoría para ver tu recomendación."]);
    }

    // 4. Obtener recetas y filtrar
    const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes`);
    const allRecipes = recipesRes.data;

    const safePref = categoryPref.toLowerCase().trim();
    const match = allRecipes.filter(r => 
      r.category && r.category.toLowerCase().trim() === safePref
    );

    if (match.length > 0) {
      // Devolver una receta aleatoria DE ESA CATEGORÍA
      const randomRecipe = match[Math.floor(Math.random() * match.length)];
      res.json([randomRecipe.name]);
    } else {
      // Si pidió "Americana" pero no hay recetas de eso, avisamos
      res.json([`No tenemos recetas de ${categoryPref} todavía.`]);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.json(["Error al obtener recomendación"]);
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'recommendation-service' });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Recommendation Service escuchando en puerto ${PORT}`);
});

module.exports = app;