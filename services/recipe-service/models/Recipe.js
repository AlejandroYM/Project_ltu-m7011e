const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, default: "" },
  // Hacemos que ingredientes e instrucciones sean opcionales (default vacío)
  // para que no falle al crear una receta rápida desde el formulario actual.
  ingredients: { type: [String], default: [] },
  instructions: { type: String, default: "" },
  imageUrl: { type: String },
  cookingTime: { type: Number, default: 30 },
  userId: { type: String, required: true },
  servings: { type: Number, default: 4}
});

module.exports = mongoose.model('Recipe', recipeSchema);