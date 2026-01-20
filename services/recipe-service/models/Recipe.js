const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  ingredients: [String],
  instructions: String,
  image: String,
  dietaryTags: [String], // REQ5: Filtros (vegano, gluten-free)
  authorId: String,
  ratings: [{
    userId: String,
    score: { type: Number, min: 1, max: 5 },
    comment: String
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Recipe', recipeSchema);