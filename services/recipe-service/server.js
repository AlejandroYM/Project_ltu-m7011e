const express = require('express');
const Keycloak = require('keycloak-connect');
const session = require('express-session');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
app.use(express.json());

// --- 1. CONFIGURACIÓN DE SESIÓN (REQ20) ---
const memoryStore = new session.MemoryStore();
app.use(session({
  secret: process.env.SESSION_SECRET || 'recipe_service_secret',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

// --- 2. CONFIGURACIÓN DE KEYCLOAK (REQ20) ---
const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'ChefMatchRealm',
  'auth-server-url': process.env.KEYCLOAK_URL || 'http://localhost:8080/',
  resource: 'recipe-service',
  'ssl-required': 'external',
  'public-client': true
};
const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);
app.use(keycloak.middleware());

// --- 3. ALMACENAMIENTO TEMPORAL (REQ8) ---
let recipes = [
  { id: 1, title: "Pasta Carbonara", category: "Italiana", ingredients: ["Pasta", "Huevo", "Panceta"] }
];

// --- 4. RUTAS DEL MICROSERVICIO (REQ14) ---

// Healthcheck para Kubernetes (Añadido para consistencia con Grado 5)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    service: 'recipe-service', 
    timestamp: new Date() 
  });
});

// Obtener todas las recetas (Público)
app.get('/api/recipes', (req, res) => {
  res.json(recipes);
});

// Crear una receta (Protegido - Solo usuarios autenticados)
app.post('/api/recipes', keycloak.protect(), (req, res) => {
  const { title, category, ingredients } = req.body;
  
  if (!title || !ingredients) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const newRecipe = { id: recipes.length + 1, title, category, ingredients };
  recipes.push(newRecipe);
  
  res.status(201).json(newRecipe);
});

// --- 5. ARRANQUE DEL SERVIDOR ---
const PORT = process.env.PORT || 3002;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Recipe Service escuchando en el puerto ${PORT}`);
    console.log(`💓 Healthcheck disponible en /health`);
  });
}

module.exports = app;