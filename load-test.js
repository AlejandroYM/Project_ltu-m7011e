// ============================================================
//  ChefMatch — Load Test (REQ18, REQ19)
//  Herramienta: k6  (https://k6.io)
//
//  Ejecución:
//    k6 run load-test.js
//
//  Con variables de entorno personalizadas:
//    k6 run \
//      -e KC_USER=testuser \
//      -e KC_PASS=Test1234 \
//      load-test.js
//
//  ✅ El token se obtiene automáticamente — no hay que copiarlo a mano
// ============================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';

// ── Configuración de URLs y credenciales ─────────────────────
const BASE_URL  = __ENV.BASE_URL  || 'https://ltu-m7011e-5.se';
const KC_URL    = __ENV.KC_URL    || 'https://keycloak.ltu-m7011e-5.se';
const KC_REALM  = __ENV.KC_REALM  || 'ChefMatchRealm';
const KC_CLIENT = __ENV.KC_CLIENT || 'frontend-client'; // ← cliente correcto del realm
const KC_USER   = __ENV.KC_USER   || 'testuser';
const KC_PASS   = __ENV.KC_PASS   || 'Test1234';

// ── Métricas personalizadas ──────────────────────────────────
const errorRate      = new Rate('errors');
const recipeDuration = new Trend('recipe_endpoint_duration');
const recDuration    = new Trend('recommendation_endpoint_duration');
const authErrors     = new Counter('auth_errors');

// ── Escenarios REQ18 (carga sostenida) + REQ19 (pico) ────────
export const options = {
  scenarios: {
    // REQ18 — Carga sostenida progresiva
    carga_sostenida: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 }, // ramp-up → 10 usuarios
        { duration: '1m',  target: 10 }, // mantener 10 usuarios
      ],
      tags: { scenario: 'REQ18_carga_sostenida' }
    },
    // REQ19 — Pico de carga (arranca cuando termina REQ18)
    pico_de_carga: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 }, // ramp-up → 20 usuarios
        { duration: '1m',  target: 20 }, // mantener 20 usuarios
        { duration: '30s', target: 0  }  // ramp-down
      ],
      startTime: '1m40s',
      tags: { scenario: 'REQ19_pico_carga' }
    }
  },

  // ── Umbrales de aceptación ───────────────────────────────
  thresholds: {
    http_req_duration:                    ['p(95)<2000'],
    http_req_failed:                      ['rate<0.1'],
    errors:                               ['rate<0.1'],
    recipe_endpoint_duration:             ['p(95)<1500'],
    recommendation_endpoint_duration:     ['p(95)<2000'],
    auth_errors:                          ['count<10']
  },

  insecureSkipTLSVerify: true // certificados self-signed en el cluster
};

// ── setup(): obtiene el JWT UNA vez y lo comparte con todos los VUs ──
// Así el token nunca expira durante el test ni hay que copiarlo a mano
export function setup() {
  console.log('🔑 Obteniendo token de Keycloak...');

  const res = http.post(
    `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`,
    {
      grant_type: 'password',
      client_id:  KC_CLIENT,
      username:   KC_USER,
      password:   KC_PASS
    },
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      tags:    { name: 'keycloak_login' }
    }
  );

  const ok = check(res, {
    'Keycloak login exitoso (200)': (r) => r.status === 200,
    'Token recibido en respuesta':  (r) => r.json('access_token') !== undefined
  });

  if (!ok) {
    console.error(`❌ Login fallido — Status: ${res.status}`);
    console.error(`   Comprueba KC_USER, KC_PASS y KC_CLIENT`);
    console.error(`   Body: ${res.body}`);
    return { token: null, userId: null };
  }

  const token  = res.json('access_token');
  // Extraer userId (sub) del payload del JWT sin librería externa
  const userId = JSON.parse(encoding.b64decode(token.split('.')[1], 'rawstd', 's')).sub;

  console.log(`✅ Token obtenido correctamente`);
  console.log(`   UserId: ${userId}`);
  return { token, userId };
}

