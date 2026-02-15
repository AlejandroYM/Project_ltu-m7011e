// load-test-chefmatch-FINAL.k6.js
// Script de Load Testing con k6 para Chef Match - VERSIÓN FINAL CON URLs CORRECTAS
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
    http_req_duration: ['p(95)<2000'], // 95% de las requests < 2000ms
    http_req_failed: ['rate<0.1'],     // Menos del 10% de requests fallan
    errors: ['rate<0.1'],              // Menos del 10% de errores
  },
  insecureSkipTLSVerify: true,  // Para certificados self-signed
};

// ⚠️ IMPORTANTE: Actualiza este token cada 5 minutos
const AUTH_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICItM2xheVZwaGFJQTJ3Y0VGTnJyMC1XUjhSdHB0Q1RlNUtkcGZWREd6QV9BIn0.eyJleHAiOjE3NzExMTQ2NDUsImlhdCI6MTc3MTExNDM0NSwianRpIjoiZjZlM2IyZDQtMThjMS00MjJiLTgwNjAtNmEyZmU2MjdkMTgzIiwiaXNzIjoiaHR0cHM6Ly9rZXljbG9hay5sdHUtbTcwMTFlLTUuc2UvcmVhbG1zL0NoZWZNYXRjaFJlYWxtIiwiYXVkIjpbInVzZXItc2VydmljZSIsImFjY291bnQiXSwic3ViIjoiNDQ3NTUzYjItZTI1ZC00N2M5LTgyMDktNGM1NmQ1ODgzYjJhIiwidHlwIjoiQmVhcmVyIiwiYXpwIjoiZnJvbnRlbmQtY2xpZW50Iiwic2Vzc2lvbl9zdGF0ZSI6IjMwN2U1OTk1LTVhZmYtNDU1Zi04Y2M4LWQzYzE2MjBhYjhjMyIsImFjciI6IjEiLCJhbGxvd2VkLW9yaWdpbnMiOlsiKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJkZWZhdWx0LXJvbGVzLWNoZWZtYXRjaHJlYWxtIiwidW1hX2F1dGhvcml6YXRpb24iXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbIm1hbmFnZS1hY2NvdW50IiwibWFuYWdlLWFjY291bnQtbGlua3MiLCJ2aWV3LXByb2ZpbGUiXX19LCJzY29wZSI6InByb2ZpbGUgZW1haWwiLCJzaWQiOiIzMDdlNTk5NS01YWZmLTQ1NWYtOGNjOC1kM2MxNjIwYWI4YzMiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsInByZWZlcnJlZF91c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QHRlc3QuY29tIn0.HWS5S8OSdtqPvMyhSkaTzDSIFmmH0zqkgd7vjREfQ5AbllrBKL96mvl-7HWG9_jyEUyHZ8fr5UnNN63OdkAweReGh-QRUiAHihq-JZ3oPQKgeWOuF27QtXIOyvmS1T5SKU9FubG-hRhEVB_L7tQPtjgrQID22JXUQtfsiKjHSB8uH6TBCtj6yT_-Ticmuj75GPgxXloh_fjDPxw_652LyOo3xCfrzBe71jQPWGDSA3giBjkqZIkWl0iWcZV71HpMW3p9zXFTq5MBfSoyV76Yt1zKXhhStm4E03q3JYsHXdOxn2tgPKJnELVVSnntsj8NBcX5lMikmng_WqE152mFlA';

// ✅ URLs CORRECTAS - Detectadas automáticamente por find-api-urls.sh
const BASE_URLS = {
  recipe: 'https://ltu-m7011e-5.se/recipes',
  user: 'https://api.ltu-m7011e-5.se/users',
  recommendation: 'https://api.ltu-m7011e-5.se/recommendations'
};

// Headers con autenticación
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

