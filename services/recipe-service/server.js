process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { authenticateJWT, optionalAuthJWT } = require('./middleware/auth');
const client = require('prom-client'); 

// --- NUEVO: Librerías para subida de imágenes y RabbitMQ ---
const multer = require('multer');
const Minio = require('minio');
const amqplib = require('amqplib'); // <-- Añadido para escuchar la baja de usuarios

const app = express();
app.use(cors());
app.use(express.json());
const Recipe = require('./models/Recipe');
const MealPlan = require('./models/MealPlan');
require('dotenv').config();

// ============================================
// CONFIGURACIÓN DE MINIO (IMÁGENES)
// ============================================
const minioClient = new Minio.Client({
  endPoint: 'minio', // Este es el nombre del contenedor en docker-compose
  port: 9000,
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'admin1234'
});

// Crear el "bucket" para guardar las fotos si no existe
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

// Configurar multer para recibir la imagen
const upload = multer({ storage: multer.memoryStorage() });


// ============================================
// Enhanced metrics for Four Golden Signals
// ============================================
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// LATENCY - Response time histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

// TRAFFIC - Request counter
const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// ERRORS - Error counter
const httpRequestErrors = new client.Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'status_code', 'error_type']
});

// Middleware
app.use((req, res, next) => {
  const start = Date.now();
  const originalEnd = res.end;
  
  res.end = function(...args) {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const statusCode = res.statusCode;
    
    // Record metrics
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
// ----------------------------------------

// Static recipes
const staticRecipes = [
  { id: 1, name: 'Carbonara Pasta', category: 'Italian', description: 'The authentic Roman recipe without cream.', ingredients: ['400g Spaghetti', '150g Guanciale or Pancetta', '4 Egg yolks', '100g Pecorino Cheese', 'Black pepper'], instructions: '1. Boil the pasta. \n2. Sauté the guanciale until crispy. \n3. Beat the yolks with the cheese and lots of pepper. \n4. Mix the hot pasta with the egg mixture off the heat to create the cream.', cookingTime: 20 },
  { id: 2, name: 'Margherita Pizza', category: 'Italian', description: 'The classic Neapolitan pizza.', ingredients: ['Pizza dough', 'San Marzano tomato sauce', 'Fresh Mozzarella', 'Fresh Basil', 'Olive oil'], instructions: '1. Stretch the dough. \n2. Add tomato and mozzarella. \n3. Bake at maximum temperature (250°C) for 10-15 min. \n4. Add fresh basil upon serving.', cookingTime: 45 },
  { id: 3, name: 'Tacos al Pastor', category: 'Mexican', description: 'Marinated pork tacos with pineapple.', ingredients: ['Corn tortillas', '500g Pork loin', 'Pineapple', 'Cilantro and Onion', 'Achiote paste'], instructions: '1. Marinate the meat with achiote and spices. \n2. Grill the meat with the pineapple. \n3. Heat the tortillas. \n4. Serve with cilantro, onion, and salsa.', cookingTime: 60 },
  { id: 4, name: 'Traditional Guacamole', category: 'Mexican', description: 'The perfect side dish.', ingredients: ['3 Ripe avocados', '1 Tomato', '1/2 Onion', 'Cilantro', 'Lime juice', 'Salt'], instructions: '1. Mash the avocados. \n2. Finely chop onion, tomato, and cilantro. \n3. Mix everything with lime juice and salt to taste.', cookingTime: 10 },
  { id: 5, name: 'Chickpea Curry', category: 'Vegan', description: 'Dish rich in protein and spices.', ingredients: ['400g Cooked chickpeas', 'Coconut milk', 'Spinach', 'Curry powder', 'Garlic and Ginger'], instructions: '1. Sauté garlic and ginger. \n2. Add spices and chickpeas. \n3. Pour coconut milk and cook for 10 min. \n4. Add spinach at the end.', cookingTime: 25 },
  { id: 6, name: 'Buddha Bowl', category: 'Vegan', description: 'Nutritious and colorful bowl.', ingredients: ['Quinoa', 'Marinated Tofu', 'Avocado', 'Grated Carrot', 'Tahini Sauce'], instructions: '1. Cook the quinoa. \n2. Sauté the tofu. \n3. Chop the vegetables. \n4. Assemble the bowl and dress with tahini.', cookingTime: 30 },
  { id: 7, name: 'Sushi Maki Roll', category: 'Japanese', description: 'Homemade sushi rolls.', ingredients: ['Sushi rice', 'Nori sheets', 'Salmon or Cucumber', 'Rice vinegar', 'Soy sauce'], instructions: '1. Cook and season the rice. \n2. Spread rice on the seaweed. \n3. Add filling and roll with a mat. \n4. Cut into 6-8 pieces.', cookingTime: 50 },
  { id: 8, name: 'Chicken Ramen', category: 'Japanese', description: 'Comforting soup with noodles.', ingredients: ['Chicken broth', 'Ramen noodles', 'Chicken breast', 'Boiled egg', 'Chives'], instructions: '1. Heat the broth with soy and miso. \n2. Cook noodles separately. \n3. Assemble the bowl with broth, noodles, and toppings (chicken, egg, chives).', cookingTime: 60 },
  { id: 9, name: 'Classic Burger', category: 'American', description: 'Juicy burger with cheddar cheese.', ingredients: ['Ground beef', 'Brioche bun', 'Cheddar Cheese', 'Lettuce and Tomato', 'Pickles'], instructions: '1. Form patties loosely. \n2. Grill 3 min per side. \n3. Melt cheese on top. \n4. Toast the bun and assemble with veggies.', cookingTime: 20 },
  { id: 10, name: 'BBQ Ribs', category: 'American', description: 'Pork ribs in barbecue sauce.', ingredients: ['Pork ribs', 'Homemade BBQ sauce', 'Smoked paprika', 'Honey', 'Garlic powder'], instructions: '1. Rub ribs with dry spices. \n2. Bake at low temp (150°C) for 2 hours wrapped in foil. \n3. Uncover, brush with BBQ sauce and broil for 15 min.', cookingTime: 140 },
  { id: 11, name: 'Tiramisu', category: 'Desserts', description: 'Italian coffee and mascarpone dessert.', ingredients: ['Ladyfingers', 'Mascarpone Cheese', 'Strong espresso coffee', 'Cocoa powder', 'Sugar'], instructions: '1. Beat mascarpone with sugar. \n2. Dip ladyfingers in coffee. \n3. Layer ladyfingers and cream alternately. \n4. Dust with cocoa at the end.', cookingTime: 30 },
  { id: 12, name: 'Strawberry Cheesecake', category: 'Desserts', description: 'Smooth cheese cake with fruit.', ingredients: ['Digestive biscuits', 'Butter', 'Cream cheese', 'Whipping cream', 'Strawberry jam'], instructions: '1. Crush biscuits with butter for the base. \n2. Beat cheese and cream and pour over the base. \n3. Refrigerate for at least 4 hours. \n4. Top with jam before serving.', cookingTime: 240 }
];

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chefmatch')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('DB Error:', err));


// ============================================
// ESCUCHADOR DE EVENTOS DE USUARIO (RABBITMQ)
// ============================================
async function listenForUserEvents() {
  try {
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
    const conn = await amqplib.connect(rabbitUrl);
    const channel = await conn.createChannel();
    
    // Cola dedicada a eventos importantes del usuario
    await channel.assertQueue('user_events');
    console.log('🎧 Recipe Service escuchando eventos de usuarios en RabbitMQ...');
    
    channel.consume('user_events', async (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        
        // Si el evento es que se borró un usuario, borramos sus recetas y planes de comida
        if (event.action === 'USER_DELETED') {
          console.log(`🗑️ Eliminando en cascada las recetas del usuario: ${event.userId}`);
          await Recipe.deleteMany({ userId: event.userId });
          await MealPlan.deleteMany({ userId: event.userId }); // También borramos sus planes de comida
        }
        
        channel.ack(msg); // Confirmar que procesamos el mensaje
      }
    });
  } catch (err) {
    console.error('Error conectando RabbitMQ en recipe-service:', err.message);
    setTimeout(listenForUserEvents, 5000); // Reintentar si falla
  }
}
listenForUserEvents();


// ============================================
// RECIPE ENDPOINTS
// ============================================

// GET /recipes - public (optionalAuth)
app.get('/recipes', optionalAuthJWT, async (req, res) => {
  try {
    const dynamicRecipes = await Recipe.find();
    res.json([...staticRecipes, ...dynamicRecipes]);
  } catch (err) {
    res.json(staticRecipes);
  }
});

// --- NUEVO ENDPOINT: SUBIR IMAGEN ---
app.post('/recipes/upload-image', authenticateJWT, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen' });

  // Nombre único para la foto
  const fileName = Date.now() + '-' + req.file.originalname.replace(/\s+/g, '-');

  // Subir a MinIO
  minioClient.putObject('recipes', fileName, req.file.buffer, function(err, etag) {
    if (err) {
      console.error('Error MinIO:', err);
      return res.status(500).json({ error: 'Error subiendo imagen al servidor' });
    }
    
    // Generar URL pública
    const imageUrl = `http://localhost:9000/recipes/${fileName}`;
    res.json({ imageUrl: imageUrl });
  });
});

// POST /recipes - ✅ REQUIRES AUTHENTICATION (REQ5)
app.post('/recipes', authenticateJWT, async (req, res) => {
  try {
    // NUEVO: Añadimos el ID del usuario sacado del JWT al crear la receta
    const recipeData = {
      ...req.body,
      userId: req.user.sub 
    };
    const newRecipe = new Recipe(recipeData);
    await newRecipe.save();
    res.status(201).json(newRecipe);
  } catch (err) {
    console.error('Error saving recipe:', err);
    res.status(400).json({ 
      error: "Error saving the recipe",
      details: err.message
    });
  }
});

// DELETE /recipes/:id - ✅ REQUIRES AUTHENTICATION (REQ5)
app.delete('/recipes/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (mongoose.Types.ObjectId.isValid(id)) {
      const deleted = await Recipe.findByIdAndDelete(id);
      if (deleted) {
        return res.status(200).json({ message: "Recipe deleted successfully" });
      }
    }

    res.status(403).json({ error: "Cannot delete static or non-existent recipes" });

  } catch (err) {
    res.status(500).json({ error: "Error deleting recipe" });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'recipe-service' });
});

