// services/recipe-service/models/MealPlan.js
const mongoose = require('mongoose');

const dayMealSchema = new mongoose.Schema({
  dayNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 31
  },
  lunch: {
    recipeId: String,
    recipeName: String,
    category: String
  },
  dinner: {
    recipeId: String,
    recipeName: String,
    category: String
  },
  notes: String
}, { _id: false });

const mealPlanSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    enum: ['Italian', 'Mexican', 'Vegan', 'Japanese', 'American', 'Desserts', 'Mixed'],
    default: 'Mixed'
  },
  days: [dayMealSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure one meal plan per user per month
mealPlanSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

// Method to get days in month
mealPlanSchema.methods.getDaysInMonth = function() {
  return new Date(this.year, this.month, 0).getDate();
};

module.exports = mongoose.model('MealPlan', mealPlanSchema);
