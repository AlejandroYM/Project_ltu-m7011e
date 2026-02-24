// services/recipe-service/models/Rating.js
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  userId:   { type: String, required: true },
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true },
  score:    { type: Number, required: true, min: 0, max: 10 }
}, {
  timestamps: true
});

// Un usuario solo puede valorar una receta una vez
ratingSchema.index({ userId: 1, recipeId: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);
