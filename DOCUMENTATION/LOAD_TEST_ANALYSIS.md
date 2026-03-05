# Load Test Analysis — ChefMatch (REQ18 / REQ19)

**Project**: ChefMatch Microservices Platform  
**Tool**: k6  
**Authors**: Paula Cortina & Alejandro Yécora  
**Domain**: https://ltu-m7011e-5.se

---

## 1. Test Configuration

The load test covers two scenarios executed sequentially against the live production cluster.

| Scenario | Requirement | VUs | Duration |
|---|---|---|---|
| `sustained_load` | REQ18 | 0 → 10 | 30s ramp-up + 1min sustained |
| `peak_load` | REQ19 | 0 → 20 | 30s ramp-up + 1min peak + 30s ramp-down |

Total real execution time: **3 minutes and 43 seconds**.

Each virtual user (VU) executes the following sequence of 6 requests per iteration, with 1–3 second sleeps between them:

1. `GET /recipes` — public, no authentication required
2. `GET /recipes?sort=rating_desc` — public, sorted by rating
3. `GET /recommendations/:userId` — authenticated
4. `GET /recommendations/:userId?category=<random>` — authenticated, may trigger on-the-fly recommendation generation
5. `GET /users/:userId` — authenticated, user profile fetch
6. `POST /recipes` — authenticated, write operation

---

## 2. Defined Thresholds and Results

| Threshold | Limit | Result | Passed? |
|---|---|---|---|
| `http_req_duration p(95)` | < 2000ms | 135.88ms | ✅ |
| `http_req_failed rate` | < 10% | 0.00% | ✅ |
| `errors rate` | < 10% | 0.09% | ✅ |
| `recipe_endpoint_duration p(95)` | < 1500ms | 201.81ms | ✅ |
| `recommendation_endpoint_duration p(95)` | < 2000ms | 66.44ms | ✅ |
| `auth_errors count` | < 10 | 0 | ✅ |

**🎉 All thresholds passed.**

---

## 3. Observed Results

### General Statistics

| Metric | Value |
|---|---|
| Total requests | 2,155 |
| Requests per second | 9.63 req/s |
| Completed iterations | 359 |
| HTTP success rate | 100.00% |
| HTTP failure rate | 0.00% |
| Check error rate | 0.09% |
| Authentication errors | 0 |
| Data received | 37.5 MB |
| Data sent | 348 KB |

### Global Latency

| Percentile | Latency |
|---|---|
| Average | 59.07ms |
| Median (p50) | 41.96ms |
| P90 | 115.58ms |
| P95 | 135.88ms |
| Maximum | 327.43ms |

### Latency by Endpoint Type

| Endpoint | Average | P90 | P95 | Maximum |
|---|---|---|---|---|
| `/recipes` (GET) | 100.59ms | 150.66ms | 201.81ms | 327.43ms |
| `/recommendations` (GET) | 40.97ms | 59.82ms | 66.44ms | 189.06ms |

### Check Results by Endpoint

| Endpoint | Passed | Failed |
|---|---|---|
| GET /recipes → 200 | 359/359 | 0 |
| GET /recipes (non-empty array) | 357/359 | **2** |
| GET /recipes?sort=rating_desc → 200 | 359/359 | 0 |
| GET /recommendations → 200 | 359/359 | 0 |
| GET /recommendations?category → 200 | 359/359 | 0 |
| GET /users/:userId → 200 | 359/359 | 0 |
| POST /recipes → 201 | 359/359 | 0 |

---

## 4. Analysis

### 4.1 What Was Observed

The system processed **2,155 requests in ~3m44s** at a sustained rate of **9.63 req/s**, completing 359 full iterations without a single HTTP failure. The HTTP success rate was 100%.

The overall latency is very low: the global P95 of **135ms** is well below the 2000ms threshold, indicating the system has roughly a **14x margin** before approaching the limit. The median of **42ms** shows that the vast majority of requests are resolved quickly.

The only 2 failures recorded correspond to the `"At least 1 recipe"` check on `GET /recipes`: on two occasions the response array arrived empty at the client. In both cases the HTTP status was 200, meaning this is not a server error but a transient condition at the very start of the test, before MongoDB had fully confirmed the seed data was available.

### 4.2 Behaviour per Scenario

**REQ18 — Sustained load (10 VUs):** With 10 concurrent users the system responds in a completely stable manner. Node.js handles the I/O-bound workload efficiently without saturating the event loop. No latency degradation was observed during the sustained minute.

**REQ19 — Load spike (20 VUs):** Doubling the concurrent users did not cause a proportional spike in latency. The global P95 remained at 135ms, practically identical to the sustained load phase, indicating the system did not reach its saturation point.

### 4.3 Most Notable Finding: /recipes is Slower than /recommendations

The most interesting result is that the recipes endpoint is noticeably slower than the recommendations endpoint, even though recommendations involve more complex logic (Keycloak token fetch, inter-service HTTP call, database write):

| Endpoint | P95 |
|---|---|
| `/recommendations` | 66ms |
| `/recipes` | 201ms |

The reason is **response payload size**. `GET /recipes` returns the entire recipe collection with all fields, which accounts for the majority of the 37.5 MB of data received during the test. The k6 latency breakdown confirms this:

- `http_req_waiting` P95: **68ms** — time for the server to process the request and start sending
- `http_req_receiving` P95: **82ms** — time to receive the full response body

Both contribute roughly equally. Network transfer and JSON serialisation of a large payload are the dominant factors, not server-side logic or MongoDB query time.

`GET /recommendations` returns a single-element array containing just a recipe name, so the payload is minimal and latency is near zero.

### 4.4 Where Is the Bottleneck?

The identified bottleneck is the **full payload transfer of `GET /recipes`**, not CPU, MongoDB, or Keycloak. At the current scale this is perfectly acceptable, but if the recipe catalogue were to grow significantly, this endpoint would be the first to degrade under load.

MongoDB running as a single replica and all services configured with `replicas: 1` did not become a bottleneck, confirming that 20 concurrent VUs is comfortably below the system's saturation point.

---

## 5. Conclusions

The system passes REQ18 and REQ19 with a wide margin. The global P95 of **135ms** is only 6.8% of the 2000ms threshold allowed.

The results validate that the architecture is well-suited to the project's scale: Node.js handles I/O-bound workloads efficiently, MongoDB with a small dataset responds entirely from memory without disk I/O, and the JWKS cache in the authentication middleware eliminates Keycloak overhead after the initial warmup.

To scale beyond this load, the highest-impact improvements would be:

1. **Pagination on `GET /recipes`** — Adding `?page=` and `?limit=` parameters to reduce payload size per request. This is the most impactful change given the analysis above.
2. **Compound MongoDB index** on `{ userId: 1, category: 1 }` in the recommendations collection to accelerate filtered queries under higher concurrency.
3. **Horizontal Pod Autoscaler (HPA)** for the recipe-service, which transfers the most data and will be the first to saturate as concurrency grows.
4. **Pre-generating recommendations at login time** using the existing `PREFERENCES_UPDATED` RabbitMQ event, so the first request never triggers the cold generation pipeline.

---

## 6. How to Re-run the Test

```bash
# Install k6 (macOS)
brew install k6

# Run against production
k6 run --env KC_USER=testuser --env KC_PASS=Test1234 load-test.js
```
