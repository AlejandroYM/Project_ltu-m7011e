process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { authenticateJWT } = require('./middleware/auth');
const client = require('prom-client');
const swaggerUi = require('swagger-ui-express');

const amqplib = require('amqplib');

const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

const app = express();
app.use(cors());
app.use(express.json());

app.use(helmet());
app.use(mongoSanitize());
app.use(xss());

const Recipe   = require('./models/Recipe');
const Rating   = require('./models/Rating');
const MealPlan = require('./models/MealPlan');
require('dotenv').config();

// ── Prometheus ────────────────────────────────────────────────────
client.collectDefaultMetrics({ timeout: 5000 });
const httpRequestDuration = new client.Histogram({ name:'http_request_duration_seconds', help:'Duration', labelNames:['method','route','status_code'], buckets:[0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5] });
const httpRequestTotal    = new client.Counter({ name:'http_requests_total', help:'Total', labelNames:['method','route','status_code'] });
const httpRequestErrors   = new client.Counter({ name:'http_request_errors_total', help:'Errors', labelNames:['method','route','status_code','error_type'] });
app.use((req,res,next)=>{
  const start=Date.now(), oe=res.end;
  res.end=function(...a){ const d=(Date.now()-start)/1000, r=req.route?req.route.path:req.path; httpRequestDuration.labels(req.method,r,res.statusCode).observe(d); httpRequestTotal.labels(req.method,r,res.statusCode).inc(); if(res.statusCode>=400) httpRequestErrors.labels(req.method,r,res.statusCode,res.statusCode>=500?'server_error':'client_error').inc(); oe.apply(res,a); };
  next();
});

// ── Seed data ─────────────────────────────────────────────────────
async function autoSeed() {
  try {
    const count = await Recipe.countDocuments();
    if (count === 0) {
      console.warn('⚠️  DB is empty — import recipes via MongoDB Compass using recipes.json');
    } else {
      console.log(`✅ DB has ${count} recipes ready`);
    }
  } catch (err) {
    console.error('Auto-seed check error:', err.message);
  }
}

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chefmatch')
  .then(async () => { console.log('Connected to MongoDB'); await autoSeed(); })
  .catch(err => console.error('DB Error:', err));

