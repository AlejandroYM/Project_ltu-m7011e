const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server'); // Import the app from your server file

// 1. MOCK FOR MONGOOSE -> This is to prevent actual database operations during testing
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    connect: jest.fn().mockResolvedValue(),
    model: jest.fn(),
    Types: {
      ObjectId: {
        isValid: jest.fn((id) => id === 'valid_id_123') // Simulate valid ObjectId check
      }
    }
  };
});

// Mock Recipe model to control if save() succeeds or fails
jest.mock('../models/Recipe', () => {
  return jest.fn().mockImplementation(() => ({
    save: jest.fn().mockResolvedValue({ name: 'Test Recipe' }) 
  }));
});

// Silence logs during testing
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe ('Recpie Service - REQ5 Tests', () => {
  // Happy Path Test (Text de exito)
  test('Get /recipes - should return 200 and a list of recipes (JSON) ', async () => {
    const res = await request(app).get('/recipes');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Verify that the response contains at least returns static recipes
    expect(res.body.length).toBeGreaterThan(0);
  });

  // Error Test 1 (Error 404)
  test('Get /nonexistent - should return 404', async () => {
    const res = await request(app).get('/api/nonexistent_path');
    expect(res.statusCode).toEqual(404);
  });

  // Error Test 2 (Error 403 - Logic error)
  // If the ID is invalid, the service should return a 403 error
  test('DELETE /recipes/:id with invalid ID must return 403', async () => {
    const invalidId = 'id-falso-123'; 
    const res = await request(app).delete(`/recipes/${invalidId}`);
    
    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toBeDefined();
  });
});
afterAll(async () => {
  // Clean close the mongoose connection after all tests are done
  await new Promise(resolve => setTimeout(() => resolve(), 500));
});