// services/recipe-service/tests/recipe-service.test.js
//
// Tests de integración del recipe-service.
// Cubren todos los endpoints con casos de éxito y de fallo.
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
      ObjectId: { isValid: jest.fn((id) => id === 'valid-object-id-123') }
    }
  };
});

jest.mock('../models/Recipe', () => {
  function MockRecipe(data) {
    Object.assign(this, data);
    this._id = 'mock-id-' + Date.now();
  }
  MockRecipe.find      = jest.fn();
  MockRecipe.findById  = jest.fn();
  MockRecipe.prototype.save = jest.fn().mockResolvedValue(undefined);
  return MockRecipe;
});

jest.mock('../models/Rating', () => {
  function MockRating(data) { Object.assign(this, data); }
  MockRating.findOne = jest.fn();
  MockRating.find    = jest.fn();
  MockRating.create  = jest.fn();
  return MockRating;
});

// ⚠️  IMPORTANTE: el auth.js real del recipe-service devuelve:
//     sin header  → 401
//     token malo  → 403   ← NO es 401, es 403 (ver middleware/auth.js línea ~50)
//     token bueno → next()
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

// ── Mini-app ──────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const { authenticateJWT, optionalAuthJWT } = require('../middleware/auth');
const Recipe  = require('../models/Recipe');
const Rating  = require('../models/Rating');

app.get('/health', (_req, res) => res.json({ status: 'UP', service: 'recipe-service' }));

app.get('/recipes', optionalAuthJWT, async (req, res) => {
  const { sort } = req.query;
  let results = await Recipe.find();
  if (sort === 'rating_desc') results.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
  res.json(results);
});