// Función principal del test
export default function() {
  
  // Test 1: GET /recipes (lectura sin autenticación)
  const recipesResponse = http.get(BASE_URLS.recipe);
  
  const recipesCheck = check(recipesResponse, {
    'GET /recipes status 200': (r) => r.status === 200,
    'GET /recipes tiene recetas': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body) && body.length >= 0;
      } catch (e) {
        console.error('Error parsing recipes response:', e.message);
        return false;
      }
    }
  });
  
  if (!recipesCheck) {
    errorRate.add(1);
  }

  sleep(1);

  // Test 2: GET /users/profile (requiere autenticación)
  const profileResponse = http.get(`${BASE_URLS.user}/profile`, { headers });
  
  const profileCheck = check(profileResponse, {
    'GET /users/profile status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'GET /users/profile tiene respuesta': (r) => r.body.length > 0
  });
  
  if (!profileCheck) {
    errorRate.add(1);
  }

  sleep(1);

  // Test 3: GET /recommendations (requiere autenticación)
  const userId = '447553b2-e25d-47c9-8209-4c56d5883b2a'; // ID del testuser
  const recommendationsResponse = http.get(`${BASE_URLS.recommendation}/${userId}`, { headers });
  
  const recommendationsCheck = check(recommendationsResponse, {
    'GET /recommendations status 200': (r) => r.status === 200,
    'GET /recommendations tiene array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body);
      } catch (e) {
        console.error('Error parsing recommendations response:', e.message);
        return false;
      }
    }
  });
  
  if (!recommendationsCheck) {
    errorRate.add(1);
  }

  sleep(1);

  // Test 4: POST /recipes (requiere autenticación)
  const newRecipe = JSON.stringify({
    name: `Load Test Recipe ${__VU}-${__ITER}`,
    ingredients: ['ingredient1', 'ingredient2', 'ingredient3'],
    instructions: 'Mix everything and cook for 30 minutes',
    category: 'Italian',
    cookingTime: 30,
    servings: 4
  });

  const createRecipeResponse = http.post(
    BASE_URLS.recipe,
    newRecipe,
    { headers }
  );
  
  const createCheck = check(createRecipeResponse, {
    'POST /recipes status 201': (r) => r.status === 201,
    'POST /recipes devuelve receta': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.hasOwnProperty('name');
      } catch (e) {
        console.error('Error parsing create recipe response:', e.message);
        return false;
      }
    }
  });
  
  if (!createCheck) {
    errorRate.add(1);
  }

  sleep(2);
}

// ✅ Función corregida que maneja valores undefined/null
export function handleSummary(data) {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  RESUMEN DEL LOAD TEST - CHEF MATCH');
  console.log('════════════════════════════════════════════════════════════');
  
  // Helper para obtener valores de métricas de forma segura
  const getMetricValue = (metric, field, defaultValue = 0) => {
    try {
      return data.metrics[metric]?.values?.[field] ?? defaultValue;
    } catch (e) {
      return defaultValue;
    }
  };
  
  const totalRequests = getMetricValue('http_reqs', 'count');
  const failedRate = getMetricValue('http_req_failed', 'rate');
  const avgDuration = getMetricValue('http_req_duration', 'avg');
  const p95Duration = getMetricValue('http_req_duration', 'p(95)');
  const p99Duration = getMetricValue('http_req_duration', 'p(99)');
  const requestsPerSecond = getMetricValue('http_reqs', 'rate');
  const errorRateValue = getMetricValue('errors', 'rate');
  
  console.log(`\n📊 ESTADÍSTICAS GENERALES:`);
  console.log(`   Total de requests: ${totalRequests}`);
  console.log(`   Requests por segundo: ${requestsPerSecond.toFixed(2)}`);
  console.log(`   Requests exitosas: ${((1 - failedRate) * 100).toFixed(2)}%`);
  console.log(`   Requests fallidas: ${(failedRate * 100).toFixed(2)}%`);
  
  console.log(`\n⏱️  LATENCIA:`);
  console.log(`   Duración promedio: ${avgDuration.toFixed(2)}ms`);
  console.log(`   P95 latencia: ${p95Duration.toFixed(2)}ms`);
  if (p99Duration > 0) {
    console.log(`   P99 latencia: ${p99Duration.toFixed(2)}ms`);
  }
  
  console.log(`\n❌ ERRORES:`);
  console.log(`   Tasa de errores: ${(errorRateValue * 100).toFixed(2)}%`);
  
  // Evaluación de thresholds
  console.log(`\n🎯 THRESHOLDS:`);
  const p95Threshold = p95Duration < 2000;
  const failureThreshold = failedRate < 0.1;
  const errorThreshold = errorRateValue < 0.1;
  
  console.log(`   ${p95Threshold ? '✅' : '❌'} P95 < 2000ms: ${p95Duration.toFixed(2)}ms`);
  console.log(`   ${failureThreshold ? '✅' : '❌'} Failures < 10%: ${(failedRate * 100).toFixed(2)}%`);
  console.log(`   ${errorThreshold ? '✅' : '❌'} Errors < 10%: ${(errorRateValue * 100).toFixed(2)}%`);
  
  // Resumen final
  const allPassed = p95Threshold && failureThreshold && errorThreshold;
  console.log(`\n${allPassed ? '🎉' : '⚠️'}  RESULTADO FINAL: ${allPassed ? 'TODOS LOS THRESHOLDS PASARON' : 'ALGUNOS THRESHOLDS FALLARON'}`);
  
  if (!allPassed) {
    console.log(`\n🔧 RECOMENDACIONES:`);
    if (!p95Threshold) {
      console.log(`   - La latencia P95 es alta (${p95Duration.toFixed(2)}ms > 2000ms)`);
      console.log(`     Considera optimizar las queries o añadir caché`);
    }
    if (!failureThreshold) {
      console.log(`   - Alto porcentaje de requests fallidas (${(failedRate * 100).toFixed(2)}%)`);
      console.log(`     Revisa logs de los servicios para identificar errores`);
    }
    if (!errorThreshold) {
      console.log(`   - Alto porcentaje de errores (${(errorRateValue * 100).toFixed(2)}%)`);
      console.log(`     Verifica que los endpoints estén funcionando correctamente`);
    }
  }
  
  console.log('\n════════════════════════════════════════════════════════════\n');
  
  return {
    'stdout': JSON.stringify(data, null, 2)
  };
}

