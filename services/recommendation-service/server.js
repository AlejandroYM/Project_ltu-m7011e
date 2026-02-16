process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const mongoose = require('mongoose');
const amqplib = require('amqplib');
const dotenv = require('dotenv');
const axios = require('axios');
const { authenticateJWT } = require('./middleware/auth');
const cors = require('cors');
const Recommendation = require('./models/Recommendation');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const USER_SERVICE_URL = 'http://user-service:8000';
const RECIPE_SERVICE_URL = 'http://recipe-service.todo-app.svc.cluster.local:3002';

// ✅ CONECTAR A MONGODB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongodb:27017/chefmatch', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch((error) => {
  console.error('❌ MongoDB connection error:', error);
});

// --- RABBITMQ CONSUMER (REQ15) ---
async function startConsuming() {
  try {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq-service:5672');
    const channel = await conn.createChannel();
    await channel.assertQueue('user_updates');

    console.log('📥 Recommendation Service waiting for messages...');

    channel.consume('user_updates', async (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        if (event.action === 'PREFERENCES_UPDATED') {
          console.log(`✅ RabbitMQ: User ${event.userId} updated preferences.`);
          
          // ✅ Regenerar recomendaciones cuando cambian preferencias
          await generateRecommendationsForUser(event.userId);
        }
        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error('❌ RabbitMQ Error:', err.message);
  }
}

startConsuming();

// ✅ FUNCIÓN PARA GENERAR Y GUARDAR RECOMENDACIONES
async function generateRecommendationsForUser(userId) {
  try {
    console.log(`🔄 Generating recommendations for user ${userId}`);
    
    // Obtener preferencias del usuario
    let categoryPref = null;
    try {
      const userRes = await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
      const userData = userRes.data;
      
      if (userData.category) categoryPref = userData.category;
      else if (userData.preferences?.category) categoryPref = userData.preferences.category;
      else if (userData.preference) categoryPref = userData.preference;
    } catch (e) {
      console.log(`⚠️ Could not get preferences for user ${userId}`);
      return;
    }

    if (!categoryPref) {
      console.log(`⚠️ No category preference found for user ${userId}`);
      return;
    }

    // Obtener recetas de esa categoría
    const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes`);
    const allRecipes = recipesRes.data;
    
    const safePref = categoryPref.toLowerCase().trim();
    const matchingRecipes = allRecipes.filter(r => 
      r.category && r.category.toLowerCase().trim() === safePref
    );

    if (matchingRecipes.length === 0) {
      console.log(`⚠️ No recipes found for category ${categoryPref}`);
      return;
    }

    // Eliminar recomendaciones antiguas del usuario
    await Recommendation.deleteMany({ userId });

    // Guardar nuevas recomendaciones (top 5)
    const recommendations = matchingRecipes.slice(0, 5).map((recipe, index) => ({
      userId,
      recipeName: recipe.name,
      recipeId: recipe._id || recipe.id,
      category: categoryPref,
      score: 100 - (index * 5),
      reason: 'preference_match'
    }));

    await Recommendation.insertMany(recommendations, { ordered: false })
      .catch(err => {
        if (err.code !== 11000) throw err; // Ignorar duplicados
      });

    console.log(`✅ Generated ${recommendations.length} recommendations for user ${userId}`);
  } catch (error) {
    console.error(`❌ Error generating recommendations:`, error.message);
  }
}

// --- REST API (REQ14) ---

// ✅ OBTENER RECOMENDACIONES DESDE MONGODB
app.get('/recommendations/:userId', authenticateJWT, async (req, res) => {
  const { userId } = req.params;
  const queryCategory = req.query.category;

  try {
    // Si el frontend fuerza una categoría, regenerar recomendaciones
    if (queryCategory) {
      console.log(`🎯 Category forced by frontend: "${queryCategory}"`);
      
      // Actualizar preferencia del usuario (opcional)
      // Luego generar recomendaciones para esa categoría
      const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes`);
      const allRecipes = recipesRes.data;
      
      const safePref = queryCategory.toLowerCase().trim();
      const match = allRecipes.filter(r => 
        r.category && r.category.toLowerCase().trim() === safePref
      );

      if (match.length > 0) {
        const randomRecipe = match[Math.floor(Math.random() * match.length)];
        return res.json([randomRecipe.name]);
      } else {
        return res.json([`We don't have recipes for ${queryCategory} yet.`]);
      }
    }

    // ✅ Obtener recomendaciones desde MongoDB
    const recommendations = await Recommendation.find({ userId })
      .sort({ score: -1 })
      .limit(5)
      .lean();

    if (recommendations.length > 0) {
      // Retornar nombres de recetas recomendadas
      const recipeNames = recommendations.map(r => r.recipeName);
      console.log(`💾 Returning ${recipeNames.length} recommendations from MongoDB`);
      return res.json(recipeNames);
    }

    // Si no hay recomendaciones guardadas, generarlas
    console.log(`🔄 No recommendations found, generating for user ${userId}`);
    await generateRecommendationsForUser(userId);
    
    // Intentar obtenerlas de nuevo
    const newRecommendations = await Recommendation.find({ userId })
      .sort({ score: -1 })
      .limit(5)
      .lean();

    if (newRecommendations.length > 0) {
      return res.json(newRecommendations.map(r => r.recipeName));
    }

    // Si aún no hay, pedir que seleccione categoría
    return res.json(["Select a category to see your recommendation."]);

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.json(["Error fetching recommendation"]);
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'recommendation-service' });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Recommendation Service listening on port ${PORT}`);
});

module.exports = app;