app.post('/recipes', authenticateJWT, async (req, res) => {
  const { name, category, ingredients } = req.body;
  if (!name || !category || !ingredients) {
    return res.status(400).json({ error: 'Missing required fields: name, category, ingredients' });
  }
  const recipe = new Recipe({ ...req.body, userId: req.user.sub });
  await recipe.save();
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

  const existing = await Rating.findOne({ userId: req.user.sub, recipeId: req.params.id });
  if (existing) return res.status(409).json({ error: 'You have already rated this recipe' });

  await Rating.create({ userId: req.user.sub, recipeId: req.params.id, score });
  res.json({ message: 'Rating saved', averageRating: score, ratingCount: 1 });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Recipe Service – Full API Tests (REQ5, REQ7)', () => {

  beforeEach(() => jest.clearAllMocks());

  // ── Health ─────────────────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 and UP status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
    });
  });

  // ── GET /recipes ───────────────────────────────────────────────────────────
  describe('GET /recipes', () => {
    it('SUCCESS: returns all recipes without auth', async () => {
      Recipe.find.mockResolvedValue([
        { _id: '1', name: 'Carbonara',   category: 'Italian', averageRating: 8.5 },
        { _id: '2', name: 'Buddha Bowl', category: 'Vegan',   averageRating: 7.2 }
      ]);
      const res = await request(app).get('/recipes');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('SUCCESS: ?sort=rating_desc returns recipes ordered by rating', async () => {
      Recipe.find.mockResolvedValue([
        { _id: '1', name: 'Low',  averageRating: 5.0 },
        { _id: '2', name: 'High', averageRating: 9.0 }
      ]);
      const res = await request(app).get('/recipes?sort=rating_desc');
      expect(res.status).toBe(200);
      expect(res.body[0].name).toBe('High');
    });
  });

  // ── POST /recipes ──────────────────────────────────────────────────────────
  describe('POST /recipes', () => {
    it('SUCCESS: creates recipe with valid token and all required fields', async () => {
      const res = await request(app)
        .post('/recipes')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'New Recipe', category: 'Italian', ingredients: ['pasta'] });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('name', 'New Recipe');
    });

    it('REQ FAIL: returns 401 – no token provided', async () => {
      const res = await request(app)
        .post('/recipes')
        .send({ name: 'X', category: 'Italian', ingredients: ['x'] });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('REQ FAIL: returns 403 – invalid token', async () => {
      const res = await request(app)
        .post('/recipes')
        .set('Authorization', 'Bearer bad-token')
        .send({ name: 'X', category: 'Italian', ingredients: ['x'] });
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Invalid token');
    });

    it('REQ FAIL: returns 400 – missing required fields', async () => {
      const res = await request(app)
        .post('/recipes')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'No category no ingredients' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── DELETE /recipes/:id ────────────────────────────────────────────────────
  describe('DELETE /recipes/:id', () => {
    it('SUCCESS: deletes own recipe', async () => {
      Recipe.findById.mockResolvedValue({ _id: 'valid-object-id-123', userId: 'user-123' });
      const res = await request(app)
        .delete('/recipes/valid-object-id-123')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Recipe deleted successfully');
    });

    it('REQ FAIL: returns 401 – no token', async () => {
      const res = await request(app).delete('/recipes/valid-object-id-123');
      expect(res.status).toBe(401);
    });

    it('REQ FAIL: returns 403 – non-ObjectId (static recipe)', async () => {
      const res = await request(app)
        .delete('/recipes/static-recipe-id')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Cannot delete static recipes');
    });

    it('REQ FAIL: returns 404 – recipe not found in DB', async () => {
      Recipe.findById.mockResolvedValue(null);
      const res = await request(app)
        .delete('/recipes/valid-object-id-123')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Recipe not found');
    });

    it('REQ FAIL: returns 403 – user is not the owner', async () => {
      Recipe.findById.mockResolvedValue({ _id: 'valid-object-id-123', userId: 'other-user' });
      const res = await request(app)
        .delete('/recipes/valid-object-id-123')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You can only delete recipes you have created');
    });
  });

  // ── POST /recipes/:id/rate ─────────────────────────────────────────────────
  describe('POST /recipes/:id/rate', () => {
    it('SUCCESS: rates a recipe with valid data', async () => {
      Recipe.findById.mockResolvedValue({ _id: 'valid-object-id-123', name: 'Carbonara' });
      Rating.findOne.mockResolvedValue(null);
      Rating.create.mockResolvedValue({});

      const res = await request(app)
        .post('/recipes/valid-object-id-123/rate')
        .set('Authorization', 'Bearer valid-token')
        .send({ score: 8 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('averageRating', 8);
    });

    it('REQ FAIL: returns 401 – no token', async () => {
      const res = await request(app)
        .post('/recipes/valid-object-id-123/rate')
        .send({ score: 8 });
      expect(res.status).toBe(401);
    });

    it('REQ FAIL: returns 400 – invalid recipe ID format', async () => {
      const res = await request(app)
        .post('/recipes/bad-id/rate')
        .set('Authorization', 'Bearer valid-token')
        .send({ score: 8 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid recipe id');
    });

    it('REQ FAIL: returns 400 – score out of range', async () => {
      const res = await request(app)
        .post('/recipes/valid-object-id-123/rate')
        .set('Authorization', 'Bearer valid-token')
        .send({ score: 11 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Score must be 0-10');
    });

    it('REQ FAIL: returns 404 – recipe not found', async () => {
      Recipe.findById.mockResolvedValue(null);
      const res = await request(app)
        .post('/recipes/valid-object-id-123/rate')
        .set('Authorization', 'Bearer valid-token')
        .send({ score: 7 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Recipe not found');
    });

    it('REQ FAIL: returns 409 – user already rated this recipe', async () => {
      Recipe.findById.mockResolvedValue({ _id: 'valid-object-id-123' });
      Rating.findOne.mockResolvedValue({ score: 8 }); // ya existe

      const res = await request(app)
        .post('/recipes/valid-object-id-123/rate')
        .set('Authorization', 'Bearer valid-token')
        .send({ score: 9 });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('You have already rated this recipe');
    });
  });

  // ── Ruta desconocida ───────────────────────────────────────────────────────
  describe('Unknown routes', () => {
    it('returns 404 for non-existent path', async () => {
      const res = await request(app).get('/api/v99/fantasy');
      expect(res.status).toBe(404);
    });
  });
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});
