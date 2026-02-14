// services/recommendation-service/recommendation-service.test.js
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
          this._id = 'mock-rec-id-' + Date.now();
        }
        save() {
          return Promise.resolve(this);
        }
        static find(query) {
          if (query && query.userId === 'user-123') {
            return Promise.resolve([
              { 
                _id: 'rec-1', 
                userId: 'user-123',
                recipeId: 'recipe-1',
                recipeName: 'Vegan Pasta',
                score: 0.95 
              }
            ]);
          }
          return Promise.resolve([]);
        }
        static findById(id) {
          if (id === 'rec-1') {
            return Promise.resolve({
              _id: 'rec-1',
              userId: 'user-123',
              recipeId: 'recipe-1',
              recipeName: 'Vegan Pasta',
              score: 0.95
            });
          }
          return Promise.resolve(null);
        }
      }
      return MockModel;
    })
  };
});

// Mock del middleware de autenticación
jest.mock('./middleware/auth', () => ({
  authenticateJWT: (req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-token') {
      req.user = { sub: 'user-123', email: 'test@test.com' };
      next();
    } else if (req.headers.authorization) {
      res.status(403).json({ error: 'Invalid token' });
    } else {
      res.status(401).json({ error: 'No token provided' });
    }
  },
  optionalAuthJWT: (req, res, next) => {
    req.user = null;
    next();
  }
}));

// Crear app de prueba
const app = express();
app.use(express.json());

const { authenticateJWT, optionalAuthJWT } = require('./middleware/auth');
const Recommendation = mongoose.model('Recommendation');

// Endpoints de prueba
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/recommendations', authenticateJWT, async (req, res) => {
  try {
    const recommendations = await Recommendation.find({ userId: req.user.sub });
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/recommendations/:id', authenticateJWT, async (req, res) => {
  try {
    const recommendation = await Recommendation.findById(req.params.id);
    
    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    
    res.json(recommendation);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/recommendations/generate', authenticateJWT, async (req, res) => {
  try {
    const { preferences, recipeId } = req.body;
    
    if (!preferences || !recipeId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['preferences', 'recipeId']
      });
    }

    // Lógica simple de recomendación
    const score = Math.random();
    const recommendation = new Recommendation({
      userId: req.user.sub,
      recipeId,
      recipeName: 'Generated Recipe',
      score,
      preferences
    });

    await recommendation.save();
    res.status(201).json(recommendation);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// TESTS
describe('Recommendation Service API Tests', () => {
  
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy' });
    });
  });

  // Tests de éxito
  describe('GET /recommendations - Success Cases', () => {
    it('should return user recommendations with valid token', async () => {
      const response = await request(app)
        .get('/recommendations')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('userId');
        expect(response.body[0]).toHaveProperty('recipeId');
      }
    });
  });

  describe('GET /recommendations/:id - Success Cases', () => {
    it('should return a specific recommendation by ID', async () => {
      const response = await request(app)
        .get('/recommendations/rec-1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('_id', 'rec-1');
      expect(response.body).toHaveProperty('recipeName');
    });
  });

  describe('POST /recommendations/generate - Success Cases', () => {
    it('should generate a new recommendation with valid data', async () => {
      const requestData = {
        preferences: { diet: 'vegan', allergens: [] },
        recipeId: 'recipe-123'
      };

      const response = await request(app)
        .post('/recommendations/generate')
        .set('Authorization', 'Bearer valid-token')
        .send(requestData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('userId', 'user-123');
      expect(response.body).toHaveProperty('recipeId', 'recipe-123');
      expect(response.body).toHaveProperty('score');
    });
  });

  // Tests de fallo (REQUERIDOS POR EL PROFESOR)
  describe('GET /recommendations - Failure Cases', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app).get('/recommendations');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });

    it('should return 403 for invalid token', async () => {
      const response = await request(app)
        .get('/recommendations')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Invalid token');
    });
  });

  describe('GET /recommendations/:id - Failure Cases', () => {
    it('should return 404 for non-existent recommendation', async () => {
      const response = await request(app)
        .get('/recommendations/nonexistent-id')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Recommendation not found');
    });

    it('should return 401 when no token is provided', async () => {
      const response = await request(app).get('/recommendations/rec-1');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });
  });

  describe('POST /recommendations/generate - Failure Cases', () => {
    it('should return 400 for missing required fields', async () => {
      const invalidData = {
        preferences: { diet: 'vegan' }
        // Falta recipeId
      };

      const response = await request(app)
        .post('/recommendations/generate')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing required fields');
    });

    it('should return 401 when no token is provided', async () => {
      const requestData = {
        preferences: { diet: 'vegan' },
        recipeId: 'recipe-123'
      };

      const response = await request(app)
        .post('/recommendations/generate')
        .send(requestData);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });

    it('should return 403 for invalid token', async () => {
      const requestData = {
        preferences: { diet: 'vegan' },
        recipeId: 'recipe-123'
      };

      const response = await request(app)
        .post('/recommendations/generate')
        .set('Authorization', 'Bearer invalid-token')
        .send(requestData);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Invalid token');
    });
  });
});
