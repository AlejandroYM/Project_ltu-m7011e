const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { authenticateJWT, optionalAuthJWT } = require('./middleware/auth');
// NEW: Metrics library
const client = require('prom-client'); 

const app = express();
app.use(cors());
app.use(express.json());
const Recipe = require('./models/Recipe');
require('dotenv').config();

// --- MONITORING CONFIGURATION (REQ13) ---
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics(); // Collect CPU, Memory, etc.

// Custom metric: Counter for recipe views/requests
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [50, 100, 200, 300, 400, 500, 1000]
});

// Middleware to measure duration
app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.route ? req.route.path : req.path, code: res.statusCode });
  });
  next();
});

// Endpoint for Prometheus to scrape
app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});
// ----------------------------------------

// 1. Static recipes (Updated with COOKING TIME)
const staticRecipes = [
  // ITALIAN
  { 
    id: 1, 
    name: 'Carbonara Pasta', 
    category: 'Italian', 
    description: 'The authentic Roman recipe without cream.',
    ingredients: ['400g Spaghetti', '150g Guanciale or Pancetta', '4 Egg yolks', '100g Pecorino Cheese', 'Black pepper'],
    instructions: '1. Boil the pasta. \n2. Sauté the guanciale until crispy. \n3. Beat the yolks with the cheese and lots of pepper. \n4. Mix the hot pasta with the egg mixture off the heat to create the cream.',
    cookingTime: 20
  },
  { 
    id: 2, 
    name: 'Margherita Pizza', 
    category: 'Italian', 
    description: 'The classic Neapolitan pizza.',
    ingredients: ['Pizza dough', 'San Marzano tomato sauce', 'Fresh Mozzarella', 'Fresh Basil', 'Olive oil'],
    instructions: '1. Stretch the dough. \n2. Add tomato and mozzarella. \n3. Bake at maximum temperature (250°C) for 10-15 min. \n4. Add fresh basil upon serving.',
    cookingTime: 45
  },
  
  // MEXICAN
  { 
    id: 3, 
    name: 'Tacos al Pastor', 
    category: 'Mexican', 
    description: 'Marinated pork tacos with pineapple.',
    ingredients: ['Corn tortillas', '500g Pork loin', 'Pineapple', 'Cilantro and Onion', 'Achiote paste'],
    instructions: '1. Marinate the meat with achiote and spices. \n2. Grill the meat with the pineapple. \n3. Heat the tortillas. \n4. Serve with cilantro, onion, and salsa.',
    cookingTime: 60
  },
  { 
    id: 4, 
    name: 'Traditional Guacamole', 
    category: 'Mexican', 
    description: 'The perfect side dish.',
    ingredients: ['3 Ripe avocados', '1 Tomato', '1/2 Onion', 'Cilantro', 'Lime juice', 'Salt'],
    instructions: '1. Mash the avocados. \n2. Finely chop onion, tomato, and cilantro. \n3. Mix everything with lime juice and salt to taste.',
    cookingTime: 10
  },

  // VEGAN
  { 
    id: 5, 
    name: 'Chickpea Curry', 
    category: 'Vegan', 
    description: 'Dish rich in protein and spices.',
    ingredients: ['400g Cooked chickpeas', 'Coconut milk', 'Spinach', 'Curry powder', 'Garlic and Ginger'],
    instructions: '1. Sauté garlic and ginger. \n2. Add spices and chickpeas. \n3. Pour coconut milk and cook for 10 min. \n4. Add spinach at the end.',
    cookingTime: 25
  },
  { 
    id: 6, 
    name: 'Buddha Bowl', 
    category: 'Vegan', 
    description: 'Nutritious and colorful bowl.',
    ingredients: ['Quinoa', 'Marinated Tofu', 'Avocado', 'Grated Carrot', 'Tahini Sauce'],
    instructions: '1. Cook the quinoa. \n2. Sauté the tofu. \n3. Chop the vegetables. \n4. Assemble the bowl and dress with tahini.',
    cookingTime: 30
  },

  // JAPANESE
  { 
    id: 7, 
    name: 'Sushi Maki Roll', 
    category: 'Japanese', 
    description: 'Homemade sushi rolls.',
    ingredients: ['Sushi rice', 'Nori sheets', 'Salmon or Cucumber', 'Rice vinegar', 'Soy sauce'],
    instructions: '1. Cook and season the rice. \n2. Spread rice on the seaweed. \n3. Add filling and roll with a mat. \n4. Cut into 6-8 pieces.',
    cookingTime: 50
  },
  { 
    id: 8, 
    name: 'Chicken Ramen', 
    category: 'Japanese', 
    description: 'Comforting soup with noodles.',
    ingredients: ['Chicken broth', 'Ramen noodles', 'Chicken breast', 'Boiled egg', 'Chives'],
    instructions: '1. Heat the broth with soy and miso. \n2. Cook noodles separately. \n3. Assemble the bowl with broth, noodles, and toppings (chicken, egg, chives).',
    cookingTime: 60
  },

  // AMERICAN
  { 
    id: 9, 
    name: 'Classic Burger', 
    category: 'American', 
    description: 'Juicy burger with cheddar cheese.',
    ingredients: ['Ground beef', 'Brioche bun', 'Cheddar Cheese', 'Lettuce and Tomato', 'Pickles'],
    instructions: '1. Form patties loosely. \n2. Grill 3 min per side. \n3. Melt cheese on top. \n4. Toast the bun and assemble with veggies.',
    cookingTime: 20
  },
  { 
    id: 10, 
    name: 'BBQ Ribs', 
    category: 'American', 
    description: 'Pork ribs in barbecue sauce.',
    ingredients: ['Pork ribs', 'Homemade BBQ sauce', 'Smoked paprika', 'Honey', 'Garlic powder'],
    instructions: '1. Rub ribs with dry spices. \n2. Bake at low temp (150°C) for 2 hours wrapped in foil. \n3. Uncover, brush with BBQ sauce and broil for 15 min.',
    cookingTime: 140
  },

  // DESSERTS
  { 
    id: 11, 
    name: 'Tiramisu', 
    category: 'Desserts', 
    description: 'Italian coffee and mascarpone dessert.',
    ingredients: ['Ladyfingers', 'Mascarpone Cheese', 'Strong espresso coffee', 'Cocoa powder', 'Sugar'],
    instructions: '1. Beat mascarpone with sugar. \n2. Dip ladyfingers in coffee. \n3. Layer ladyfingers and cream alternately. \n4. Dust with cocoa at the end.',
    cookingTime: 30
  },
  { 
    id: 12, 
    name: 'Strawberry Cheesecake', 
    category: 'Desserts', 
    description: 'Smooth cheese cake with fruit.',
    ingredients: ['Digestive biscuits', 'Butter', 'Cream cheese', 'Whipping cream', 'Strawberry jam'],
    instructions: '1. Crush biscuits with butter for the base. \n2. Beat cheese and cream and pour over the base. \n3. Refrigerate for at least 4 hours. \n4. Top with jam before serving.',
    cookingTime: 240
  }
];

