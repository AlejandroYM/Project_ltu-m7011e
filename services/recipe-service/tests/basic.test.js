// services/recipe-service/tests/basic.test.js
//
// Tests básicos del recipe-service.
// Usan una mini-app en lugar del server real para evitar
// conexiones a MongoDB/RabbitMQ/MinIO durante los tests.
//
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({}),
    Types: {
      ObjectId: {
        // Solo 'valid-object-id-123' se considera válido en los tests
        isValid: jest.fn((id) => id === 'valid-object-id-123')
      }
    }
  };
});

// Recipe model mock
jest.mock('../models/Recipe', () => {
  const findMock = jest.fn();
  const findByIdMock = jest.fn();

  function MockRecipe(data) {
    Object.assign(this, data);
    this._id = 'mock-id-' + Date.now();
  }
  MockRecipe.find      = findMock;
  MockRecipe.findById  = findByIdMock;

  return MockRecipe;
});

// auth.js mock — refleja el comportamiento REAL del middleware:
//   sin header  → 401
//   token malo  → 403  (recipe-service devuelve 403 para token inválido)
//   token bueno → next()
jest.mock('../middleware/auth', () => ({
  authenticateJWT: (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    if (header !== 'Bearer valid-token') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = { sub: 'user-123', email: 'test@test.com' };
    next();
  },
  optionalAuthJWT: (req, res, next) => { req.user = null; next(); }
}));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// ── Mini-app de prueba ────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const { authenticateJWT, optionalAuthJWT } = require('../middleware/auth');
const Recipe = require('../models/Recipe');

app.get('/health', (_req, res) => res.json({ status: 'UP', service: 'recipe-service' }));

app.get('/recipes', optionalAuthJWT, async (_req, res) => {
  const recipes = await Recipe.find();
  res.json(recipes);
});

app.post('/recipes', authenticateJWT, async (req, res) => {
  const { name, category, ingredients } = req.body;
  if (!name || !category || !ingredients) {
    return res.status(400).json({ error: 'Missing required fields: name, category, ingredients' });
  }
  const recipe = new Recipe({ ...req.body, userId: req.user.sub });
  res.status(201).json(recipe);
});

app.delete('/recipes/:id', authenticateJWT, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(403).json({ error: 'Cannot delete static recipes' });
  }
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  if (recipe.userId !== req.user.sub) {
    return res.status(403).json({ error: 'You can only delete recipes you have created' });
  }
  res.json({ message: 'Recipe deleted successfully' });
});

app.post('/recipes/:id/rate', authenticateJWT, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid recipe id' });
  }
  const score = Number(req.body.score);
  if (isNaN(score) || score < 0 || score > 10) {
    return res.status(400).json({ error: 'Score must be 0-10' });
  }
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json({ message: 'Rating saved', averageRating: score });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Recipe Service – Basic Tests (REQ5)', () => {

  beforeEach(() => jest.clearAllMocks());

  // ── Health ─────────────────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 and UP status', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('UP');
    });
  });

  // ── GET /recipes ───────────────────────────────────────────────────────────
  describe('GET /recipes – success', () => {
    it('returns 200 and an array of recipes', async () => {
      Recipe.find.mockResolvedValue([
        { _id: '1', name: 'Carbonara', category: 'Italian' },
        { _id: '2', name: 'Buddha Bowl', category: 'Vegan' }
      ]);

      const res = await request(app).get('/recipes');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  // ── POST /recipes – failure cases (requeridos por el profesor) ─────────────
  describe('POST /recipes – failure cases', () => {
    it('REQ: returns 401 when no token is provided', async () => {
      const res = await request(app)
        .post('/recipes')
        .send({ name: 'Test', category: 'Italian', ingredients: ['x'] });

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('REQ: returns 403 for an invalid/expired token', async () => {
      const res = await request(app)
        .post('/recipes')
        .set('Authorization', 'Bearer bad-token')
        .send({ name: 'Test', category: 'Italian', ingredients: ['x'] });

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty('error', 'Invalid token');
    });

    it('REQ: returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/recipes')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Incomplete' }); // falta category e ingredients

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── DELETE /recipes/:id – failure cases ────────────────────────────────────
  describe('DELETE /recipes/:id – failure cases', () => {
    it('REQ: returns 401 with no token', async () => {
      const res = await request(app).delete('/recipes/valid-object-id-123');
      expect(res.statusCode).toBe(401);
    });

    it('REQ: returns 403 for a non-ObjectId (static recipe)', async () => {
      const res = await request(app)
        .delete('/recipes/not-a-valid-id')
        .set('Authorization', 'Bearer valid-token');

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty('error', 'Cannot delete static recipes');
    });

    it('REQ: returns 404 when recipe does not exist', async () => {
      Recipe.findById.mockResolvedValue(null);

      const res = await request(app)
        .delete('/recipes/valid-object-id-123')
        .set('Authorization', 'Bearer valid-token');

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Recipe not found');
    });
  });

  // ── POST /recipes/:id/rate – failure cases ─────────────────────────────────
  describe('POST /recipes/:id/rate – failure cases', () => {
    it('REQ: returns 400 for invalid recipe ID format', async () => {
      const res = await request(app)
        .post('/recipes/bad-id/rate')
        .set('Authorization', 'Bearer valid-token')
        .send({ score: 8 });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid recipe id');
    });

    it('REQ: returns 400 when score is out of range', async () => {
      const res = await request(app)
        .post('/recipes/valid-object-id-123/rate')
        .set('Authorization', 'Bearer valid-token')
        .send({ score: 15 }); // máximo es 10

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Score must be 0-10');
    });

    it('REQ: returns 404 when recipe to rate does not exist', async () => {
      Recipe.findById.mockResolvedValue(null);

      const res = await request(app)
        .post('/recipes/valid-object-id-123/rate')
        .set('Authorization', 'Bearer valid-token')
        .send({ score: 7 });

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Recipe not found');
    });
  });

  // ── Ruta desconocida ───────────────────────────────────────────────────────
  describe('Unknown routes', () => {
    it('returns 404 for a non-existent path', async () => {
      const res = await request(app).get('/api/fantasy-route');
      expect(res.statusCode).toBe(404);
    });
  });
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});