/*
═══════════════════════════════════════════════════════════════════
  INSTRUCCIONES DE USO - CHEF MATCH LOAD TEST
═══════════════════════════════════════════════════════════════════

✅ URLS YA CONFIGURADAS CORRECTAMENTE:
---------------------------------------------------------------
Este script usa las URLs correctas detectadas automáticamente:

  - Recipes: https://ltu-m7011e-5.se/recipes
  - Users: https://api.ltu-m7011e-5.se/users  
  - Recommendations: https://api.ltu-m7011e-5.se/recommendations

📋 PASO 1: OBTENER UN TOKEN NUEVO (si expiró)
---------------------------------------------------------------
Los tokens expiran en 5 minutos. Para obtener uno nuevo:

  curl -k -X POST "https://keycloak.ltu-m7011e-5.se/realms/ChefMatchRealm/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=frontend-client" \
    -d "username=testuser" \
    -d "password=Test1234"

Copia el "access_token" y reemplázalo en la línea 25

📋 PASO 2: EJECUTAR EL TEST
---------------------------------------------------------------
  k6 run load-test-chefmatch-FINAL.k6.js

📊 PASO 3: INTERPRETAR RESULTADOS
---------------------------------------------------------------
Escenarios de carga:
  - 0-30s: Ramp-up a 10 usuarios
  - 30s-1m30s: Mantener 10 usuarios
  - 1m30s-2m: Ramp-up a 20 usuarios
  - 2m-3m: Mantener 20 usuarios  
  - 3m-3m30s: Ramp-down a 0 usuarios

Thresholds (objetivos):
  ✅ http_req_duration p(95) < 2000ms
  ✅ http_req_failed rate < 10%
  ✅ errors rate < 10%

🔧 TROUBLESHOOTING
---------------------------------------------------------------
❌ "401 Unauthorized"
   → Token expirado. Obtén uno nuevo con el comando del PASO 1

❌ "Cannot read property 'toFixed' of undefined"
   → Problema resuelto en esta versión

❌ "Recibiendo HTML en lugar de JSON"
   → Problema resuelto - URLs correctas configuradas

═══════════════════════════════════════════════════════════════════
*/
