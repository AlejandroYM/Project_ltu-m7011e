process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { authenticateJWT, optionalAuthJWT } = require('./middleware/auth');
const client = require('prom-client'); 
const multer = require('multer');
const Minio = require('minio');
const amqplib = require('amqplib');

const app = express();
app.use(cors());
app.use(express.json());
const Recipe = require('./models/Recipe');
const MealPlan = require('./models/MealPlan');
require('dotenv').config();

// ============================================
// CONFIGURACIÓN DE MINIO
// ============================================
const minioClient = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'admin1234'
});

minioClient.bucketExists('recipes', function(err, exists) {
  if (err) {
    console.log('Esperando a MinIO...');
  } else if (!exists) {
    minioClient.makeBucket('recipes', 'us-east-1', function(err) {
      if (err) console.log('Error creando bucket en MinIO', err);
      else console.log('Bucket "recipes" creado exitosamente en MinIO');
    });
  }
});

const upload = multer({ storage: multer.memoryStorage() });

// ============================================
// MÉTRICAS PROMETHEUS
// ============================================
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestErrors = new client.Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'status_code', 'error_type']
});

app.use((req, res, next) => {
  const start = Date.now();
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const statusCode = res.statusCode;
    httpRequestDuration.labels(method, route, statusCode).observe(duration);
    httpRequestTotal.labels(method, route, statusCode).inc();
    if (statusCode >= 400) {
      const errorType = statusCode >= 500 ? 'server_error' : 'client_error';
      httpRequestErrors.labels(method, route, statusCode, errorType).inc();
    }
    originalEnd.apply(res, args);
  };
  next();
});

// ============================================
// MONGODB
// ============================================
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chefmatch')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('DB Error:', err));

// ============================================
// RABBITMQ — escuchar eventos de usuarios
// ============================================
async function listenForUserEvents() {
  try {
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
    const conn = await amqplib.connect(rabbitUrl);
    const channel = await conn.createChannel();
    await channel.assertQueue('user_events');
    console.log('🎧 Recipe Service escuchando eventos de usuarios en RabbitMQ...');
    channel.consume('user_events', async (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        if (event.action === 'USER_DELETED') {
          console.log(`🗑️ Eliminando recetas y planes del usuario: ${event.userId}`);
          await Recipe.deleteMany({ userId: event.userId });
          await MealPlan.deleteMany({ userId: event.userId });
        }
        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error('Error conectando RabbitMQ en recipe-service:', err.message);
    setTimeout(listenForUserEvents, 5000);
  }
}
listenForUserEvents();

// ============================================
// ✅ FUNCIÓN: GENERAR PLAN MENSUAL DESDE DB
// ============================================
async function generateMealPlanFromDB(userId, monthNum, yearNum, category) {
  let allRecipes = [];
  if (category && category !== 'Mixed') {
    allRecipes = await Recipe.find({ category }).lean();
  } else {
    allRecipes = await Recipe.find().lean();
  }

  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const getRecipePool = (count) => {
    if (allRecipes.length === 0) return Array(count).fill({ name: 'No recipes available', category });
    let pool = [];
    while (pool.length < count) {
      pool = [...pool, ...shuffle(allRecipes)];
    }
    return pool.slice(0, count);
  };

  const lunchPool  = getRecipePool(daysInMonth);
  const dinnerPool = getRecipePool(daysInMonth);

  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    let lunchRecipe  = lunchPool[day - 1];
    let dinnerRecipe = dinnerPool[day - 1];

    if (lunchRecipe.name === dinnerRecipe.name && allRecipes.length > 1) {
      const alternative = allRecipes.find(r => r.name !== lunchRecipe.name);
      if (alternative) dinnerRecipe = alternative;
    }

    days.push({
      dayNumber: day,
      lunch: {
        recipeId:   lunchRecipe._id || String(day),
        recipeName: lunchRecipe.name,
        category:   lunchRecipe.category || category
      },
      dinner: {
        recipeId:   dinnerRecipe._id || String(day + 100),
        recipeName: dinnerRecipe.name,
        category:   dinnerRecipe.category || category
      }
    });
  }

  return new MealPlan({ userId, month: monthNum, year: yearNum, category: category || 'Mixed', days });
}

// ============================================
// RECIPE ENDPOINTS
// ============================================

// GET /recipes — soporte para filtro de valoración (?sort=rating_asc|rating_desc)
app.get('/recipes', optionalAuthJWT, async (req, res) => {
  try {
    const { sort } = req.query;
    let query = Recipe.find();
    if (sort === 'rating_desc') query = query.sort({ averageRating: -1 });
    else if (sort === 'rating_asc')  query = query.sort({ averageRating:  1 });
    const recipes = await query.exec();
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching recipes' });
  }
});

app.post('/recipes/upload-image', authenticateJWT, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen' });
  const fileName = Date.now() + '-' + req.file.originalname.replace(/\s+/g, '-');
  minioClient.putObject('recipes', fileName, req.file.buffer, function(err) {
    if (err) {
      console.error('Error MinIO:', err);
      return res.status(500).json({ error: 'Error subiendo imagen al servidor' });
    }
    const imageUrl = `http://localhost:9000/recipes/${fileName}`;
    res.json({ imageUrl });
  });
});