// ============================================
// MEAL PLAN ENDPOINTS
// ============================================

// GET /meal-plans/:userId/:month/:year - Get or create meal plan for a month
app.get('/meal-plans/:userId/:month/:year', authenticateJWT, async (req, res) => {
  try {
    const { userId, month, year } = req.params;
    const { category } = req.query;
    
    // Verify user is requesting their own meal plan
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Validate month and year
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    if (monthNum < 1 || monthNum > 12 || yearNum < 2024 || yearNum > 2030) {
      return res.status(400).json({ error: 'Invalid month or year' });
    }
    
    // Try to find existing meal plan
    let mealPlan = await MealPlan.findOne({ userId, month: monthNum, year: yearNum });
    
    // If doesn't exist, create default one
    if (!mealPlan) {
      const planCategory = category || 'Mixed';
      mealPlan = MealPlan.generateDefaultPlan(userId, monthNum, yearNum, planCategory);
      await mealPlan.save();
      console.log(`📅 Created new meal plan for ${userId}: ${monthNum}/${yearNum}`);
    }
    
    res.json(mealPlan);
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /meal-plans - Create or update meal plan
app.post('/meal-plans', authenticateJWT, async (req, res) => {
  try {
    const { userId, month, year, category, days } = req.body;
    
    // Verify user is creating their own meal plan
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Validate required fields
    if (!userId || !month || !year) {
      return res.status(400).json({ error: 'Missing required fields: userId, month, year' });
    }
    
    // Find and update or create new
    let mealPlan = await MealPlan.findOne({ userId, month, year });
    
    if (mealPlan) {
      // Update existing
      if (category) mealPlan.category = category;
      if (days) mealPlan.days = days;
      mealPlan.updatedAt = new Date();
      await mealPlan.save();
      console.log(`📝 Updated meal plan for ${userId}: ${month}/${year}`);
    } else {
      // Create new
      if (days) {
        mealPlan = new MealPlan({ userId, month, year, category: category || 'Mixed', days });
      } else {
        mealPlan = MealPlan.generateDefaultPlan(userId, month, year, category || 'Mixed');
      }
      await mealPlan.save();
      console.log(`📅 Created meal plan for ${userId}: ${month}/${year}`);
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

// PUT /meal-plans/:id/day/:dayNumber - Update specific day in meal plan
app.put('/meal-plans/:id/day/:dayNumber', authenticateJWT, async (req, res) => {
  try {
    const { id, dayNumber } = req.params;
    const { lunch, dinner, notes } = req.body;
    
    const mealPlan = await MealPlan.findById(id);
    
    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    
    // Verify user owns this meal plan
    if (mealPlan.userId !== req.user.sub) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Find the day to update
    const dayIndex = mealPlan.days.findIndex(d => d.dayNumber === parseInt(dayNumber));
    
    if (dayIndex === -1) {
      // Day doesn't exist, create it
      mealPlan.days.push({
        dayNumber: parseInt(dayNumber),
        lunch,
        dinner,
        notes
      });
    } else {
      // Update existing day
      if (lunch) mealPlan.days[dayIndex].lunch = lunch;
      if (dinner) mealPlan.days[dayIndex].dinner = dinner;
      if (notes !== undefined) mealPlan.days[dayIndex].notes = notes;
    }
    
    mealPlan.updatedAt = new Date();
    await mealPlan.save();
    
    console.log(`📝 Updated day ${dayNumber} in meal plan ${id}`);
    res.json(mealPlan);
  } catch (error) {
    console.error('Error updating day:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// DELETE /meal-plans/:id - Delete entire meal plan
app.delete('/meal-plans/:id', authenticateJWT, async (req, res) => {
  try {
    const mealPlan = await MealPlan.findById(req.params.id);
    
    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    
    // Verify user owns this meal plan
    if (mealPlan.userId !== req.user.sub) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await MealPlan.findByIdAndDelete(req.params.id);
    console.log(`🗑️ Deleted meal plan ${req.params.id}`);
    
    res.json({ message: 'Meal plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting meal plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /meal-plans/:id/day/:dayNumber - Clear specific day
app.delete('/meal-plans/:id/day/:dayNumber', authenticateJWT, async (req, res) => {
  try {
    const { id, dayNumber } = req.params;
    
    const mealPlan = await MealPlan.findById(id);
    
    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    
    // Verify user owns this meal plan
    if (mealPlan.userId !== req.user.sub) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Remove the day
    mealPlan.days = mealPlan.days.filter(d => d.dayNumber !== parseInt(dayNumber));
    mealPlan.updatedAt = new Date();
    await mealPlan.save();
    
    console.log(`🗑️ Cleared day ${dayNumber} from meal plan ${id}`);
    res.json(mealPlan);
  } catch (error) {
    console.error('Error deleting day:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /meal-plans/user/:userId - Get all meal plans for a user
app.get('/meal-plans/user/:userId', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verify user is requesting their own meal plans
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const mealPlans = await MealPlan.find({ userId }).sort({ year: -1, month: -1 });
    
    res.json(mealPlans);
  } catch (error) {
    console.error('Error fetching meal plans:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

module.exports = app;