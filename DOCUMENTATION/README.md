# 👨‍🍳 ChefMatch — Microservices Recipe Platform

**Group 5** | Paula Cortina & Alejandro Yécora  
**Course**: LTU M7011E | **Domain**: `https://ltu-m7011e-5.se`

ChefMatch is a cloud-native platform for recipe management and personalized meal planning, built on a secure, scalable microservices architecture deployed on Kubernetes.

---

## 🏗️ System Architecture (REQ11)

The system is composed of four independent services that communicate both synchronously via REST and asynchronously via events, all secured through Keycloak JWT authentication.

```
User Browser
     │  HTTPS
     ▼
Nginx Ingress (Traefik)  ──────────────────────────────────────────────
     │                  │                   │                  │
     ▼                  ▼                   ▼                  ▼
Frontend           User Service        Recipe Service    Recommendation
(React/Vite)       (Node.js :8000)    (Node.js :8000)    Service
(Nginx :80)              │                  │            (Node.js :8000)
                         │   PREFERENCES_   │                  │
                         │   UPDATED event  │                  │
                         └──► RabbitMQ ─────────────────────►  │
                                            │                   │
                              MongoDB ◄─────┴───────────────────┘
                         Keycloak ◄── JWT verification (all services)
                         Prometheus + Grafana ◄── /metrics (recipe-service)
```

### Services

| Service | Port | Responsibility |
|---|---|---|
| **User Service** | 8000 | User profiles, preferences, publishes events to RabbitMQ |
| **Recipe Service** | 8000 | Recipe CRUD, ratings, image upload, meal plans, exposes `/metrics` |
| **Recommendation Service** | 8000 | Generates top-5 recommendations, consumes RabbitMQ events |
| **Frontend** | 80 | React SPA served by Nginx, communicates with all services |

### Infrastructure

| Component | Purpose |
|---|---|
| **Keycloak** | Identity Provider — issues and signs JWT tokens (RS256) |
| **RabbitMQ** | Async message broker — decouples User Service from Recommendation Service |
| **MongoDB** | NoSQL database for recipes and recommendations |
| **Prometheus + Grafana** | Observability — Four Golden Signals dashboard |
| **Cert-Manager** | Auto-provisions Let's Encrypt TLS certificates |
| **ArgoCD** | GitOps — auto-deploys on push to `main` |

---

## 🔒 Authentication & Authorization Flow

ChefMatch uses **Keycloak with OAuth2 Authorization Code Flow + PKCE**. No secrets are hardcoded in any service.

### How a user gets their token

```
1. keycloak-js detects no valid session in browser cookies/memory
2. Redirects user to Keycloak login page
3. User logs in → Keycloak issues a short-lived authorization code
4. keycloak-js POSTs the code + PKCE code_verifier to Keycloak's token endpoint
5. Keycloak returns:  access_token (JWT, 5min) + refresh_token (hours/days)
6. keycloak-js stores tokens in memory; auto-renews before expiry
```

### How microservices verify the token

Every protected route runs `authenticateJWT` middleware:

```
Request arrives with:  Authorization: Bearer eyJhbGci...

1. Service fetches Keycloak's public keys from JWKS endpoint
   → https://keycloak.ltu-m7011e-5.se/realms/ChefMatchRealm/.../certs
   → Public keys are cached for 10 minutes
2. Verifies JWT signature using RS256 (asymmetric crypto)
   → Only Keycloak has the private key — no shared secret needed
3. Checks exp (not expired) and iss (correct realm)
4. Decodes payload → places in req.user
5. requireRole() checks req.user.realm_access.roles → 403 if insufficient
```

### Roles

| Role | Permissions |
|---|---|
| Any authenticated user | Browse recipes, create recipes, rate recipes, view recommendations,update own profile |
| Recipe owner | Delete own recipes, manage own meal plans |
| Account owner | View and delete own profile and account |

Roles travel **inside the JWT** — no database query needed for authorization.

