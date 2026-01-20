const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // <--- 1. IMPORTAR CORS
const Recipe = require('./models/Recipe');
require('dotenv').config();

const app = express();

app.use(cors()); // <--- 2. LA NOTA DE ORO: PERMITIR PETICIONES EXTERNAS
app.use(express.json());

// 1. Tus recetas estáticas
const staticRecipes = [
  { id: 1, name: 'Pasta Carbonara', description: 'Classic Italian pasta dish' },
  { id: 2, name: 'Tacos al Pastor', description: 'Delicious Mexican tacos' }
];

// 2. Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chefmatch')
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error DB:', err));

// 3. GET combinado (Estático + Base de Datos)
app.get('/recipes', async (req, res) => {
  try {
    const dynamicRecipes = await Recipe.find();
    res.json([...staticRecipes, ...dynamicRecipes]);
  } catch (err) {
    res.json(staticRecipes);
  }
});

// 4. POST para nuevas recetas
app.post('/recipes', async (req, res) => {
  try {
    const newRecipe = new Recipe(req.body);
    await newRecipe.save();
    res.status(201).json(newRecipe);
  } catch (err) {
    res.status(400).json({ error: 'Error al guardar la receta' });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));