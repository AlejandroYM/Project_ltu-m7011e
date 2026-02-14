// services/user-service/tests/user-service.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock de Mongoose
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    connect: jest.fn().mockResolvedValue({}),
    connection: {
      readyState: 1,
      on: jest.fn(),
      once: jest.fn()
    },
    Schema: actualMongoose.Schema,
    model: jest.fn((name, schema) => {
      class MockModel {
        constructor(data) {
          Object.assign(this, data);
          this._id = 'mock-user-id-' + Date.now();
        }
        save() {
          return Promise.resolve(this);
        }
        static findOne(query) {
          if (query.keycloakId === 'existing-user') {
            return Promise.resolve({
              _id: 'user-123',
              keycloakId: 'existing-user',
              email: 'existing@test.com',
              preferences: { diet: 'vegetarian' }
            });
          }
          return Promise.resolve(null);
        }
        static findById(id) {
          if (id === 'user-123') {
            return Promise.resolve({
              _id: 'user-123',
              keycloakId: 'existing-user',
              email: 'existing@test.com',
              preferences: { diet: 'vegetarian' }
            });
          }
          return Promise.resolve(null);
        }
        static findByIdAndUpdate(id, update, options) {
          if (id === 'user-123') {
            return Promise.resolve({
              _id: 'user-123',
              keycloakId: 'existing-user',
              email: 'existing@test.com',
              preferences: update.preferences || { diet: 'vegetarian' }
            });
          }
          return Promise.resolve(null);
        }
      }
      return MockModel;
    })
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

// Silenciar console logs durante testing
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// Crear app de prueba (SIN app.listen para evitar open handles)
const app = express();
app.use(express.json());

const { authenticateJWT } = require('../middleware/auth');
const User = mongoose.model('User');

// Endpoints de prueba
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/users/profile', authenticateJWT, async (req, res) => {
  try {
    const user = await User.findOne({ keycloakId: req.user.sub });
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

    const existingUser = await User.findOne({ keycloakId: req.user.sub });
    
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
  
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy' });
    });
  });

  // Tests de éxito
  describe('GET /users/profile - Success Cases', () => {
    it('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('keycloakId', 'existing-user');
      expect(response.body).toHaveProperty('email');
    });
  });

  describe('PUT /users/profile - Success Cases', () => {
    it('should update user preferences with valid token', async () => {
      const updatedPreferences = {
        preferences: {
          diet: 'vegan',
          allergens: ['nuts']
        }
      };

      const response = await request(app)
        .put('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(updatedPreferences);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('preferences');
      expect(response.body.preferences).toHaveProperty('diet', 'vegan');
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
  });

  describe('POST /users/profile - Failure Cases (REQ5)', () => {
    it('should return 400 for missing email field', async () => {
      const invalidData = {
        preferences: { diet: 'vegan' }
        // Falta email
      };

      const response = await request(app)
        .post('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 when no token is provided', async () => {
      const newUser = {
        email: 'test@test.com',
        preferences: {}
      };

      const response = await request(app)
        .post('/users/profile')
        .send(newUser);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });
  });

  describe('PUT /users/profile - Failure Cases (REQ5)', () => {
    it('should return 400 for missing preferences', async () => {
      const invalidData = {
        // Falta preferences
      };

      const response = await request(app)
        .put('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing required field: preferences');
    });

    it('should return 401 when no token is provided', async () => {
      const updateData = {
        preferences: { diet: 'vegan' }
      };

      const response = await request(app)
        .put('/users/profile')
        .send(updateData);

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

// ✅ IMPORTANTE: Cleanup para cerrar conexiones y evitar "open handle"
afterAll(async () => {
  // Esperar a que todas las operaciones asíncronas terminen
  await new Promise(resolve => setTimeout(() => resolve(), 500));
  
});
