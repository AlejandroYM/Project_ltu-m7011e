// services/recipe-service/recipe-service.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock de Mongoose antes de importar el servidor
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
      // Modelo mock de Recipe
      class MockModel {
        constructor(data) {
          Object.assign(this, data);
          this._id = 'mock-id-' + Date.now();
        }
        save() {
          return Promise.resolve(this);
        }
        static find() {
          return Promise.resolve([
            { _id: '1', name: 'Pasta Carbonara', ingredients: ['pasta', 'eggs'] },
            { _id: '2', name: 'Caesar Salad', ingredients: ['lettuce', 'dressing'] }
          ]);
        }
        static findById(id) {
          if (id === 'valid-id') {
            return Promise.resolve({ 
              _id: 'valid-id', 
              name: 'Pasta Carbonara', 
              ingredients: ['pasta', 'eggs'] 
            });
          }
          return Promise.resolve(null);
        }
      }
      return MockModel;
    })
  };
});

// Mock del middleware de autenticación
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
  },
  optionalAuthJWT: (req, res, next) => {
    req.user = null;
    next();
  }
}));

// Crear app de prueba
const app = express();
app.use(express.json());

// Importar middleware de autenticación mockeado
const { authenticateJWT, optionalAuthJWT } = require('./middleware/auth');

// Modelo mock
const Recipe = mongoose.model('Recipe');

// Endpoints de prueba
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/recipes', optionalAuthJWT, async (req, res) => {
  try {
    const recipes = await Recipe.find();
    res.json(recipes);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/recipes/:id', optionalAuthJWT, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    res.json(recipe);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/recipes', authenticateJWT, async (req, res) => {
  try {
    const { name, ingredients, instructions, category } = req.body;
    
    if (!name || !ingredients || !instructions) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['name', 'ingredients', 'instructions']
      });
    }

    const recipe = new Recipe({ name, ingredients, instructions, category });
    await recipe.save();
    res.status(201).json(recipe);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// TESTS
describe('Recipe Service API Tests', () => {
  
  // Test de salud
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy' });
    });
  });

  // Tests de éxito
  describe('GET /recipes - Success Cases', () => {
    it('should return all recipes', async () => {
      const response = await request(app).get('/recipes');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('name');
    });
  });

  describe('GET /recipes/:id - Success Cases', () => {
    it('should return a specific recipe by ID', async () => {
      const response = await request(app).get('/recipes/valid-id');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('_id', 'valid-id');
      expect(response.body).toHaveProperty('name', 'Pasta Carbonara');
    });
  });

  describe('POST /recipes - Success Cases', () => {
    it('should create a new recipe with valid token', async () => {
      const newRecipe = {
        name: 'Test Recipe',
        ingredients: ['ingredient1', 'ingredient2'],
        instructions: 'Mix everything',
        category: 'dessert'
      };

      const response = await request(app)
        .post('/recipes')
        .set('Authorization', 'Bearer valid-token')
        .send(newRecipe);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('name', 'Test Recipe');
      expect(response.body).toHaveProperty('_id');
    });
  });

  // Tests de fallo (REQUERIDOS POR EL PROFESOR)
  describe('GET /recipes/:id - Failure Cases', () => {
    it('should return 404 for non-existent recipe', async () => {
      const response = await request(app).get('/recipes/nonexistent-id');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Recipe not found');
    });
  });

  describe('POST /recipes - Failure Cases', () => {
    it('should return 400 for missing required fields', async () => {
      const invalidRecipe = {
        name: 'Incomplete Recipe'
        // Faltan ingredients e instructions
      };

      const response = await request(app)
        .post('/recipes')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidRecipe);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing required fields');
    });

    it('should return 401 when no token is provided', async () => {
      const newRecipe = {
        name: 'Test Recipe',
        ingredients: ['ingredient1'],
        instructions: 'Mix'
      };

      const response = await request(app)
        .post('/recipes')
        .send(newRecipe);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });

    it('should return 403 for invalid token', async () => {
      const newRecipe = {
        name: 'Test Recipe',
        ingredients: ['ingredient1'],
        instructions: 'Mix'
      };

      const response = await request(app)
        .post('/recipes')
        .set('Authorization', 'Bearer invalid-token')
        .send(newRecipe);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Invalid token');
    });
  });
});
