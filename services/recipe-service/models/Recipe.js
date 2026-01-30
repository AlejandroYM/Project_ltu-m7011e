const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  name: { type: String, required: true }, // ESTE ES EL ÚNICO OBLIGATORIO
  category: { type: String, default: 'General' },
  description: { type: String, default: '' },
  ingredients: { type: [String], default: [] }, // Array vacío por defecto
  instructions: { type: String, default: '' },
  authorId: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Recipe', recipeSchema);