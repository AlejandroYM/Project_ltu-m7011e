const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  score:  { type: Number, required: true, min: 0, max: 10 }
}, { _id: false });

const recipeSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  category:     { type: String, required: true },
  description:  { type: String, default: "" },
  ingredients:  { type: [String], default: [] },
  instructions: { type: String, default: "" },
  imageUrl:     { type: String },
  cookingTime:  { type: Number, default: 30 },
  userId:       { type: String, required: true },
  servings:     { type: Number, default: 4 },

  // ── VALORACIONES ────────────────────────────────────────────
  ratings:       { type: [ratingSchema], default: [] },   // lista de votos individuales
  averageRating: { type: Number, default: 0 },            // media calculada y persistida
  ratingCount:   { type: Number, default: 0 }             // número total de votos
});

// Recalcula la media antes de guardar (Mongoose 6+ — sin next en hooks síncronos)
recipeSchema.pre('save', function() {
  if (this.ratings && this.ratings.length > 0) {
    const total = this.ratings.reduce((sum, r) => sum + r.score, 0);
    this.ratingCount   = this.ratings.length;
    this.averageRating = Math.round((total / this.ratingCount) * 10) / 10; // 1 decimal
  } else {
    this.ratingCount   = 0;
    this.averageRating = 0;
  }
});

module.exports = mongoose.model('Recipe', recipeSchema);
