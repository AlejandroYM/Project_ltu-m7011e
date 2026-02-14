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

// Middleware para actualizar updatedAt
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Método para validar preferencias
UserSchema.methods.validatePreferences = function() {
  // Mongoose siempre inicializa preferences como {} si no se proporciona
  // Simplemente verificamos que exista
  return !!this.preferences;
};

// Método estático para buscar por Keycloak ID
UserSchema.statics.findByKeycloakId = async function(keycloakId) {
  return await this.findOne({ keycloakId });
};

module.exports = mongoose.model('User', UserSchema);
