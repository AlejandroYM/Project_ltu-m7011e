// ============================================================
//  ChefMatch — Load Test (REQ18, REQ19)
// ============================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';

// ── URLs ─────────────────────
const BASE_URL  = __ENV.BASE_URL  || 'https://ltu-m7011e-5.se';
const KC_URL    = __ENV.KC_URL    || 'https://keycloak.ltu-m7011e-5.se';
const KC_REALM  = __ENV.KC_REALM  || 'ChefMatchRealm';
const KC_CLIENT = __ENV.KC_CLIENT || 'frontend-client'; 
const KC_USER   = __ENV.KC_USER   || 'testuser';
const KC_PASS   = __ENV.KC_PASS   || 'Test1234';

// ── Metrics ──────────────────────────────────
const errorRate      = new Rate('errors');
const recipeDuration = new Trend('recipe_endpoint_duration');
const recDuration    = new Trend('recommendation_endpoint_duration');
const authErrors     = new Counter('auth_errors');

// ──  REQ18 + REQ19 ────────
export const options = {
  scenarios: {
    // REQ18 — 
    sustained_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 }, // ramp-up → 10 users
        { duration: '1m',  target: 10 }, 
      ],
      tags: { scenario: 'REQ18' }
    },
    // REQ19 
    peak_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 }, // ramp-up → 20 users
        { duration: '1m',  target: 20 }, 
        { duration: '30s', target: 0  }  // ramp-down
      ],
      startTime: '1m40s',
      tags: { scenario: 'REQ19' }
    }
  },

  thresholds: {
    http_req_duration:                    ['p(95)<2000'],
    http_req_failed:                      ['rate<0.1'],
    errors:                               ['rate<0.1'],
    recipe_endpoint_duration:             ['p(95)<1500'],
    recommendation_endpoint_duration:     ['p(95)<2000'],
    auth_errors:                          ['count<10']
  },

  insecureSkipTLSVerify: true 
};

// ── setup()
export function setup() {
  console.log('🔑 Getting token from Keycloak...');

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
    'Keycloak login (200)': (r) => r.status === 200,
    'Token got':  (r) => r.json('access_token') !== undefined
  });

  if (!ok) {
    console.error(`❌ Login failed — Status: ${res.status}`);
    console.error(`   Check KC_USER, KC_PASS y KC_CLIENT`);
    console.error(`   Body: ${res.body}`);
    return { token: null, userId: null };
  }

  const token  = res.json('access_token');
  const userId = JSON.parse(encoding.b64decode(token.split('.')[1], 'rawstd', 's')).sub;

  console.log(`✅ Token correct`);
  console.log(`   UserId: ${userId}`);
  return { token, userId };
}

