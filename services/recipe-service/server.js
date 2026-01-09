const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

const app = express();
app.use(express.json());

// --- 1. CONFIGURACIÓN DE SESIÓN (Requerido por Keycloak) ---
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
  resource: 'recipe-service', // Cambiado a recipe-service
  'ssl-required': 'external',
  'public-client': true
};

const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);
app.use(keycloak.middleware());

// --- 3. RUTAS DEL MICROSERVICIO ---

// Healthcheck para Kubernetes
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    service: 'recipe-service', 
    timestamp: new Date() 
  });
});

// Obtener todas las recetas (REQ1 - Catálogo de Recetas)
// IMPORTANTE: Escucha en /recipes para coincidir con el Ingress
app.get('/recipes', (req, res) => {
  const recipes = [
    { id: 1, name: 'Pasta Carbonara', category: 'Italiana', description: 'Deliciosa pasta con huevo y panceta.' },
    { id: 2, name: 'Tacos al Pastor', category: 'Mexicana', description: 'Tacos tradicionales con piña y cerdo.' },
    { id: 3, name: 'Ensalada Vegana', category: 'Vegana', description: 'Mix de verdes frescos y quinoa.' },
    { id: 4, name: 'Curry Picante', category: 'Picante', description: 'Curry rojo tailandés con mucho sabor.' }
  ];
  
  console.log('✅ Catálogo de recetas enviado');
  res.json(recipes);
});

// --- 4. MANEJO DE ERRORES ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno en Recipe Service' });
});

// --- 5. ARRANQUE DEL SERVIDOR ---
// Usamos el puerto 80 para coincidir con tu values.yaml y el Ingress
const PORT = process.env.PORT || 80; 

app.listen(PORT, () => {
  console.log(`🚀 Recipe Service escuchando en el puerto ${PORT}`);
  console.log(`💓 Healthcheck disponible en /health`);
  console.log(`📖 Catálogo disponible en /recipes`);
});

module.exports = app;