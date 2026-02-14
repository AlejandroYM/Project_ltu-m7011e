const request = require('supertest');
const app = require('../server');

// 1. MOCK DE RABBITMQ -> This is to prevent actual RabbitMQ operations during testing
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn().mockResolvedValue(true),
      consume: jest.fn()
    })
  })
}));

// 2. MOCK DE MONGOOSE -> This is to prevent actual database operations during testing
jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(),
  Schema: jest.fn(),
  model: jest.fn().mockReturnValue({
    find: jest.fn().mockResolvedValue([]), // Simulate empty recommendations
    deleteMany: jest.fn().mockResolvedValue(true),
    insertMany: jest.fn().mockResolvedValue(true)
  })
}));

// Mute console logs during testing
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Recommendation Service - REQ5 Tests', () => {

  // Happy Path Test (Successful response)
  test('GET /health must answer with 200 OK and UP status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toBe('UP');
  });

  // Error Test 1 (Error 404)
  test('GET /unknown-route must return 404', async () => {
    const res = await request(app).get('/api/v1/fantasy-route');
    expect(res.statusCode).toEqual(404);
  });

  // Error Test 2 (Error 404 - Simulate empty recommendations) -> if we call the recommendations endpoint and there are no recommendations, it should return 404
  test('GET / (raíz without ID) must return 404', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toEqual(404);
  });
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(() => resolve(), 500));
});