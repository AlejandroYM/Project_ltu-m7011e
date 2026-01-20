const express = require('express');
const mongoose = require('mongoose');
const Recipe = require('./models/Recipe'); // Importar el modelo
require('dotenv').config();

const app = express();
app.use(express.json());

// 1. Mantener tus recetas estáticas actuales
const staticRecipes = [
  { id: 1, name: 'Pasta Carbonara', description: 'Classic Italian pasta dish' },
  { id: 2, name: 'Tacos al Pastor', description: 'Delicious Mexican tacos' }
];

// 2. Conectar a MongoDB para las recetas nuevas
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chefmatch')
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error DB:', err));

// 3. Modificar GET para mostrar AMBAS
app.get('/recipes', async (req, res) => {
  try {
    const dynamicRecipes = await Recipe.find(); // Obtener de la DB
    res.json([...staticRecipes, ...dynamicRecipes]); // Combinar ambos arrays
  } catch (err) {
    res.json(staticRecipes); // Si falla la DB, al menos mostrar las estáticas
  }
});

// 4. Ruta para añadir recetas nuevas (REQ2)
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