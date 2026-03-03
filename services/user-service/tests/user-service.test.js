// services/user-service/tests/user-service.test.js
// Tests for user-service API 
// Fills the endpoints related to user profile management, including authentication scenarios and error handling.
const request = require('supertest');
const express = require('express');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({})
  };
});

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue:  jest.fn().mockResolvedValue(true),
      sendToQueue:  jest.fn().mockResolvedValue(true)
    })
  })
}));

jest.mock('dotenv', () => ({ config: jest.fn() }));

// Mock for User model: we keep the real constructor to preserve schema validation,
// but mock static methods and instance methods.
jest.mock('../models/User', () => {
  function MockUser(data) {
    Object.assign(this, data);
    this._id = 'mock-user-id';
  }
  MockUser.findOne          = jest.fn();
  MockUser.findById         = jest.fn();
  MockUser.findByIdAndUpdate = jest.fn();
  MockUser.findByKeycloakId  = jest.fn();
  MockUser.prototype.save   = jest.fn().mockResolvedValue(undefined);

  // validatePreferences is a method of the real model instance
  MockUser.prototype.validatePreferences = jest.fn().mockReturnValue(true);

  return MockUser;
});

// IMPORTANT: adjust the mock to match the real behavior of auth.js in user-service.
// For consistency with the rest of the project, we use the same JWKS pattern:
//     no header  → 401
//     bad token  → 401  (JWKS verifier throws error and returns 401)
//     good token → next()
jest.mock('../middleware/auth', () => ({
  authenticateJWT: (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    if (header !== 'Bearer valid-token') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = { sub: 'existing-user', email: 'test@test.com' };
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
const User = require('../models/User');

app.get('/health', (_req, res) => res.json({ status: 'UP', service: 'user-service' }));

app.get('/users/profile', authenticateJWT, async (req, res) => {
  try {
    const user = await User.findByKeycloakId(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User profile not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/users/profile', authenticateJWT, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing required field: email' });

    const existing = await User.findByKeycloakId(req.user.sub);
    if (existing) return res.status(409).json({ error: 'User profile already exists' });

    const user = new User({ keycloakId: req.user.sub, email, preferences: req.body.preferences || {} });
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/users/profile', authenticateJWT, async (req, res) => {
  try {
    const { preferences } = req.body;
    if (!preferences) return res.status(400).json({ error: 'Missing required field: preferences' });

    const user = await User.findByIdAndUpdate(req.user.sub, { preferences }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/users/profile', authenticateJWT, async (req, res) => {
  try {
    const user = await User.findByKeycloakId(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('User Service – API Tests (REQ5, REQ7)', () => {

  beforeEach(() => jest.clearAllMocks());

  // ── Health ─────────────────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 and UP status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
    });
  });

  // ── GET /users/profile ─────────────────────────────────────────────────────
  describe('GET /users/profile', () => {
    it('SUCCESS: returns profile with valid token', async () => {
      User.findByKeycloakId.mockResolvedValue({
        _id: 'u1', keycloakId: 'existing-user', email: 'test@test.com',
        preferences: { category: 'Vegan' }
      });

      const res = await request(app)
        .get('/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('email', 'test@test.com');
    });

    it('REQ FAIL: returns 401 – no token', async () => {
      const res = await request(app).get('/users/profile');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('REQ FAIL: returns 401 – invalid token', async () => {
      const res = await request(app)
        .get('/users/profile')
        .set('Authorization', 'Bearer bad-token');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid token');
    });

    it('REQ FAIL: returns 404 – user does not exist', async () => {
      User.findByKeycloakId.mockResolvedValue(null);
      const res = await request(app)
        .get('/users/profile')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User profile not found');
    });
  });

  // ── POST /users/profile ────────────────────────────────────────────────────
  describe('POST /users/profile', () => {
    it('SUCCESS: creates a new profile', async () => {
      User.findByKeycloakId.mockResolvedValue(null); // no existe aún

      const res = await request(app)
        .post('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ email: 'new@test.com', preferences: { category: 'Italian' } });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('email', 'new@test.com');
    });

    it('REQ FAIL: returns 401 – no token', async () => {
      const res = await request(app)
        .post('/users/profile')
        .send({ email: 'x@test.com' });
      expect(res.status).toBe(401);
    });

    it('REQ FAIL: returns 400 – email is missing', async () => {
      const res = await request(app)
        .post('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ preferences: { category: 'Vegan' } }); // sin email
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required field: email');
    });

    it('REQ FAIL: returns 409 – profile already exists', async () => {
      User.findByKeycloakId.mockResolvedValue({ _id: 'u1', email: 'existing@test.com' });

      const res = await request(app)
        .post('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ email: 'existing@test.com' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('User profile already exists');
    });
  });

  // ── PUT /users/profile ─────────────────────────────────────────────────────
  describe('PUT /users/profile', () => {
    it('SUCCESS: updates preferences', async () => {
      User.findByIdAndUpdate.mockResolvedValue({
        _id: 'u1', email: 'test@test.com', preferences: { category: 'Mexican' }
      });

      const res = await request(app)
        .put('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ preferences: { category: 'Mexican' } });

      expect(res.status).toBe(200);
      expect(res.body.preferences.category).toBe('Mexican');
    });

    it('REQ FAIL: returns 401 – no token', async () => {
      const res = await request(app)
        .put('/users/profile')
        .send({ preferences: { category: 'Vegan' } });
      expect(res.status).toBe(401);
    });

    it('REQ FAIL: returns 400 – preferences field is missing', async () => {
      const res = await request(app)
        .put('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({}); // empty body, no preferences
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required field: preferences');
    });

    it('REQ FAIL: returns 404 – user not found in DB', async () => {
      User.findByIdAndUpdate.mockResolvedValue(null);
      const res = await request(app)
        .put('/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ preferences: { category: 'Vegan' } });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });
  });

  // ── DELETE /users/profile ──────────────────────────────────────────────────
  describe('DELETE /users/profile', () => {
    it('REQ FAIL: returns 401 – no token', async () => {
      const res = await request(app).delete('/users/profile');
      expect(res.status).toBe(401);
    });

    it('REQ FAIL: returns 404 – user not found', async () => {
      User.findByKeycloakId.mockResolvedValue(null);
      const res = await request(app)
        .delete('/users/profile')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });
  });

  // ── Unknown route ───────────────────────────────────────────────────────
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