async function listenForUserEvents() {
  try {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
    const channel = await conn.createChannel();
    await channel.assertQueue('user_events');
    console.log('Listening for user events on RabbitMQ...');
    channel.consume('user_events', async (msg) => {
      if (msg !== null) {
        const event = JSON.parse(msg.content.toString());
        if (event.action === 'USER_DELETED') {
          console.log(`Deleting data for user: ${event.userId}`);
          await Promise.all([
            Recipe.deleteMany({ userId: event.userId }),
            MealPlan.deleteMany({ userId: event.userId }),
            Rating.deleteMany({ userId: event.userId })
          ]);
        }
        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error('RabbitMQ error:', err.message);
    setTimeout(listenForUserEvents, 5000);
  }
}
listenForUserEvents();

async function generateMealPlanFromDB(userId, monthNum, yearNum, category) {
  let allRecipes = (category && category !== 'Mixed') ? await Recipe.find({ category }).lean() : await Recipe.find().lean();
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const shuffle = (arr) => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
  const getPool = (n) => { if(!allRecipes.length) return Array(n).fill({name:'No recipes available',category}); let p=[]; while(p.length<n) p=[...p,...shuffle(allRecipes)]; return p.slice(0,n); };
  const lp=getPool(daysInMonth), dp=getPool(daysInMonth);
  const days=[];
  for(let d=1;d<=daysInMonth;d++){
    let l=lp[d-1], di=dp[d-1];
    if(l.name===di.name && allRecipes.length>1){ const alt=allRecipes.find(r=>r.name!==l.name); if(alt) di=alt; }
    days.push({ dayNumber:d, lunch:{recipeId:l._id||String(d),recipeName:l.name,category:l.category||category}, dinner:{recipeId:di._id||String(d+100),recipeName:di.name,category:di.category||category} });
  }
  return new MealPlan({ userId, month:monthNum, year:yearNum, category:category||'Mixed', days });
}
// ============================================
// SWAGGER DOCS - RECIPE SERVICE (REQ16)
// ============================================
const swaggerDocument = {
  openapi: '3.0.0',
  info: { 
    title: 'ChefMatch Recipe Service API', 
    version: '1.0.0', 
    description: 'Gestión de recetas, planes de comidas y valoraciones.' 
  },
  servers: [{ url: '/recipes' }],
  paths: {
    '/': {
      get: { 
        summary: 'Obtener todas las recetas (Público)',
        parameters: [
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['rating_asc', 'rating_desc'] } },
          { name: 'category', in: 'query', schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Lista de recetas obtenida con éxito' } } 
      },
      post: { 
        summary: 'Crear una nueva receta', 
        security: [{ bearerAuth: [] }], 
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, ingredients: { type: 'array' } } } } }
        },
        responses: { 201: { description: 'Receta creada exitosamente' } } 
      }
    },
    '/{id}': {
      delete: { 
        summary: 'Eliminar una receta propia', 
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Receta eliminada' }, 403: { description: 'No autorizado' } } 
      }
    },
    '/{id}/rate': {
      post: {
        summary: 'Valorar una receta (0-10)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { score: { type: 'number' } } } } } },
        responses: { 200: { description: 'Valoración guardada' }, 409: { description: 'Ya has valorado esta receta' } }
      }
    }
  },
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
// ── RECIPE ENDPOINTS ──────────────────────────────────────────────
app.get('/recipes', async (req, res) => {
  try {
    const { sort, category } = req.query;
    const filter = (category && category !== 'Mixed') ? { category } : {};
    let q = Recipe.find(filter);
    if (sort === 'rating_desc') q = q.sort({ averageRating: -1 });
    else if (sort === 'rating_asc') q = q.sort({ averageRating: 1 });
    res.json(await q.exec());
  } catch (err) { res.status(500).json({ error: 'Error fetching recipes' }); }
});

app.post('/recipes', authenticateJWT, async (req, res) => {
  try {
    const recipe = new Recipe({ ...req.body, userId: req.user.sub });
    await recipe.save();
    res.status(201).json(recipe);
  } catch (err) { res.status(400).json({ error: 'Error saving recipe', details: err.message }); }
});

app.delete('/recipes/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(403).json({ error: 'Cannot delete static recipes' });
    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    if (recipe.userId !== req.user.sub) return res.status(403).json({ error: 'You can only delete recipes you have created' });
    await Promise.all([Recipe.findByIdAndDelete(id), Rating.deleteMany({ recipeId: id })]);
    res.json({ message: 'Recipe deleted successfully' });
  } catch (err) { res.status(500).json({ error: 'Error deleting recipe' }); }
});

app.post('/recipes/:id/rate', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid recipe id' });
    const parsedScore = Number(req.body.score);
    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10) return res.status(400).json({ error: 'Score must be 0-10' });
    const recipe = await Recipe.findById(id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    const existing = await Rating.findOne({ userId: req.user.sub, recipeId: id });
    if (existing) return res.status(409).json({ error: 'You have already rated this recipe' });
    await Rating.create({ userId: req.user.sub, recipeId: id, score: parsedScore });
    const ratings = await Rating.find({ recipeId: id });
    const total = ratings.reduce((s, r) => s + r.score, 0);
    recipe.ratingCount = ratings.length;
    recipe.averageRating = Math.round((total / ratings.length) * 10) / 10;
    await recipe.save();
    res.json({ message: 'Rating saved', averageRating: recipe.averageRating, ratingCount: recipe.ratingCount });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'You have already rated this recipe' });
    res.status(500).json({ error: 'Error saving rating' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'recipe-service' }));

