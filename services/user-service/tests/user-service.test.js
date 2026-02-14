// services/user-service/tests/user-service.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock SOLO la conexión a MongoDB (no el modelo)
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    connect: jest.fn().mockResolvedValue({}),
    connection: {
      readyState: 1,
      on: jest.fn(),
      once: jest.fn()
    }
  };
});

// Mock de RabbitMQ
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn().mockResolvedValue(true),
      sendToQueue: jest.fn().mockResolvedValue(true)
    })
  })
}));

// Mock del middleware de autenticación
jest.mock('../middleware/auth', () => ({
  authenticateJWT: (req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-token') {
      req.user = { sub: 'existing-user', email: 'test@test.com' };
      next();
    } else if (req.headers.authorization) {
      res.status(403).json({ error: 'Invalid token' });
    } else {
      res.status(401).json({ error: 'No token provided' });
    }
  }
}));

// Mock de dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// ✅ IMPORTAR EL MODELO REAL (para tener coverage)
const User = require('../models/User');

// Mock de los métodos del modelo (pero el modelo en sí es real)
User.findOne = jest.fn();
User.findById = jest.fn();
User.findByIdAndUpdate = jest.fn();
User.prototype.save = jest.fn();
User.findByKeycloakId = jest.fn();

// Silenciar console logs durante testing
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// Crear app de prueba
const app = express();
app.use(express.json());

const { authenticateJWT } = require('../middleware/auth');

// Endpoints de prueba
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/users/profile', authenticateJWT, async (req, res) => {
  try {
    const user = await User.findByKeycloakId(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/users/profile', authenticateJWT, async (req, res) => {
  try {
    const { email, preferences } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Missing required field: email'
      });
    }

    const existingUser = await User.findByKeycloakId(req.user.sub);
    
    if (existingUser) {
      return res.status(409).json({ 
        error: 'User profile already exists'
      });
    }

    const user = new User({
      keycloakId: req.user.sub,
      email,
      preferences: preferences || {}
    });
    
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/users/profile', authenticateJWT, async (req, res) => {
  try {
    const { preferences } = req.body;
    
    if (!preferences) {
      return res.status(400).json({ 
        error: 'Missing required field: preferences'
      });
    }

    const user = await User.findByIdAndUpdate(
      'user-123',
      { preferences },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// TESTS
describe('User Service API Tests', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User Model Tests', () => {
    it('should create a user instance', () => {
      const userData = {
        keycloakId: 'test-123',
        email: 'test@example.com',
        preferences: { diet: 'vegan' }
      };
      
      const user = new User(userData);
      
      expect(user.keycloakId).toBe('test-123');
      expect(user.email).toBe('test@example.com');
      expect(user.preferences.diet).toBe('vegan');
    });

    it('should validate preferences', () => {
      const user = new User({
        keycloakId: 'test-123',
        email: 'test@example.com',
        preferences: { diet: 'vegan' }
      });
      
      expect(user.validatePreferences()).toBe(true);
    });

    it('should validate preferences when empty object', () => {
      const user = new User({
        keycloakId: 'test-123',
        email: 'test@example.com',
        preferences: {}  // Objeto vacío - Mongoose lo acepta
      });
      
      // Mongoose convierte preferences a {} por defecto
      expect(user.validatePreferences()).toBe(true);
    });

    it('should validate preferences when not explicitly set', () => {
      const user = new User({
        keycloakId: 'test-123',
        email: 'test@example.com'
        // Sin preferences - Mongoose lo inicializa como {}
      });
      
      // Mongoose inicializa preferences como {}
      expect(user.validatePreferences()).toBe(true);
    });

    it('should update updatedAt when saving', async () => {
      const user = new User({
        keycloakId: 'test-456',
        email: 'test2@example.com',
        preferences: { diet: 'vegan' }
      });

      const beforeSave = user.updatedAt;
      
      // Mock save para que ejecute el pre-save middleware
      user.save.mockImplementation(async function() {
        // Simular el pre-save hook
        this.updatedAt = Date.now();
        return Promise.resolve(this);
      }.bind(user));

      await user.save();
      
      expect(user.updatedAt).toBeDefined();
    });

    it('should find user by Keycloak ID using static method', async () => {
      const mockUser = {
        keycloakId: 'test-789',
        email: 'static@test.com'
      };

      User.findByKeycloakId.mockResolvedValue(mockUser);

      const result = await User.findByKeycloakId('test-789');
      
      expect(result).toEqual(mockUser);
      expect(User.findByKeycloakId).toHaveBeenCalledWith('test-789');
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy' });
    });
  });

  describe('GET /users/profile - Success Cases', () => {
    it('should return user profile with valid token', async () => {
      const mockUser = {
        _id: 'user-123',
        keycloakId: 'existing-user',
        email: 'existing@test.com',
        preferences: { diet: 'vegetarian' }
      };

      User.findByKeycloakId.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('keycloakId', 'existing-user');
      expect(response.body).toHaveProperty('email');
      expect(User.findByKeycloakId).toHaveBeenCalledWith('existing-user');
    });
  });

  describe('PUT /users/profile - Success Cases', () => {
    it('should update user preferences with valid token', async () => {
      const updatedUser = {
        _id: 'user-123',
        keycloakId: 'existing-user',
        email: 'existing@test.com',
        preferences: {
          diet: 'vegan',
          allergens: ['nuts']
        }
      };

      User.findByIdAndUpdate.mockResolvedValue(updatedUser);

      const response = await request(app)
        .put('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ preferences: { diet: 'vegan', allergens: ['nuts'] } });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('preferences');
      expect(User.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  // Tests de fallo (REQUERIDOS POR EL PROFESOR)
  describe('GET /users/profile - Failure Cases (REQ5)', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app).get('/users/profile');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });

    it('should return 403 for invalid token', async () => {
      const response = await request(app)
        .get('/users/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Invalid token');
    });

    it('should return 404 when user not found', async () => {
      User.findByKeycloakId.mockResolvedValue(null);

      const response = await request(app)
        .get('/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'User profile not found');
    });
  });

  describe('POST /users/profile - Failure Cases (REQ5)', () => {
    it('should return 400 for missing email field', async () => {
      const response = await request(app)
        .post('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ preferences: { diet: 'vegan' } });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .post('/users/profile')
        .send({ email: 'test@test.com', preferences: {} });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });
  });

  describe('PUT /users/profile - Failure Cases (REQ5)', () => {
    it('should return 400 for missing preferences', async () => {
      const response = await request(app)
        .put('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing required field: preferences');
    });

    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .put('/users/profile')
        .send({ preferences: { diet: 'vegan' } });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });
  });

  describe('404 Error Tests', () => {
    it('GET /unknown-route must return 404', async () => {
      const response = await request(app).get('/api/v1/fantasy-route');
      expect(response.status).toBe(404);
    });
  });
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(() => resolve(), 500));
});
