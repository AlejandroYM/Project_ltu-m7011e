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

// Static method to generate default meal plan for a category
mealPlanSchema.statics.generateDefaultPlan = function(userId, month, year, category) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  
  // Default meal templates by category
  const mealTemplates = {
    Italian: [
      { lunch: 'Carbonara Pasta', dinner: 'Margherita Pizza' },
      { lunch: 'Risotto ai Funghi', dinner: 'Caprese Salad' },
      { lunch: 'Lasagna Bolognese', dinner: 'Bruschetta' },
      { lunch: 'Gnocchi al Pesto', dinner: 'Minestrone Soup' },
      { lunch: 'Ossobuco', dinner: 'Focaccia' },
      { lunch: 'Ravioli', dinner: 'Antipasto Platter' },
      { lunch: 'Spaghetti Aglio e Olio', dinner: 'Panna Cotta' }
    ],
    Mexican: [
      { lunch: 'Tacos al Pastor', dinner: 'Quesadillas' },
      { lunch: 'Enchiladas', dinner: 'Guacamole & Chips' },
      { lunch: 'Pozole', dinner: 'Tostadas' },
      { lunch: 'Burritos', dinner: 'Elote' },
      { lunch: 'Mole Poblano', dinner: 'Tamales' },
      { lunch: 'Cochinita Pibil', dinner: 'Sopes' },
      { lunch: 'Chilaquiles', dinner: 'Esquites' }
    ],
    Vegan: [
      { lunch: 'Buddha Bowl', dinner: 'Lentil Soup' },
      { lunch: 'Chickpea Curry', dinner: 'Spring Rolls' },
      { lunch: 'Falafel Wrap', dinner: 'Hummus Plate' },
      { lunch: 'Tofu Stir-fry', dinner: 'Mushroom Tacos' },
      { lunch: 'Veggie Burger', dinner: 'Quinoa Salad' },
      { lunch: 'Vegetable Paella', dinner: 'Stuffed Peppers' },
      { lunch: 'Pasta Primavera', dinner: 'Cauliflower Pizza' }
    ],
    Japanese: [
      { lunch: 'Sushi Maki Roll', dinner: 'Miso Soup' },
      { lunch: 'Chicken Ramen', dinner: 'Edamame' },
      { lunch: 'Teriyaki Bowl', dinner: 'Gyoza' },
      { lunch: 'Yakisoba', dinner: 'Seaweed Salad' },
      { lunch: 'Katsudon', dinner: 'Tempura' },
      { lunch: 'Japanese Curry', dinner: 'Okonomiyaki' },
      { lunch: 'Udon Soup', dinner: 'Yakitori' }
    ],
    American: [
      { lunch: 'Classic Burger', dinner: 'Mac & Cheese' },
      { lunch: 'BBQ Ribs', dinner: 'Coleslaw' },
      { lunch: 'Hot Dogs', dinner: 'Onion Rings' },
      { lunch: 'Fried Chicken', dinner: 'Corn on Cob' },
      { lunch: 'Club Sandwich', dinner: 'Clam Chowder' },
      { lunch: 'Meatloaf', dinner: 'Loaded Fries' },
      { lunch: 'Philly Cheesesteak', dinner: 'Wings' }
    ],
    Desserts: [
      { lunch: 'Tiramisu', dinner: 'Fruit Salad' },
      { lunch: 'Cheesecake', dinner: 'Cookies' },
      { lunch: 'Brownies', dinner: 'Ice Cream' },
      { lunch: 'Apple Pie', dinner: 'Yogurt Parfait' },
      { lunch: 'Crepes', dinner: 'Mousse' },
      { lunch: 'Donuts', dinner: 'Smoothie Bowl' },
      { lunch: 'Pancakes', dinner: 'Flan' }
    ]
  };
  
  const templates = mealTemplates[category] || mealTemplates.Vegan;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const template = templates[(day - 1) % templates.length];
    days.push({
      dayNumber: day,
      lunch: {
        recipeName: template.lunch,
        category: category
      },
      dinner: {
        recipeName: template.dinner,
        category: category
      }
    });
  }
  
  return new this({
    userId,
    month,
    year,
    category,
    days
  });
};

module.exports = mongoose.model('MealPlan', mealPlanSchema);
