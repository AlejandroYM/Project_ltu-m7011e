const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  recipeName: {
    type: String,
    required: true
  },
  recipeId: {
    type: String
  },
  category: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    default: 100
  },
  reason: {
    type: String,
    enum: ['preference_match', 'popular', 'trending'],
    default: 'preference_match'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800 // TTL: 7 días
  }
}, {
  timestamps: true
});

// Índice compuesto para evitar duplicados
recommendationSchema.index({ userId: 1, recipeName: 1 }, { unique: true });

module.exports = mongoose.model('Recommendation', recommendationSchema);
