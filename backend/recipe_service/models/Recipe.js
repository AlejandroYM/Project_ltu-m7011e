const mongoose = require('mongoose');

const RecipeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  ingredients: [String],
  instructions: String,
  cookingTime: Number,
  image: String,
  dietaryTags: [String], // REQ5: Filtros
  category: String,
  authorId: String, // Conectado con User Service
  ratings: [
    {
      userId: String,
      score: { type: Number, min: 1, max: 5 },
      comment: String,
      date: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Recipe', RecipeSchema);