// 2. Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chefmatch')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('DB Error:', err));

// 3. Combined GET (Static + Database)
app.get('/recipes', optionalAuthJWT, async (req, res) => {
  try {
    const dynamicRecipes = await Recipe.find();
    res.json([...staticRecipes, ...dynamicRecipes]);
  } catch (err) {
    res.json(staticRecipes);
  }
});

// 4. POST for new recipes
app.post('/recipes', optionalAuthJWT, async (req, res) => {
  try {
    const newRecipe = new Recipe(req.body);
    await newRecipe.save();
    res.status(201).json(newRecipe);
  } catch (err) {
    console.error('Error saving recipe:', error);
    res.status(400).json({ 
      error: "Error saving the recipe",
    details: error.message
   });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

// 5. Delete endpoint for recipes
app.delete('/recipes/:id', optionalAuthJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify if id is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(id)) {
      const deleted = await Recipe.findByIdAndDelete(id);
      if (deleted) {
        return res.status(200).json({ message: "Recipe deleted successfully" });
      }
    }

    // If not found in DB, we assume it's static or it doesn't exist
    res.status(403).json({ error: "Cannot delete static or non-existent recipes" });

  } catch (err) {
    res.status(500).json({ error: "Error deleting recipe" });
  }
});

// For testing purposes, we export the app 
module.exports = app;