app.post('/recipes', authenticateJWT, async (req, res) => {
  try {
    const recipeData = { ...req.body, userId: req.user.sub };
    const newRecipe = new Recipe(recipeData);
    await newRecipe.save();
    res.status(201).json(newRecipe);
  } catch (err) {
    console.error('Error saving recipe:', err);
    res.status(400).json({ error: "Error saving the recipe", details: err.message });
  }
});

// ============================================
// ✅ DELETE — solo el autor puede borrar su receta
// ============================================
app.delete('/recipes/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(403).json({ error: "Cannot delete static or non-existent recipes" });
    }

    const recipe = await Recipe.findById(id);

    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    // Solo el creador puede eliminarla
    if (recipe.userId !== req.user.sub) {
      return res.status(403).json({ error: "You can only delete recipes you have created" });
    }

    await Recipe.findByIdAndDelete(id);
    res.status(200).json({ message: "Recipe deleted successfully" });

  } catch (err) {
    res.status(500).json({ error: "Error deleting recipe" });
  }
});

// ============================================
// ✅ RATING — POST /recipes/:id/rate
//    body: { score: 0–10 }
//    Cada usuario solo puede valorar una vez
// ============================================
app.post('/recipes/:id/rate', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { score } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid recipe id" });
    }

    const parsedScore = Number(score);
    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10) {
      return res.status(400).json({ error: "Score must be a number between 0 and 10" });
    }

    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ error: "Recipe not found" });

    const userId = req.user.sub;
    const existingIndex = recipe.ratings.findIndex(r => r.userId === userId);

    if (existingIndex !== -1) {
      return res.status(409).json({ error: "You have already rated this recipe" });
    }

    recipe.ratings.push({ userId, score: parsedScore });
    await recipe.save(); // el pre-save hook recalcula averageRating y ratingCount

    res.json({
      message: "Rating saved",
      averageRating: recipe.averageRating,
      ratingCount:   recipe.ratingCount
    });

  } catch (err) {
    console.error('Error rating recipe:', err);
    res.status(500).json({ error: "Error saving rating" });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'recipe-service' });
});

// ============================================
// MEAL PLAN ENDPOINTS
// ============================================

