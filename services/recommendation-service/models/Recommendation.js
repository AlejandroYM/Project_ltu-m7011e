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
  // Rating copiado del recipe-service en el momento de generar la recomendación.
  // Refleja el averageRating real de la receta (base 4–10 o calculado por votos).
  // Es el campo que determina el orden de las recomendaciones.
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

// Índice único para evitar duplicados por usuario + receta
recommendationSchema.index({ userId: 1, recipeName: 1 }, { unique: true });

// Índice para ordenar eficientemente por rating descendente
recommendationSchema.index({ userId: 1, recipeRating: -1 });

module.exports = mongoose.model('Recommendation', recommendationSchema);
