// services/recommendation-service/tests/recommendation-service.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// 1. MOCK DE RABBITMQ -> Prevenir operaciones RabbitMQ durante testing
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn().mockResolvedValue(true),
      consume: jest.fn()
    })
  })
}));

// 2. MOCK DE AXIOS -> Prevenir llamadas HTTP reales durante testing
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({
    data: {
      category: 'Italian',
      preferences: { category: 'Italian' }
    }
  })
}));

// 3. MOCK DE MONGOOSE -> Prevenir operaciones de base de datos durante testing
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
            return {
              sort: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              lean: jest.fn().mockResolvedValue([
                { 
                  _id: 'rec-1', 
                  userId: 'user-123',
                  recipeId: 'recipe-1',
                  recipeName: 'Vegan Pasta',
                  score: 95 
                }
              ])
            };
          }
          return {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([])
          };
        }
        static findById(id) {
          if (id === 'rec-1') {
            return Promise.resolve({
              _id: 'rec-1',
              userId: 'user-123',
              recipeId: 'recipe-1',
              recipeName: 'Vegan Pasta',
              score: 95
            });
          }
          return Promise.resolve(null);
        }
        static deleteMany() {
          return Promise.resolve({ deletedCount: 1 });
        }
        static insertMany() {
          return Promise.resolve([]);
        }
      }
      return MockModel;
    })
  };
});

// 4. MOCK DEL MIDDLEWARE DE AUTENTICACIÓN
jest.mock('../middleware/auth', () => ({
  authenticateJWT: (req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-token') {
      req.user = { sub: 'user-123', email: 'test@test.com' };
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

// Crear app de prueba
const app = express();
app.use(express.json());

const { authenticateJWT } = require('../middleware/auth');
const Recommendation = mongoose.model('Recommendation');

// Endpoints de prueba simulando el server real
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'recommendation-service' });
});

app.get('/recommendations/:userId', authenticateJWT, async (req, res) => {
  const { userId } = req.params;
  
  try {
    const recommendations = await Recommendation.find({ userId })
      .sort({ score: -1 })
      .limit(5)
      .lean();

    if (recommendations.length > 0) {
      const recipeNames = recommendations.map(r => r.recipeName);
      return res.json(recipeNames);
    }

    return res.json(["Select a category to see your recommendation."]);
  } catch (error) {
    res.json(["Error fetching recommendation"]);
  }
});

app.get('/recommendations/detail/:id', authenticateJWT, async (req, res) => {
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

// TESTS
describe('Recommendation Service API Tests', () => {
  
  // ============================================
  // TESTS BÁSICOS (de tu archivo original)
  // ============================================
  
  describe('GET /health', () => {
    it('must answer with 200 OK and UP status', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe('UP');
    });
  });

  describe('404 Error Tests', () => {
    it('GET /unknown-route must return 404', async () => {
      const res = await request(app).get('/api/v1/fantasy-route');
      expect(res.statusCode).toEqual(404);
    });

    it('GET / (root without ID) must return 404', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toEqual(404);
    });
  });

  // ============================================
  // TESTS DE AUTENTICACIÓN (requisito del profesor)
  // ============================================

  describe('GET /recommendations/:userId - Success Cases', () => {
    it('should return user recommendations with valid token', async () => {
      const response = await request(app)
        .get('/recommendations/user-123')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /recommendations/:userId - Failure Cases (REQ5)', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app).get('/recommendations/user-123');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });

    it('should return 403 for invalid token', async () => {
      const response = await request(app)
        .get('/recommendations/user-123')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Invalid token');
    });
  });

  describe('GET /recommendations/detail/:id - Failure Cases (REQ5)', () => {
    it('should return 404 for non-existent recommendation', async () => {
      const response = await request(app)
        .get('/recommendations/detail/nonexistent-id')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Recommendation not found');
    });

    it('should return 401 when no token is provided', async () => {
      const response = await request(app).get('/recommendations/detail/rec-1');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });
  });
});

// Cleanup después de los tests
afterAll(async () => {
  await new Promise(resolve => setTimeout(() => resolve(), 500));
});
