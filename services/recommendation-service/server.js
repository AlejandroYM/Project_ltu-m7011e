const express = require('express');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const axios = require('axios'); // Necesario para pedir datos reales
const cors = require('cors');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Direcciones de los otros servicios en Kubernetes
const USER_SERVICE_URL = 'http://user-service:8000';
// Usamos la dirección completa (FQDN) para evitar errores de conexión
const RECIPE_SERVICE_URL = 'http://recipe-service.todo-app.svc.cluster.local:3002';

// Almacenamiento volátil (se mantiene por si RabbitMQ lo usa, aunque la API priorizará datos frescos)
let userRecommendations = {}; 

// --- CONFIGURACIÓN DE RABBITMQ (REQ15 - Consumer) ---
// Mantenemos esto para cumplir con el requisito académico del proyecto
async function startConsuming() {
  try {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq-service:5672');
    const channel = await conn.createChannel();
    await channel.assertQueue('user_updates');

    console.log('📥 Recommendation Service esperando mensajes en "user_updates"...');

    channel.consume('user_updates', (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        console.log('✨ Nuevo evento recibido por RabbitMQ:', event.action);
        
        // Aunque la API ahora busca datos frescos, mantenemos este log o lógica
        if (event.action === 'PREFERENCES_UPDATED') {
             console.log(`✅ Notificación recibida: El usuario ${event.userId} cambió sus gustos a ${event.newPreferences}`);
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

// Endpoint INTELIGENTE: Busca la preferencia actual y devuelve 1 receta de esa categoría
app.get('/recommendations/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // 1. Preguntar al Servicio de Usuarios cuál es la categoría favorita actual
    let categoryPref = null;
    try {
        const userRes = await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
        // Intentamos leer la preferencia del objeto de respuesta
        categoryPref = userRes.data.preference || userRes.data.category; 
    } catch (e) {
        console.log("⚠️ No se pudo obtener preferencia del User Service, buscando fallback...");
    }

    // 2. Pedir TODAS las recetas al Servicio de Recetas
    const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes`);
    const allRecipes = recipesRes.data;

    let filteredRecipes = allRecipes;

    // 3. Filtrar las recetas según la categoría del usuario (si existe)
    if (categoryPref) {
      console.log(`🔍 Buscando recetas de categoría: ${categoryPref}`);
      const match = allRecipes.filter(r => 
        r.category && r.category.toLowerCase() === categoryPref.toLowerCase()
      );
      // Si encontramos recetas de esa categoría, las usamos. Si no, usamos todas.
      if (match.length > 0) {
        filteredRecipes = match;
      }
    }

    // 4. Seleccionar UNA receta aleatoria
    if (filteredRecipes.length === 0) {
      return res.json(["No hay recetas disponibles."]); // Array con string simple
    }

    const randomRecipe = filteredRecipes[Math.floor(Math.random() * filteredRecipes.length)];

    // Devolvemos un array con UN solo elemento (el nombre de la receta)
    // Esto es lo que el Frontend espera pintar
    res.json([randomRecipe.name]);

  } catch (error) {
    console.error("❌ Error al generar recomendación:", error.message);
    // Fallback en caso de error grave
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