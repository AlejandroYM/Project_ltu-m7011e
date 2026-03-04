// services/recommendation-service/models/Recommendation.js
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

  // Rating copied from recipe-service at the moment of generating the recommendation.
  // Reflects the actual averageRating of the recipe (base 4–10 or calculated by votes).
  // It is the field that determines the order of recommendations.
  recipeRating: {
    type: Number,
    default: 5.0,
    min: 0,
    max: 10
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

// Unique index to prevent duplicates by user + recipe
recommendationSchema.index({ userId: 1, recipeName: 1 }, { unique: true });

// Index to efficiently sort by rating descending
recommendationSchema.index({ userId: 1, recipeRating: -1 });

module.exports = mongoose.model('Recommendation', recommendationSchema);
