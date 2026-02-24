// services/recipe-service/models/Recipe.js
const mongoose = require('mongoose');

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

  // Calculados y actualizados cada vez que alguien vota — NO hay array embebido
  averageRating: { type: Number, default: 0 },
  ratingCount:   { type: Number, default: 0 }
});

module.exports = mongoose.model('Recipe', recipeSchema);