---

## 📡 Asynchronous Communication (REQ15)

When a user updates their culinary preferences:

```
User Service  ──publishes──►  RabbitMQ queue: user_updates
                                      │
                                      └──► Recommendation Service
                                                    │
                                          regenerates top-5 recommendations
                                                    │
                                               MongoDB updated
```

User Service responds immediately without waiting. Services are fully decoupled — the Recommendation Service has no knowledge of the User Service.

---

## 📅 Monthly Meal Planner

Each user has a personal calendar where they can plan lunch and dinner for every day of the month. Recipes are assigned via **native HTML5 drag & drop** or through the Quick Add panel. Data is stored per user per month in MongoDB via the Recipe Service (`/meal-plans` routes).

---

## ✅ Requirements Fulfillment

### Development & Quality

- **REQ2 Dynamic Behavior**: Recommendations regenerate in real-time via RabbitMQ when preferences change.
- **REQ3 Frontend**: React 19 + Vite SPA with Keycloak integration, Unsplash image search, drag & drop meal planner.
- **REQ6 CI/CD**: GitHub Actions runs tests in parallel (matrix strategy) for all services; on success, builds and pushes Docker images. ArgoCD deploys automatically.

### Containerization & Cloud 

- **REQ10 Docker**: Each service has its own optimized Dockerfile. The frontend uses a **multi-stage build** — Node.js compiles the app, Nginx serves the static output (~25MB final image).
- **REQ12 Kubernetes & Helm**: All resources defined as Helm Charts with a single `values.yaml`. ArgoCD syncs the cluster from the `/k8s` folder on every push.

### Communication & API 

- **REQ14 REST API**: Services expose standard RESTful endpoints consumed by the frontend via Axios.
- **REQ15 Async Messaging**: RabbitMQ queue `user_updates` decouples preference changes from recommendation generation.

### Security 

- **REQ20 Authentication**: Keycloak with Authorization Code Flow + PKCE. RS256 JWT verification using public keys — no shared secrets in code.
- **REQ23/24 HTTPS + Certificates**: Traefik Ingress + Cert-Manager auto-provisions and renews Let's Encrypt certificates for `ltu-m7011e-5.se` and `keycloak.ltu-m7011e-5.se`.

### Load Testing 

- **REQ18 Sustained load**: k6 ramps 0→10 virtual users over 30s, maintains for 1 minute.
- **REQ19 Load spike**: k6 ramps 0→20 virtual users. Thresholds: P95 < 2000ms, error rate < 10%, auth errors < 10.

---

## 🚀 Deployment

### Local (Docker Compose)

```bash
# Copy and fill in secrets
cp .env.example .env

# Start all services
docker-compose up -d
```

| Service | URL |
|---|---|
| Keycloak Admin | https://keycloak.ltu-m7011e-5.se/admin |
| RabbitMQ Management | http://localhost:15672 |

### Cloud (Kubernetes + ArgoCD)

Deployment is fully automated on every push to `main`:

```
git push origin main
       │
       ▼
GitHub Actions
  ├── npm test --coverage  (user, recipe, recommendation — parallel)
  └── docker build + push  (4 images → Docker Hub)
                │
                ▼
          ArgoCD detects changes in /k8s
                │
                ▼
          kubectl apply (Helm) → chefmatch namespace
```

Live at: **https://ltu-m7011e-5.se**  
Grafana: **https://ltu-m7011e-5.se/grafana** 

---

## 🧪 Running Tests

```bash
cd services/<user-service|recipe-service|recommendation-service>
npm install
npm test -- --coverage
```

---

## 📊 Observability

Grafana dashboards implement the **Four Golden Signals** (SRE standard):

| Signal | Metric |
|---|---|
| **Latency** | HTTP response time P50 / P95 / P99 |
| **Traffic** | Requests per second per route |
| **Errors** | 4xx and 5xx error rate (%) |
| **Saturation** | CPU usage, Node.js heap memory, event loop lag |