// ── default(): ejecutado por cada VU en cada iteración ───────
export default function (data) {

  // Sin token no tiene sentido ejecutar — registrar y salir
  if (!data.token) {
    authErrors.add(1);
    sleep(1);
    return;
  }

  const authHeaders = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${data.token}`
  };

  // ── 1. GET /recipes (sin auth — endpoint público) ──────────
  group('GET /recipes', () => {
    const res = http.get(`${BASE_URL}/recipes`, {
      tags: { name: 'GET_recipes' }
    });

    const ok = check(res, {
      'GET /recipes → 200': (r) => r.status === 200,
      'Devuelve array':     (r) => { try { return Array.isArray(JSON.parse(r.body)); } catch(e) { return false; } },
      'Al menos 1 receta':  (r) => { try { return JSON.parse(r.body).length > 0; }   catch(e) { return false; } }
    });

    recipeDuration.add(res.timings.duration);
    errorRate.add(!ok);
  });

  sleep(1);

  // ── 2. GET /recipes?sort=rating_desc ───────────────────────
  group('GET /recipes ordenado por rating', () => {
    const res = http.get(`${BASE_URL}/recipes?sort=rating_desc`, {
      tags: { name: 'GET_recipes_sorted' }
    });

    const ok = check(res, {
      'GET /recipes?sort=rating_desc → 200': (r) => r.status === 200,
      'Devuelve array':                      (r) => { try { return Array.isArray(JSON.parse(r.body)); } catch(e) { return false; } }
    });

    recipeDuration.add(res.timings.duration);
    errorRate.add(!ok);
  });

  sleep(1);

  // ── 3. GET /recommendations/:userId ────────────────────────
  group('GET /recommendations/:userId', () => {
    const res = http.get(
      `${BASE_URL}/recommendations/${data.userId}`,
      { headers: authHeaders, tags: { name: 'GET_recommendations' } }
    );

    const ok = check(res, {
      'GET /recommendations → 200':  (r) => r.status === 200,
      'Devuelve array':              (r) => { try { return Array.isArray(JSON.parse(r.body)); } catch(e) { return false; } },
      'Sin error de auth':           (r) => r.status !== 401 && r.status !== 403
    });

    recDuration.add(res.timings.duration);
    errorRate.add(!ok);
    if (res.status === 401 || res.status === 403) authErrors.add(1);
  });

  sleep(1);

  // ── 4. GET /recommendations con categoría aleatoria ────────
  group('GET /recommendations?category', () => {
    const cats = ['Italian', 'Mexican', 'Vegan', 'Japanese', 'American', 'Desserts'];
    const cat  = cats[Math.floor(Math.random() * cats.length)];

    const res = http.get(
      `${BASE_URL}/recommendations/${data.userId}?category=${cat}`,
      { headers: authHeaders, tags: { name: 'GET_recommendations_category' } }
    );

    const ok = check(res, {
      'GET /recommendations?category → 200': (r) => r.status === 200,
      'Devuelve recomendación':              (r) => { try { return JSON.parse(r.body).length > 0; } catch(e) { return false; } }
    });

    recDuration.add(res.timings.duration);
    errorRate.add(!ok);
  });

  sleep(1);

  // ── 5. GET /users/:userId ───────────────────────────────────
  group('GET /users/:userId', () => {
    const res = http.get(
      `${BASE_URL}/users/${data.userId}`,
      { headers: authHeaders, tags: { name: 'GET_user_profile' } }
    );

    const ok = check(res, {
      'GET /users → 200':              (r) => r.status === 200,
      'Tiene keycloakId en respuesta': (r) => { try { return JSON.parse(r.body).keycloakId !== undefined; } catch(e) { return false; } },
      'Sin error de auth':             (r) => r.status !== 401 && r.status !== 403
    });

    errorRate.add(!ok);
    if (res.status === 401 || res.status === 403) authErrors.add(1);
  });

  sleep(1);

  // ── 6. POST /recipes (escritura con auth) ──────────────────
  group('POST /recipes', () => {
    const body = JSON.stringify({
      name:         `LoadTest-VU${__VU}-IT${__ITER}`,
      category:     'Italian',
      ingredients:  ['pasta', 'eggs', 'cheese'],
      instructions: 'Mix and cook 20 minutes',
      cookingTime:  20,
      servings:     4
    });

    const res = http.post(
      `${BASE_URL}/recipes`,
      body,
      { headers: authHeaders, tags: { name: 'POST_recipe' } }
    );

    const ok = check(res, {
      'POST /recipes → 201':      (r) => r.status === 201,
      'Receta creada con nombre': (r) => { try { return JSON.parse(r.body).name !== undefined; } catch(e) { return false; } }
    });

    errorRate.add(!ok);
  });

  // Pausa aleatoria entre iteraciones (simula usuario real navegando)
  sleep(Math.random() * 2 + 1);
}

// ── handleSummary(): resumen detallado al final del test ──────
export function handleSummary(data) {
  const get = (metric, field, def = 0) => {
    try { return data.metrics[metric]?.values?.[field] ?? def; }
    catch (e) { return def; }
  };

  const totalReqs  = get('http_reqs', 'count');
  const failedRate = get('http_req_failed', 'rate');
  const avgDur     = get('http_req_duration', 'avg');
  const p95Dur     = get('http_req_duration', 'p(95)');
  const p99Dur     = get('http_req_duration', 'p(99)');
  const rps        = get('http_reqs', 'rate');
  const errRate    = get('errors', 'rate');

  console.log('\n════════════════════════════════════════════════════');
  console.log('  RESUMEN DEL LOAD TEST — CHEF MATCH (REQ18/REQ19)');
  console.log('════════════════════════════════════════════════════');
  console.log(`\n📊 ESTADÍSTICAS GENERALES:`);
  console.log(`   Total requests:    ${totalReqs}`);
  console.log(`   Requests/segundo:  ${rps.toFixed(2)}`);
  console.log(`   Exitosas:          ${((1 - failedRate) * 100).toFixed(2)}%`);
  console.log(`   Fallidas:          ${(failedRate * 100).toFixed(2)}%`);
  console.log(`\n⏱️  LATENCIA:`);
  console.log(`   Promedio:          ${avgDur.toFixed(2)}ms`);
  console.log(`   P95:               ${p95Dur.toFixed(2)}ms`);
  console.log(`   P99:               ${p99Dur.toFixed(2)}ms`);
  console.log(`\n❌ ERRORES:`);
  console.log(`   Tasa de errores:   ${(errRate * 100).toFixed(2)}%`);

  const p95ok  = p95Dur    < 2000;
  const failok = failedRate < 0.1;
  const errok  = errRate    < 0.1;

  console.log(`\n🎯 THRESHOLDS (REQ18/REQ19):`);
  console.log(`   ${p95ok  ? '✅' : '❌'} P95 < 2000ms    → ${p95Dur.toFixed(2)}ms`);
  console.log(`   ${failok ? '✅' : '❌'} Failures < 10%  → ${(failedRate * 100).toFixed(2)}%`);
  console.log(`   ${errok  ? '✅' : '❌'} Errors < 10%    → ${(errRate * 100).toFixed(2)}%`);

  const allOk = p95ok && failok && errok;
  console.log(`\n${allOk ? '🎉 TODOS LOS THRESHOLDS PASARON' : '⚠️  ALGUNOS THRESHOLDS FALLARON'}`);

  if (!allOk) {
    console.log(`\n🔧 RECOMENDACIONES:`);
    if (!p95ok)  console.log(`   - Latencia alta (${p95Dur.toFixed(0)}ms). Revisa queries lentas o añade índices en MongoDB.`);
    if (!failok) console.log(`   - Muchas requests fallidas. Comprueba los logs de los pods con: kubectl logs -n chefmatch <pod>`);
    if (!errok)  console.log(`   - Alto porcentaje de errores. Verifica que todos los servicios estén UP.`);
  }

  console.log('\n════════════════════════════════════════════════════\n');
  return { stdout: JSON.stringify(data, null, 2) };
}
