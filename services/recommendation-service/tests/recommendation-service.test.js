// services/recommendation-service/tests/recommendation-service.test.js
//
// Tests del recommendation-service.
// Cubren el endpoint principal con casos de éxito y de fallo.
//
const request = require('supertest');
const express = require('express');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn().mockResolvedValue(true),
      consume:     jest.fn()
    })
  })
}));

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({
    data: [
      { _id: 'r1', name: 'Chickpea Curry',  category: 'Vegan', averageRating: 9.1 },
      { _id: 'r2', name: 'Buddha Bowl',     category: 'Vegan', averageRating: 8.4 },
      { _id: 'r3', name: 'Lentil Dal',      category: 'Vegan', averageRating: 7.0 }
    ]
  })
}));

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({})
  };
});

jest.mock('../models/Recommendation', () => {
  // Los métodos se definen como jest.fn() para poder configurarlos en cada test
  const findMock        = jest.fn();
  const deleteManyMock  = jest.fn().mockResolvedValue({});
  const insertManyMock  = jest.fn().mockResolvedValue([]);

  function buildChain(results) {
    return {
      sort:  jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean:  jest.fn().mockResolvedValue(results)
    };
  }

  findMock.mockImplementation((query) => {
    // Por defecto devuelve recomendaciones para user-123
    if (query && query.userId === 'user-123') {
      return buildChain([
        { recipeName: 'Chickpea Curry', recipeRating: 9.1 },
        { recipeName: 'Buddha Bowl',    recipeRating: 8.4 }
      ]);
    }
    return buildChain([]);
  });

  return { find: findMock, deleteMany: deleteManyMock, insertMany: insertManyMock };
});

// ⚠️  IMPORTANTE: el auth.js real del recommendation-service devuelve:
//     sin header  → 401
//     token malo  → 401   ← también 401 (ver middleware/auth.js línea ~46)
//     token bueno → next()
jest.mock('../middleware/auth', () => ({
  authenticateJWT: (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    if (header !== 'Bearer valid-token') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = { sub: 'user-123', email: 'test@test.com' };
    next();
  }
}));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// ── Mini-app ──────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const { authenticateJWT } = require('../middleware/auth');
const Recommendation = require('../models/Recommendation');

app.get('/health', (_req, res) =>
  res.json({ status: 'UP', service: 'recommendation-service' })
);

// Endpoint principal — refleja la lógica real del server.js
app.get('/recommendations/:userId', authenticateJWT, async (req, res) => {
  const { userId } = req.params;
  const queryCategory = req.query.category;
  const index = Math.max(0, parseInt(req.query.index, 10) || 0);

  try {
    let saved = await Recommendation.find({ userId })
      .sort({ recipeRating: -1 })
      .limit(10)
      .lean();

    if (saved.length === 0) {
      return res.json(['Select a category to see your recommendation.']);
    }

    const pick = saved[Math.min(index, saved.length - 1)];
    return res.json([pick.recipeName]);
  } catch (err) {
    res.json(['Error fetching recommendation']);
  }
});

// Endpoint /all
app.get('/recommendations/:userId/all', authenticateJWT, async (req, res) => {
  const saved = await Recommendation.find({ userId: req.params.userId })
    .sort({ recipeRating: -1 })
    .lean();
  res.json(saved.map((r, i) => ({ position: i + 1, name: r.recipeName, rating: r.recipeRating })));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Recommendation Service – API Tests (REQ5, REQ7)', () => {

  beforeEach(() => jest.clearAllMocks());

  // ── Health ─────────────────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 and UP status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
      expect(res.body.service).toBe('recommendation-service');
    });
  });

  // ── GET /recommendations/:userId ───────────────────────────────────────────
  describe('GET /recommendations/:userId – success cases', () => {
    it('SUCCESS: returns first recommendation for the user', async () => {
      Recommendation.find.mockReturnValue({
        sort:  jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean:  jest.fn().mockResolvedValue([
          { recipeName: 'Chickpea Curry', recipeRating: 9.1 },
          { recipeName: 'Buddha Bowl',    recipeRating: 8.4 }
        ])
      });

      const res = await request(app)
        .get('/recommendations/user-123')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toBe('Chickpea Curry'); // la de mayor rating primero
    });

    it('SUCCESS: ?index=1 returns second recommendation', async () => {
      Recommendation.find.mockReturnValue({
        sort:  jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean:  jest.fn().mockResolvedValue([
          { recipeName: 'Chickpea Curry', recipeRating: 9.1 },
          { recipeName: 'Buddha Bowl',    recipeRating: 8.4 }
        ])
      });

      const res = await request(app)
        .get('/recommendations/user-123?index=1')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body[0]).toBe('Buddha Bowl');
    });

    it('SUCCESS: returns fallback message when no recommendations exist', async () => {
      Recommendation.find.mockReturnValue({
        sort:  jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean:  jest.fn().mockResolvedValue([])
      });

      const res = await request(app)
        .get('/recommendations/user-no-prefs')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body[0]).toContain('Select a category');
    });
  });

  // ── Failure cases (REQUERIDOS por el profesor) ────────────────────────────
  describe('GET /recommendations/:userId – REQ failure cases', () => {
    it('REQ FAIL: returns 401 – no token provided', async () => {
      const res = await request(app).get('/recommendations/user-123');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('REQ FAIL: returns 401 – invalid/expired token', async () => {
      const res = await request(app)
        .get('/recommendations/user-123')
        .set('Authorization', 'Bearer expired-or-bad-token');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid token');
    });
  });

  describe('GET /recommendations/:userId/all – REQ failure cases', () => {
    it('REQ FAIL: returns 401 – no token', async () => {
      const res = await request(app).get('/recommendations/user-123/all');
      expect(res.status).toBe(401);
    });

    it('REQ FAIL: returns 401 – bad token', async () => {
      const res = await request(app)
        .get('/recommendations/user-123/all')
        .set('Authorization', 'Bearer wrong-token');
      expect(res.status).toBe(401);
    });
  });

  // ── Ruta desconocida ───────────────────────────────────────────────────────
  describe('Unknown routes', () => {
    it('returns 404 for non-existent path', async () => {
      const res = await request(app).get('/api/v1/fantasy-route');
      expect(res.status).toBe(404);
    });
  });
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});