export default function (data) {

  if (!data.token) {
    authErrors.add(1);
    sleep(1);
    return;
  }

  const authHeaders = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${data.token}`
  };

  group('GET /recipes', () => {
    const res = http.get(`${BASE_URL}/recipes`, {
      tags: { name: 'GET_recipes' }
    });

    const ok = check(res, {
      'GET /recipes → 200': (r) => r.status === 200,
      'Gives array':     (r) => { try { return Array.isArray(JSON.parse(r.body)); } catch(e) { return false; } },
      'At least 1 recipe':  (r) => { try { return JSON.parse(r.body).length > 0; }   catch(e) { return false; } }
    });

    recipeDuration.add(res.timings.duration);
    errorRate.add(!ok);
  });

  sleep(1);

  group('GET /recipes by rating', () => {
    const res = http.get(`${BASE_URL}/recipes?sort=rating_desc`, {
      tags: { name: 'GET_recipes_sorted' }
    });

    const ok = check(res, {
      'GET /recipes?sort=rating_desc → 200': (r) => r.status === 200,
      'Gives array':                      (r) => { try { return Array.isArray(JSON.parse(r.body)); } catch(e) { return false; } }
    });

    recipeDuration.add(res.timings.duration);
    errorRate.add(!ok);
  });

  sleep(1);

  group('GET /recommendations/:userId', () => {
    const res = http.get(
      `${BASE_URL}/recommendations/${data.userId}`,
      { headers: authHeaders, tags: { name: 'GET_recommendations' } }
    );

    const ok = check(res, {
      'GET /recommendations → 200':  (r) => r.status === 200,
      'Gives array':              (r) => { try { return Array.isArray(JSON.parse(r.body)); } catch(e) { return false; } },
      'No error from auth':           (r) => r.status !== 401 && r.status !== 403
    });

    recDuration.add(res.timings.duration);
    errorRate.add(!ok);
    if (res.status === 401 || res.status === 403) authErrors.add(1);
  });

  sleep(1);

  group('GET /recommendations?category', () => {
    const cats = ['Italian', 'Mexican', 'Vegan', 'Japanese', 'American', 'Desserts'];
    const cat  = cats[Math.floor(Math.random() * cats.length)];

    const res = http.get(
      `${BASE_URL}/recommendations/${data.userId}?category=${cat}`,
      { headers: authHeaders, tags: { name: 'GET_recommendations_category' } }
    );

    const ok = check(res, {
      'GET /recommendations?category → 200': (r) => r.status === 200,
      'Gives recomemendation':              (r) => { try { return JSON.parse(r.body).length > 0; } catch(e) { return false; } }
    });

    recDuration.add(res.timings.duration);
    errorRate.add(!ok);
  });

  sleep(1);

  group('GET /users/:userId', () => {
    const res = http.get(
      `${BASE_URL}/users/${data.userId}`,
      { headers: authHeaders, tags: { name: 'GET_user_profile' } }
    );

    const ok = check(res, {
      'GET /users → 200':              (r) => r.status === 200,
      'Got keycloakId': (r) => { try { return JSON.parse(r.body).keycloakId !== undefined; } catch(e) { return false; } },
      'No error from auth':             (r) => r.status !== 401 && r.status !== 403
    });

    errorRate.add(!ok);
    if (res.status === 401 || res.status === 403) authErrors.add(1);
  });

  sleep(1);

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
      'Recipe created with name': (r) => { try { return JSON.parse(r.body).name !== undefined; } catch(e) { return false; } }
    });

    errorRate.add(!ok);
  });

  sleep(Math.random() * 2 + 1);
}

// ── handleSummary()
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
  console.log('  SUMMARY OF LOAD TEST — CHEF MATCH (REQ18/REQ19)');
  console.log('════════════════════════════════════════════════════');
  console.log(`\n📊 GENERAL STATISTICS:`);
  console.log(`   Total requests:    ${totalReqs}`);
  console.log(`   Requests/seg:  ${rps.toFixed(2)}`);
  console.log(`   Correct:          ${((1 - failedRate) * 100).toFixed(2)}%`);
  console.log(`   Failed:          ${(failedRate * 100).toFixed(2)}%`);
  console.log(`\n⏱️  LATENCY:`);
  console.log(`   Average:          ${avgDur.toFixed(2)}ms`);
  console.log(`   P95:               ${p95Dur.toFixed(2)}ms`);
  console.log(`   P99:               ${p99Dur.toFixed(2)}ms`);
  console.log(`\n❌ ERRORS:`);
  console.log(`   Errors:   ${(errRate * 100).toFixed(2)}%`);

  const p95ok  = p95Dur    < 2000;
  const failok = failedRate < 0.1;
  const errok  = errRate    < 0.1;

  console.log(`\n🎯 THRESHOLDS (REQ18/REQ19):`);
  console.log(`   ${p95ok  ? '✅' : '❌'} P95 < 2000ms    → ${p95Dur.toFixed(2)}ms`);
  console.log(`   ${failok ? '✅' : '❌'} Failures < 10%  → ${(failedRate * 100).toFixed(2)}%`);
  console.log(`   ${errok  ? '✅' : '❌'} Errors < 10%    → ${(errRate * 100).toFixed(2)}%`);

  const allOk = p95ok && failok && errok;
  console.log(`\n${allOk ? '🎉 ALL THE THRESHOLDS PASSED' : '⚠️  SOME THRESHOLDS FAILED'}`);

  if (!allOk) {
    console.log(`\n🔧 RECOMMENDATIONS:`);
    if (!p95ok)  console.log(`   - Latency high (${p95Dur.toFixed(0)}ms). Check slow queries`);
    if (!failok) console.log(`   - Many failed requests. Check logs of the pods: kubectl logs -n chefmatch <pod>`);
    if (!errok)  console.log(`   - Many erros. Check the services are UP.`);
  }

  console.log('\n════════════════════════════════════════════════════\n');
  return { stdout: JSON.stringify(data, null, 2) };
}
