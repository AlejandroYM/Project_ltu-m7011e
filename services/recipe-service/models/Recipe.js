// services/recipe-service/models/Recipe.js
const mongoose = require('mongoose');

// Rating base entre 4.0 y 10.0 asignado una sola vez al crear la receta.
// Sirve como nota de partida hasta que los usuarios empiecen a valorar.
function defaultBaseRating() {
  return parseFloat((4 + Math.random() * 6).toFixed(1));
}

const recipeSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  category:      { type: String, required: true },
  description:   { type: String, default: "" },
  ingredients:   { type: [String], default: [] },
  instructions:  { type: String, default: "" },
  imageUrl:      { type: String },
  cookingTime:   { type: Number, default: 30 },
  userId:        { type: String, required: true },
  servings:      { type: Number, default: 4 },

  // averageRating: si no hay votos aún, usa la nota base aleatoria (4–10).
  // Cuando un usuario vota, se recalcula y puede subir o bajar de ese valor.
  averageRating: { type: Number, default: defaultBaseRating },
  ratingCount:   { type: Number, default: 0 }
});

// Índice para consultas por categoría ordenadas por rating — usado por el recommendation-service
recipeSchema.index({ category: 1, averageRating: -1 });

module.exports = mongoose.model('Recipe', recipeSchema);
