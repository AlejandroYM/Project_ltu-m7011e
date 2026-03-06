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
    req.user = { sub: header.replace('Bearer test-', ''), email: `${header.replace('Bearer test-', '')}@test.com` };
    next();
  }
}));

let mongod, app, User;
const auth = (id) => `Bearer test-${id}`;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.NODE_ENV  = 'test';
  app  = require('../server');
  User = require('../models/User');
  if (mongoose.connection.readyState !== 1)
    await new Promise(r => mongoose.connection.once('open', r));
}, 30000);

afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  for (const col of Object.values(mongoose.connection.collections)) await col.deleteMany({});
});

describe('GET /health', () => {
  it('returns UP', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
  });
});

describe('GET /users/:id', () => {
  it('401 without token', async () => {
    expect((await request(app).get('/users/u1')).status).toBe(401);
  });
  it('403 for another user', async () => {
    expect((await request(app).get('/users/other').set('Authorization', auth('me'))).status).toBe(403);
  });
  it('auto-creates user on first access and persists to MongoDB', async () => {
    const res = await request(app).get('/users/newuser').set('Authorization', auth('newuser'));
    expect(res.status).toBe(200);
    expect(await User.findOne({ keycloakId: 'newuser' })).not.toBeNull();
  });
  it('returns existing user without duplicating', async () => {
    await User.create({ keycloakId: 'existing', email: 'e@test.com', preferences: { category: 'Vegan' } });
    const res = await request(app).get('/users/existing').set('Authorization', auth('existing'));
    expect(res.status).toBe(200);
    expect(res.body.category).toBe('Vegan');
    expect(await User.countDocuments({ keycloakId: 'existing' })).toBe(1);
  });
});

describe('POST /users/preferences', () => {
  it('400 when category missing', async () => {
    expect((await request(app).post('/users/preferences').set('Authorization', auth('u1')).send({})).status).toBe(400);
  });
  it('creates user and saves preference in MongoDB', async () => {
    await request(app).post('/users/preferences').set('Authorization', auth('u2')).send({ category: 'Japanese' });
    expect((await User.findOne({ keycloakId: 'u2' })).preferences.category).toBe('Japanese');
  });
  it('updates existing user preference', async () => {
    await User.create({ keycloakId: 'u3', email: 'u3@test.com', preferences: { category: 'American' } });
    await request(app).post('/users/preferences').set('Authorization', auth('u3')).send({ category: 'Mexican' });
    expect((await User.findOne({ keycloakId: 'u3' })).preferences.category).toBe('Mexican');
  });
});

describe('DELETE /users/account', () => {
  it('401 without token', async () => {
    expect((await request(app).delete('/users/account')).status).toBe(401);
  });
  it('deletes user from MongoDB', async () => {
    await User.create({ keycloakId: 'todelete', email: 'td@test.com' });
    await request(app).delete('/users/account').set('Authorization', auth('todelete'));
    expect(await User.findOne({ keycloakId: 'todelete' })).toBeNull();
  });
  it('succeeds even when user does not exist', async () => {
    expect((await request(app).delete('/users/account').set('Authorization', auth('ghost'))).status).toBe(200);
  });
});

describe('User model', () => {
  it('requires keycloakId and email', async () => {
    await expect(User.create({ email: 'x@test.com' })).rejects.toThrow();
    await expect(User.create({ keycloakId: 'k1' })).rejects.toThrow();
  });
  it('enforces unique keycloakId', async () => {
    await User.create({ keycloakId: 'dup', email: 'a@test.com' });
    await expect(User.create({ keycloakId: 'dup', email: 'b@test.com' })).rejects.toThrow();
  });
  it('findByKeycloakId returns correct document or null', async () => {
    await User.create({ keycloakId: 'findme', email: 'f@test.com' });
    expect((await User.findByKeycloakId('findme')).keycloakId).toBe('findme');
    expect(await User.findByKeycloakId('nobody')).toBeNull();
  });
});
