'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request  = require('supertest');

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn().mockResolvedValue({}),
      sendToQueue: jest.fn(),
      consume:     jest.fn()
    })
  })
}));

jest.mock('../middleware/auth', () => ({
  authenticateJWT: (req, res, next) => {
    const header = req.headers['authorization'] || '';
    if (!header.startsWith('Bearer test-')) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { sub: header.replace('Bearer test-', '') };
    next();
  }
}));

const mockRecipes = [
  { _id: '64a000000000000000000001', name: 'Vegan Bowl',   category: 'Vegan',   averageRating: 9.2 },
  { _id: '64a000000000000000000002', name: 'Vegan Burger', category: 'Vegan',   averageRating: 8.5 },
  { _id: '64a000000000000000000003', name: 'Pasta',        category: 'Italian', averageRating: 8.0 },
];

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { access_token: 'mock-token', expires_in: 300 } }),
  get:  jest.fn().mockResolvedValue({ data: [...mockRecipes].sort((a, b) => b.averageRating - a.averageRating) })
}));

let mongod, app, Recommendation;
const auth = (id) => `Bearer test-${id}`;
const USER = 'user-001';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  app            = require('../server');
  Recommendation = require('../models/Recommendation');
  if (mongoose.connection.readyState !== 1)
    await new Promise(r => mongoose.connection.once('open', r));
}, 30000);

afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  for (const col of Object.values(mongoose.connection.collections)) await col.deleteMany({});
});

describe('GET /health', () => {
  it('returns UP', async () => {
    expect((await request(app).get('/health')).body.status).toBe('UP');
  });
});

describe('GET /recommendations/:userId?category=...', () => {
  it('401 without token', async () => {
    expect((await request(app).get(`/recommendations/${USER}?category=Vegan`)).status).toBe(401);
  });
  it('returns top-rated recipe and persists to MongoDB', async () => {
    const res = await request(app).get(`/recommendations/${USER}?category=Vegan`).set('Authorization', auth(USER));
    expect(res.status).toBe(200);
    expect(res.body[0]).toBe('Vegan Bowl');
    expect(await Recommendation.countDocuments({ userId: USER })).toBeGreaterThan(0);
  });
  it('returns 2nd recipe when index=1', async () => {
    const res = await request(app).get(`/recommendations/${USER}?category=Vegan&index=1`).set('Authorization', auth(USER));
    expect(res.body[0]).toBe('Vegan Burger');
  });
  it('reuses saved recs on second request (no duplicates)', async () => {
    await request(app).get(`/recommendations/${USER}?category=Vegan`).set('Authorization', auth(USER));
    const count1 = await Recommendation.countDocuments({ userId: USER });
    await request(app).get(`/recommendations/${USER}?category=Vegan`).set('Authorization', auth(USER));
    expect(await Recommendation.countDocuments({ userId: USER })).toBe(count1);
  });
  it('friendly message when category has no recipes', async () => {
    const res = await request(app).get(`/recommendations/${USER}?category=NoSuch`).set('Authorization', auth(USER));
    expect(res.body[0]).toContain('NoSuch');
  });
});

describe('GET /recommendations/:userId (no category)', () => {
  it('returns prompt when no recs saved', async () => {
    const res = await request(app).get(`/recommendations/${USER}`).set('Authorization', auth(USER));
    expect(res.body[0]).toContain('Select a category');
  });
  it('returns recs sorted by rating desc', async () => {
    await Recommendation.insertMany([
      { userId: USER, recipeName: 'Low',  category: 'Italian', recipeRating: 5, score: 50, reason: 'preference_match' },
      { userId: USER, recipeName: 'High', category: 'Italian', recipeRating: 9, score: 90, reason: 'preference_match' },
    ]);
    expect((await request(app).get(`/recommendations/${USER}`).set('Authorization', auth(USER))).body[0]).toBe('High');
  });
});

describe('GET /recommendations/:userId/all', () => {
  it('401 without token', async () => {
    expect((await request(app).get(`/recommendations/${USER}/all`)).status).toBe(401);
  });
  it('returns all recs with correct shape sorted desc', async () => {
    await Recommendation.insertMany([
      { userId: USER, recipeName: 'A', category: 'Vegan', recipeRating: 9, score: 90, reason: 'preference_match' },
      { userId: USER, recipeName: 'B', category: 'Vegan', recipeRating: 7, score: 70, reason: 'preference_match' },
    ]);
    const res = await request(app).get(`/recommendations/${USER}/all`).set('Authorization', auth(USER));
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('A');
    expect(res.body[0]).toHaveProperty('position');
    expect(res.body[0]).toHaveProperty('rating');
  });
  it('does not return another user recs', async () => {
    await Recommendation.insertMany([
      { userId: USER,    recipeName: 'Mine',   category: 'Vegan', recipeRating: 8, score: 80, reason: 'preference_match' },
      { userId: 'other', recipeName: 'Theirs', category: 'Vegan', recipeRating: 9, score: 90, reason: 'preference_match' },
    ]);
    const res = await request(app).get(`/recommendations/${USER}/all`).set('Authorization', auth(USER));
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Mine');
  });
});

describe('Recommendation model', () => {
  it('requires userId, recipeName and category', async () => {
    await expect(Recommendation.create({ recipeName: 'X', category: 'Vegan' })).rejects.toThrow();
    await expect(Recommendation.create({ userId: 'u', category: 'Vegan' })).rejects.toThrow();
  });
  it('enforces unique userId + recipeName', async () => {
    await Recommendation.create({ userId: 'u', recipeName: 'Dup', category: 'Vegan', recipeRating: 8, score: 80, reason: 'preference_match' });
    await expect(Recommendation.create({ userId: 'u', recipeName: 'Dup', category: 'Vegan', recipeRating: 9, score: 90, reason: 'preference_match' })).rejects.toThrow();
  });
  it('defaults recipeRating to 5', async () => {
    const r = await Recommendation.create({ userId: 'u2', recipeName: 'Default', category: 'Vegan' });
    expect(r.recipeRating).toBe(5);
  });
});
