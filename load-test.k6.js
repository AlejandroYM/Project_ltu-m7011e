// load-test.k6.js
// Script de Load Testing con k6 para Chef Match
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Métricas personalizadas
const errorRate = new Rate('errors');

// Configuración del load test
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp-up: 0 -> 10 usuarios en 30s
    { duration: '1m', target: 10 },   // Mantener 10 usuarios por 1 minuto
    { duration: '30s', target: 20 },  // Ramp-up: 10 -> 20 usuarios en 30s
    { duration: '1m', target: 20 },   // Mantener 20 usuarios por 1 minuto
    { duration: '30s', target: 0 },   // Ramp-down: 20 -> 0 usuarios en 30s
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% de las requests deben completarse en menos de 500ms
    http_req_failed: ['rate<0.1'],    // Menos del 10% de requests deben fallar
    errors: ['rate<0.1'],             // Menos del 10% de errores
  },
};

// IMPORTANTE: Debes obtener un token válido antes de ejecutar el test
// Puedes obtenerlo desde Keycloak o desde tu aplicación

// Para obtener un token, ejecuta este curl:
// curl -X POST "https://sso.ltu-m7011e-5.se/realms/chefmatch/protocol/openid-connect/token" \
//   -H "Content-Type: application/x-www-form-urlencoded" \
//   -d "grant_type=password" \
//   -d "client_id=chefmatch-client" \
//   -d "username=TU_USUARIO" \
//   -d "password=TU_PASSWORD"

// REEMPLAZA ESTE TOKEN CON UNO VÁLIDO
const AUTH_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJwY2J...'; 

// URLs de los servicios
const BASE_URLS = {
  recipe: 'https://recipes.ltu-m7011e-5.se',
  user: 'https://users.ltu-m7011e-5.se',
  recommendation: 'https://recommendations.ltu-m7011e-5.se'
};

// Headers con autenticación
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

// Función principal del test
export default function() {
  // Test 1: GET /recipes (lectura sin autenticación)
  const recipesResponse = http.get(`${BASE_URLS.recipe}/recipes`);
  check(recipesResponse, {
    'GET /recipes status 200': (r) => r.status === 200,
    'GET /recipes tiene recetas': (r) => {
      const body = JSON.parse(r.body);
      return Array.isArray(body) && body.length >= 0;
    }
  }) || errorRate.add(1);

  sleep(1);

  // Test 2: GET /users/profile (requiere autenticación)
  const profileResponse = http.get(`${BASE_URLS.user}/users/profile`, { headers });
  check(profileResponse, {
    'GET /users/profile status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'GET /users/profile tiene respuesta válida': (r) => r.body.length > 0
  }) || errorRate.add(1);

  sleep(1);

  // Test 3: GET /recommendations (requiere autenticación)
  const recommendationsResponse = http.get(`${BASE_URLS.recommendation}/recommendations`, { headers });
  check(recommendationsResponse, {
    'GET /recommendations status 200': (r) => r.status === 200,
    'GET /recommendations tiene array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body);
      } catch (e) {
        return false;
      }
    }
  }) || errorRate.add(1);

  sleep(1);

  // Test 4: POST /recipes (requiere autenticación)
  const newRecipe = JSON.stringify({
    name: `Load Test Recipe ${__VU}-${__ITER}`,
    ingredients: ['ingredient1', 'ingredient2', 'ingredient3'],
    instructions: 'Mix everything and cook for 30 minutes',
    category: 'main-course',
    cookingTime: 30,
    servings: 4
  });

  const createRecipeResponse = http.post(
    `${BASE_URLS.recipe}/recipes`,
    newRecipe,
    { headers }
  );
  
  check(createRecipeResponse, {
    'POST /recipes status 201': (r) => r.status === 201,
    'POST /recipes devuelve receta': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.hasOwnProperty('name');
      } catch (e) {
        return false;
      }
    }
  }) || errorRate.add(1);

  sleep(2);
}

// Función que se ejecuta al final del test
export function handleSummary(data) {
  console.log('\n=== RESUMEN DEL LOAD TEST ===\n');
  console.log(`Total de requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`Requests fallidas: ${data.metrics.http_req_failed.values.rate * 100}%`);
  console.log(`Duración promedio: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`P95 latencia: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`Requests por segundo: ${data.metrics.http_reqs.values.rate.toFixed(2)}`);
  
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    'stdout': JSON.stringify(data, null, 2)
  };
}

/*
INSTRUCCIONES DE USO:

1. Instalar k6:
   Mac: brew install k6
   Linux: sudo apt-get install k6
   
2. Obtener un token de Keycloak:
   curl -X POST "https://sso.ltu-m7011e-5.se/realms/chefmatch/protocol/openid-connect/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=password" \
     -d "client_id=chefmatch-client" \
     -d "username=TU_USUARIO" \
     -d "password=TU_PASSWORD"
   
3. Copiar el access_token del resultado y pegarlo en la variable AUTH_TOKEN arriba

4. Ejecutar el test:
   k6 run load-test.k6.js
   
5. Ver resultados:
   - En la terminal verás el progreso en tiempo real
   - Al final verás un resumen completo
   - Se generará un archivo load-test-results.json con los resultados detallados

MÉTRICAS A REVISAR:
- http_req_duration: Latencia de las requests (objetivo: p95 < 500ms)
- http_req_failed: Tasa de fallos (objetivo: < 10%)
- http_reqs: Requests por segundo (throughput)
- errors: Tasa de errores personalizados

ESCENARIOS DE CARGA:
- 0-30s: Ramp-up a 10 usuarios
- 30s-1m30s: Mantener 10 usuarios
- 1m30s-2m: Ramp-up a 20 usuarios
- 2m-3m: Mantener 20 usuarios
- 3m-3m30s: Ramp-down a 0 usuarios

Total: ~3.5 minutos de prueba
*/
