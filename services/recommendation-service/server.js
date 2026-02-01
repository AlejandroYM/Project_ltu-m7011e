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

// --- RABBITMQ CONSUMER (REQ15) ---
async function startConsuming() {
  try {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq-service:5672');
    const channel = await conn.createChannel();
    await channel.assertQueue('user_updates');

    console.log('📥 Recommendation Service waiting for messages...');

    channel.consume('user_updates', (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        if (event.action === 'PREFERENCES_UPDATED') {
             console.log(`✅ RabbitMQ: User ${event.userId} updated preferences.`);
        }
        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error('❌ RabbitMQ Error:', err.message);
  }
}

startConsuming();

// --- REST API (REQ14) ---

app.get('/recommendations/:userId', async (req, res) => {
  const { userId } = req.params;
  const queryCategory = req.query.category; // NEW: Read URL parameter

  try {
    let categoryPref = null;

    // 1. TOP PRIORITY: If frontend explicitly gives category, use it.
    if (queryCategory) {
        categoryPref = queryCategory;
        console.log(`🎯 Category forced by frontend: "${categoryPref}"`);
    } else {
        // 2. If not, try to fetch it from database (persistence)
        try {
            const userRes = await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
            const userData = userRes.data;
            
            if (userData.category) categoryPref = userData.category;
            else if (userData.preferences?.category) categoryPref = userData.preferences.category;
            else if (userData.preference) categoryPref = userData.preference;

            if (categoryPref) console.log(`💾 Preference retrieved from DB: "${categoryPref}"`);
        } catch (e) {
            console.log("⚠️ Could not retrieve preference from User Service.");
        }
    }

    // 3. If AFTER all this we don't have a category, return waiting message (NOT random recipe)
    if (!categoryPref) {
        return res.json(["Select a category to see your recommendation."]);
    }

    // 4. Get recipes and filter
    const recipesRes = await axios.get(`${RECIPE_SERVICE_URL}/recipes`);
    const allRecipes = recipesRes.data;

    const safePref = categoryPref.toLowerCase().trim();
    const match = allRecipes.filter(r => 
      r.category && r.category.toLowerCase().trim() === safePref
    );

    if (match.length > 0) {
      // Return a random recipe FROM THAT CATEGORY
      const randomRecipe = match[Math.floor(Math.random() * match.length)];
      res.json([randomRecipe.name]);
    } else {
      // If user asked for "American" but no recipes exist, warn
      res.json([`We don't have recipes for ${categoryPref} yet.`]);
    }

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