// services/recipe-service/models/Recipe.js
const mongoose = require('mongoose');

// Rating base between 4.0 and 10.0 assigned once when creating the recipe. 
// It serves as a starting rating until users start rating it.
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

  // averageRating: if there are no ratings yet, it uses the random base rating (4–10).
  // When a user rates, it is recalculated and can go up or down from that value.
  averageRating: { type: Number, default: defaultBaseRating },
  ratingCount:   { type: Number, default: 0 }
});

// Index for category queries sorted by rating — used by the recommendation service
recipeSchema.index({ category: 1, averageRating: -1 });

module.exports = mongoose.model('Recipe', recipeSchema);
