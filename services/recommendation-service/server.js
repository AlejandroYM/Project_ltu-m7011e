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

// Almacenamiento volátil (Legacy RabbitMQ)
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
             console.log(`✅ RabbitMQ: Usuario ${event.userId} prefiere ahora ${event.newPreferences}`);
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

  try {
    // 1. Obtener datos del usuario
    let categoryPref = null;
    try {
        const userRes = await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
        const userData = userRes.data;
        
        console.log(`👤 Datos recibidos del usuario ${userId}:`, JSON.stringify(userData));

        // LÓGICA ROBUSTA: Buscamos la categoría en todos los sitios posibles
        if (userData.category) {
            categoryPref = userData.category;
        } else if (userData.preferences && userData.preferences.category) {
            categoryPref = userData.preferences.category;
        } else if (userData.preference) {
            categoryPref = userData.preference;
        }

        if (categoryPref) console.log(`🎯 Preferencia detectada: "${categoryPref}"`);
        else console.log("⚠️ No se encontró preferencia en el objeto de usuario.");

    } catch (e) {
        console.log("⚠️ Error al consultar User Service:", e.message);
    }

    // 2. Obtener todas las recetas
    const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes`);
    const allRecipes = recipesRes.data;

    // 3. Filtrar
    let filteredRecipes = allRecipes;
    
    if (categoryPref) {
      // Normalizamos a minúsculas para evitar errores de "Italiana" vs "italiana"
      const safePref = categoryPref.toLowerCase().trim();
      
      const match = allRecipes.filter(r => 
        r.category && r.category.toLowerCase().trim() === safePref
      );

      if (match.length > 0) {
        console.log(`✅ Se encontraron ${match.length} recetas de categoría ${safePref}`);
        filteredRecipes = match;
      } else {
        console.log(`⚠️ El usuario quiere ${safePref} pero no hay recetas de ese tipo. Usando todas.`);
      }
    }

    // 4. Elegir una receta
    if (filteredRecipes.length === 0) {
      return res.json(["No hay recetas disponibles."]);
    }

    const randomRecipe = filteredRecipes[Math.floor(Math.random() * filteredRecipes.length)];
    
    // Retornamos array con 1 elemento
    res.json([randomRecipe.name]);

  } catch (error) {
    console.error("❌ Error CRÍTICO en recomendador:", error.message);
    res.json(["Sugerencia del Chef"]);
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