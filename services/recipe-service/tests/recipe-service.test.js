'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request  = require('supertest');

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn().mockResolvedValue({}),
      sendToQueue: jest.fn().mockReturnValue(true),
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

let mongod, app, Recipe, Rating, MealPlan;
const auth    = (id) => `Bearer test-${id}`;
const OWNER   = 'owner';
const newRecipe = (o = {}) => Recipe.create({ name: 'Pasta', category: 'Italian', userId: OWNER, ...o });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  app      = require('../server');
  Recipe   = require('../models/Recipe');
  Rating   = require('../models/Rating');
  MealPlan = require('../models/MealPlan');
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

describe('GET /recipes', () => {
  beforeEach(async () => {
    await Recipe.insertMany([
      { name: 'Pasta',  category: 'Italian',  userId: OWNER, averageRating: 7 },
      { name: 'Tacos',  category: 'Mexican',  userId: OWNER, averageRating: 9 },
      { name: 'Sushi',  category: 'Japanese', userId: OWNER, averageRating: 8 },
    ]);
  });
  it('returns all recipes', async () => {
    expect((await request(app).get('/recipes')).body.length).toBe(3);
  });
  it('filters by category', async () => {
    const res = await request(app).get('/recipes?category=Italian');
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Pasta');
  });
  it('sorts by rating descending', async () => {
    const ratings = (await request(app).get('/recipes?sort=rating_desc')).body.map(r => r.averageRating);
    for (let i = 0; i < ratings.length - 1; i++) expect(ratings[i]).toBeGreaterThanOrEqual(ratings[i + 1]);
  });
});

describe('POST /recipes', () => {
  it('401 without token', async () => {
    expect((await request(app).post('/recipes').send({ name: 'X', category: 'Italian' })).status).toBe(401);
  });
  it('creates recipe and persists to MongoDB', async () => {
    const res = await request(app).post('/recipes').set('Authorization', auth(OWNER)).send({ name: 'Carbonara', category: 'Italian' });
    expect(res.status).toBe(201);
    expect(await Recipe.findById(res.body._id)).not.toBeNull();
  });
  it('400 for missing required fields', async () => {
    expect((await request(app).post('/recipes').set('Authorization', auth(OWNER)).send({ name: 'No category' })).status).toBe(400);
  });
});

describe('DELETE /recipes/:id', () => {
  it('deletes own recipe and its ratings', async () => {
    const r = await newRecipe({ userId: OWNER });
    await Rating.create({ userId: 'voter', recipeId: r._id, score: 8 });
    expect((await request(app).delete(`/recipes/${r._id}`).set('Authorization', auth(OWNER))).status).toBe(200);
    expect(await Recipe.findById(r._id)).toBeNull();
    expect(await Rating.findOne({ recipeId: r._id })).toBeNull();
  });
  it('403 when deleting another user recipe', async () => {
    const r = await newRecipe({ userId: OWNER });
    expect((await request(app).delete(`/recipes/${r._id}`).set('Authorization', auth('other'))).status).toBe(403);
  });
  it('404 for non-existent recipe', async () => {
    expect((await request(app).delete(`/recipes/${new mongoose.Types.ObjectId()}`).set('Authorization', auth(OWNER))).status).toBe(404);
  });
});

describe('POST /recipes/:id/rate', () => {
  let recipe;
  beforeEach(async () => { recipe = await newRecipe({ averageRating: 6, ratingCount: 0 }); });

  it('saves rating and recalculates averageRating', async () => {
    const res = await request(app).post(`/recipes/${recipe._id}/rate`).set('Authorization', auth('voter1')).send({ score: 8 });
    expect(res.status).toBe(200);
    expect((await Recipe.findById(recipe._id)).averageRating).toBe(8);
  });
  it('409 on duplicate rating', async () => {
    await request(app).post(`/recipes/${recipe._id}/rate`).set('Authorization', auth('v')).send({ score: 7 });
    expect((await request(app).post(`/recipes/${recipe._id}/rate`).set('Authorization', auth('v')).send({ score: 5 })).status).toBe(409);
  });
  it('400 for score out of range', async () => {
    expect((await request(app).post(`/recipes/${recipe._id}/rate`).set('Authorization', auth('v2')).send({ score: 11 })).status).toBe(400);
  });
});

describe('Meal plans', () => {
  const U = 'meal-user';
  beforeEach(async () => {
    await Recipe.insertMany([
      { name: 'Pizza',   category: 'Italian', userId: OWNER, averageRating: 8 },
      { name: 'Lasagna', category: 'Italian', userId: OWNER, averageRating: 7 },
    ]);
  });

  it('GET 401 without token', async () => {
    expect((await request(app).get(`/meal-plans/${U}/3/2025`)).status).toBe(401);
  });
  it('GET 403 for another user', async () => {
    expect((await request(app).get(`/meal-plans/${U}/3/2025`).set('Authorization', auth('spy'))).status).toBe(403);
  });
  it('auto-generates and persists meal plan', async () => {
    const res = await request(app).get(`/meal-plans/${U}/3/2025?category=Italian`).set('Authorization', auth(U));
    expect(res.status).toBe(200);
    expect(res.body.days.length).toBe(31);
    expect(await MealPlan.findOne({ userId: U, month: 3, year: 2025 })).not.toBeNull();
  });
  it('no duplication on second request', async () => {
    await request(app).get(`/meal-plans/${U}/4/2025`).set('Authorization', auth(U));
    await request(app).get(`/meal-plans/${U}/4/2025`).set('Authorization', auth(U));
    expect(await MealPlan.countDocuments({ userId: U, month: 4, year: 2025 })).toBe(1);
  });
  it('DELETE own meal plan', async () => {
    const mp = await MealPlan.create({ userId: U, month: 5, year: 2025, category: 'Mixed', days: [] });
    expect((await request(app).delete(`/meal-plans/${mp._id}`).set('Authorization', auth(U))).status).toBe(200);
    expect(await MealPlan.findById(mp._id)).toBeNull();
  });
  it('GET sort=rating_asc', async () => {
  const ratings = (await request(app).get('/recipes?sort=rating_asc')).body.map(r => r.averageRating);
  for (let i = 0; i < ratings.length - 1; i++) expect(ratings[i]).toBeLessThanOrEqual(ratings[i + 1]);
});

it('POST /meal-plans creates plan', async () => {
  const res = await request(app).post('/meal-plans').set('Authorization', auth(U))
    .send({ userId: U, month: 6, year: 2025, category: 'Italian' });
  expect(res.status).toBe(201);
});
});

describe('Recipe model', () => {
  it('requires name, category and userId', async () => {
    await expect(Recipe.create({ category: 'Italian', userId: 'u' })).rejects.toThrow();
    await expect(Recipe.create({ name: 'X', userId: 'u' })).rejects.toThrow();
  });
  it('default averageRating between 4 and 10', async () => {
    const r = await Recipe.create({ name: 'R', category: 'American', userId: 'u' });
    expect(r.averageRating).toBeGreaterThanOrEqual(4);
    expect(r.averageRating).toBeLessThanOrEqual(10);
  });
});
