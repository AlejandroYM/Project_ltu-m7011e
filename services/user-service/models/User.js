// services/user-service/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  keycloakId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  preferences: {
    diet: String,
    allergens: [String],
    category: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware to update the updatedAt field before saving
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method to validate preferences
UserSchema.methods.validatePreferences = function() {
  // Mongoodr always initializes preferences as {} if not provided, so we can check if it's empty
  // Verify if this exists and has at least one property
  return !!this.preferences;
};

// Static method to find a user by Keycloak ID
UserSchema.statics.findByKeycloakId = async function(keycloakId) {
  return await this.findOne({ keycloakId });
};

module.exports = mongoose.model('User', UserSchema);