// ── MEAL PLAN ENDPOINTS ───────────────────────────────────────────
app.get('/meal-plans/:userId/:month/:year', authenticateJWT, async (req, res) => {
  try {
    const { userId, month, year } = req.params;
    const { category } = req.query;
    if (req.user.sub !== userId) return res.status(403).json({ error: 'Access denied' });
    const monthNum = parseInt(month), yearNum = parseInt(year);
    if (monthNum<1||monthNum>12||yearNum<2024||yearNum>2030) return res.status(400).json({ error: 'Invalid month or year' });
    let mealPlan = await MealPlan.findOne({ userId, month: monthNum, year: yearNum });
    if (mealPlan && category && mealPlan.category !== category) { await MealPlan.deleteOne({ _id: mealPlan._id }); mealPlan = null; }
    if (!mealPlan) { mealPlan = await generateMealPlanFromDB(userId, monthNum, yearNum, category||'Mixed'); await mealPlan.save(); }
    res.json(mealPlan);
  } catch (err) { res.status(500).json({ error: 'Internal server error', details: err.message }); }
});

app.post('/meal-plans', authenticateJWT, async (req, res) => {
  try {
    const { userId, month, year, category, days } = req.body;
    if (req.user.sub !== userId) return res.status(403).json({ error: 'Access denied' });
    if (!userId||!month||!year) return res.status(400).json({ error: 'Missing required fields' });
    let mealPlan = await MealPlan.findOne({ userId, month, year });
    if (mealPlan) { if(category) mealPlan.category=category; if(days) mealPlan.days=days; mealPlan.updatedAt=new Date(); await mealPlan.save(); }
    else { mealPlan = days ? new MealPlan({userId,month,year,category:category||'Mixed',days}) : await generateMealPlanFromDB(userId,month,year,category||'Mixed'); await mealPlan.save(); }
    res.status(201).json(mealPlan);
  } catch (err) { if(err.code===11000) return res.status(409).json({error:'Already exists'}); res.status(500).json({error:'Internal server error',details:err.message}); }
});

app.put('/meal-plans/:id/day/:dayNumber', authenticateJWT, async (req, res) => {
  try {
    const { id, dayNumber } = req.params;
    const { lunch, dinner, notes } = req.body;
    const mp = await MealPlan.findById(id);
    if (!mp) return res.status(404).json({ error: 'Not found' });
    if (mp.userId !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    const idx = mp.days.findIndex(d => d.dayNumber === parseInt(dayNumber));
    if (idx === -1) mp.days.push({ dayNumber: parseInt(dayNumber), lunch, dinner, notes });
    else { if(lunch) mp.days[idx].lunch=lunch; if(dinner) mp.days[idx].dinner=dinner; if(notes!==undefined) mp.days[idx].notes=notes; }
    mp.updatedAt = new Date(); await mp.save(); res.json(mp);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/meal-plans/:id', authenticateJWT, async (req, res) => {
  try {
    const mp = await MealPlan.findById(req.params.id);
    if (!mp) return res.status(404).json({ error: 'Not found' });
    if (mp.userId !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    await MealPlan.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/meal-plans/:id/day/:dayNumber', authenticateJWT, async (req, res) => {
  try {
    const mp = await MealPlan.findById(req.params.id);
    if (!mp) return res.status(404).json({ error: 'Not found' });
    if (mp.userId !== req.user.sub) return res.status(403).json({ error: 'Access denied' });
    mp.days = mp.days.filter(d => d.dayNumber !== parseInt(req.params.dayNumber));
    mp.updatedAt = new Date(); await mp.save(); res.json(mp);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/meal-plans/user/:userId', authenticateJWT, async (req, res) => {
  try {
    if (req.user.sub !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    res.json(await MealPlan.find({ userId: req.params.userId }).sort({ year:-1, month:-1 }));
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// ── Prometheus metrics — SIN autenticación para que Prometheus pueda hacer scrape ──
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
module.exports = app;