Prometheus scrapes `/metrics` every 15 seconds. All three services report health via `/health` endpoints used by Kubernetes liveness and readiness probes.

---

## 🗂️ Project Structure

```
.
├── .github/workflows/ci.yml       # GitHub Actions pipeline (test + build + push)
├── docker-compose.yml             # Local development environment
├── load-test.js                   # k6 load test (REQ18/REQ19)
├── mongodb-kubernetes-manifests.yaml
├── role-based-auth.md             # RBAC documentation
│
├── DOCUMENTATION/
│   ├── ARCHITECTURE.md
│   ├── CERTIFICATE_MANAGEMENT.md
│   ├── ETHICAL_ANALYSIS.md
│   ├── GDPR_PRIVACY_DOC.md
│   ├── SecurityDocumentation.md
│   └── SystemArchitecture.md
│
├── services/
│   ├── user-service/
│   │   ├── Dockerfile
│   │   ├── server.js              # Express app — profiles, preferences, event producer
│   │   ├── middleware/auth.js     # authenticateJWT + requireRole
│   │   ├── models/User.js
│   │   ├── swagger.json           # API documentation
│   │   └── tests/user-service.test.js
│   │
│   ├── recipe-service/
│   │   ├── Dockerfile
│   │   ├── server.js              # Express app — recipes, ratings, meal plans, /metrics
│   │   ├── middleware/auth.js     # authenticateJWT + requireRole
│   │   ├── models/
│   │   │   ├── MealPlan.js
│   │   │   ├── Rating.js
│   │   │   └── Recipe.js
│   │   ├── fixImages.js           # Maintenance script — fixes Unsplash URLs in MongoDB
│   │   ├── recipes.json           # Seed data
│   │   └── tests/
│   │       ├── basic.test.js
│   │       └── recipe-service.test.js
│   │
│   └── recommendation-service/
│       ├── Dockerfile
│       ├── server.js              # Express app — recommendations, RabbitMQ consumer
│       ├── middleware/auth.js     # authenticateJWT + requireRole
│       ├── models/Recommendation.js
│       └── tests/recommendation-service.test.js
│
├── frontend/
│   ├── Dockerfile                 # Multi-stage build: Node (Vite) → Nginx
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx               # Keycloak init — blocks render until authenticated
│       ├── App.jsx                # Main component — auth, recipes, filters, ratings
│       ├── App.css                # Terracotta theme (Bebas Neue + IBM Plex Mono)
│       ├── index.css              # CSS variables + global animations
│       └── components/
│           └── MonthlyMealPlan.jsx  # Drag & drop calendar — lunch/dinner slots
│
└── k8s/                           # Helm Charts (ArgoCD watches this folder)
    ├── Chart.yaml
    ├── values.yaml                # Service images, ports, replicas
    ├── argocd-app.yaml            # GitOps — auto-sync on push to main
    └── templates/
        ├── deployment.yaml        # Generated Deployments + init containers (wait-for-mongo)
        ├── service.yaml           # ClusterIP Services
        ├── ingress.yaml           # Traefik routing — APIs (priority 100) + Frontend (priority 1)
        ├── secrets.yaml           # RabbitMQ, MongoDB, Keycloak URLs
        ├── mongodb.yaml           # MongoDB Deployment + PVC (2Gi)
        ├── rabbitmq.yaml          # RabbitMQ + management port 15672
        ├── cluster-issuer.yaml    # Cert-Manager — Let's Encrypt issuer
        ├── monitoring.yaml        # Prometheus + Grafana Deployments + Services + Ingress
        └── grafana-dashboard-configmap.yaml  # Four Golden Signals dashboard JSON
```

---

## 👥 Authors

| Name | GitHub |
|---|---|
| Paula Cortina | — |
| Alejandro Yécora | [@AlejandroYM](https://github.com/AlejandroYM) |