app.get('/meal-plans/:userId/:month/:year', authenticateJWT, async (req, res) => {
  try {
    const { userId, month, year } = req.params;
    const { category } = req.query;

    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const monthNum = parseInt(month);
    const yearNum  = parseInt(year);

    if (monthNum < 1 || monthNum > 12 || yearNum < 2024 || yearNum > 2030) {
      return res.status(400).json({ error: 'Invalid month or year' });
    }

    let mealPlan = await MealPlan.findOne({ userId, month: monthNum, year: yearNum });

    if (mealPlan && category && mealPlan.category !== category) {
      console.log(`🔄 Category changed to ${category}, regenerating meal plan...`);
      await MealPlan.deleteOne({ _id: mealPlan._id });
      mealPlan = null;
    }

    if (!mealPlan) {
      const planCategory = category || 'Mixed';
      console.log(`📅 Generating meal plan from DB for ${userId}: ${monthNum}/${yearNum} (${planCategory})`);
      mealPlan = await generateMealPlanFromDB(userId, monthNum, yearNum, planCategory);
      await mealPlan.save();
    }

    res.json(mealPlan);
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/meal-plans', authenticateJWT, async (req, res) => {
  try {
    const { userId, month, year, category, days } = req.body;

    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!userId || !month || !year) {
      return res.status(400).json({ error: 'Missing required fields: userId, month, year' });
    }

    let mealPlan = await MealPlan.findOne({ userId, month, year });

    if (mealPlan) {
      if (category) mealPlan.category = category;
      if (days) mealPlan.days = days;
      mealPlan.updatedAt = new Date();
      await mealPlan.save();
    } else {
      if (days) {
        mealPlan = new MealPlan({ userId, month, year, category: category || 'Mixed', days });
      } else {
        mealPlan = await generateMealPlanFromDB(userId, month, year, category || 'Mixed');
      }
      await mealPlan.save();
    }

    res.status(201).json(mealPlan);
  } catch (error) {
    console.error('Error creating meal plan:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Meal plan already exists for this month' });
    }
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.put('/meal-plans/:id/day/:dayNumber', authenticateJWT, async (req, res) => {
  try {
    const { id, dayNumber } = req.params;
    const { lunch, dinner, notes } = req.body;

    const mealPlan = await MealPlan.findById(id);
    if (!mealPlan) return res.status(404).json({ error: 'Meal plan not found' });
    if (mealPlan.userId !== req.user.sub) return res.status(403).json({ error: 'Access denied' });

    const dayIndex = mealPlan.days.findIndex(d => d.dayNumber === parseInt(dayNumber));
    if (dayIndex === -1) {
      mealPlan.days.push({ dayNumber: parseInt(dayNumber), lunch, dinner, notes });
    } else {
      if (lunch)              mealPlan.days[dayIndex].lunch  = lunch;
      if (dinner)             mealPlan.days[dayIndex].dinner = dinner;
      if (notes !== undefined) mealPlan.days[dayIndex].notes = notes;
    }

    mealPlan.updatedAt = new Date();
    await mealPlan.save();
    res.json(mealPlan);
  } catch (error) {
    console.error('Error updating day:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/meal-plans/:id', authenticateJWT, async (req, res) => {
  try {
    const mealPlan = await MealPlan.findById(req.params.id);
    if (!mealPlan) return res.status(404).json({ error: 'Meal plan not found' });
    if (mealPlan.userId !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    await MealPlan.findByIdAndDelete(req.params.id);
    res.json({ message: 'Meal plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting meal plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/meal-plans/:id/day/:dayNumber', authenticateJWT, async (req, res) => {
  try {
    const { id, dayNumber } = req.params;
    const mealPlan = await MealPlan.findById(id);
    if (!mealPlan) return res.status(404).json({ error: 'Meal plan not found' });
    if (mealPlan.userId !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    mealPlan.days = mealPlan.days.filter(d => d.dayNumber !== parseInt(dayNumber));
    mealPlan.updatedAt = new Date();
    await mealPlan.save();
    res.json(mealPlan);
  } catch (error) {
    console.error('Error deleting day:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/meal-plans/user/:userId', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.sub !== userId) return res.status(403).json({ error: 'Access denied' });
    const mealPlans = await MealPlan.find({ userId }).sort({ year: -1, month: -1 });
    res.json(mealPlans);
  } catch (error) {
    console.error('Error fetching meal plans:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// PROMETHEUS METRICS
// ============================================
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

module.exports = app;
