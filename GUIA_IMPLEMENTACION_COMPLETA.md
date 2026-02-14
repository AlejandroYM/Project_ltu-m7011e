# 🚀 GUÍA DE IMPLEMENTACIÓN - Chef Match Project
## Día 2: 14 Feb 2026

Esta guía te llevará paso a paso por todas las tareas prioritarias de hoy.

---

## 📋 TABLA DE CONTENIDOS

1. [Tarea 1: Autenticación JWKS](#tarea-1-autenticación-jwks)
2. [Tarea 2: Tests Reales](#tarea-2-tests-reales)
3. [Tarea 3: Load Testing](#tarea-3-load-testing)
4. [Tarea 4: Verificar Frontend](#tarea-4-verificar-frontend)
5. [Checklist Final](#checklist-final)

---

## TAREA 1: Autenticación JWKS (2-3h)

### 🎯 Objetivo
Aplicar autenticación JWT a recipe-service y recommendation-service

### 📂 Archivos a crear/modificar

#### 1.1 Recipe Service - Crear middleware de autenticación

**Archivo:** `services/recipe-service/middleware/auth.js`

```bash
# En tu terminal, desde la raíz del proyecto:
mkdir -p services/recipe-service/middleware
```

**Contenido:** Copia el contenido de `recipe-service-auth-middleware.js` que te proporcioné

#### 1.2 Recommendation Service - Crear middleware de autenticación

**Archivo:** `services/recommendation-service/middleware/auth.js`

```bash
mkdir -p services/recommendation-service/middleware
```

**Contenido:** Copia el contenido de `recommendation-service-auth-middleware.js` que te proporcioné

#### 1.3 Instalar dependencias

```bash
# Recipe Service
cd services/recipe-service
npm install jwks-rsa --save

# Recommendation Service
cd ../recommendation-service
npm install jwks-rsa --save
```

#### 1.4 Actualizar server.js de Recipe Service

**Archivo:** `services/recipe-service/server.js`

**Cambios necesarios:**

1. Importar el middleware al inicio del archivo:
```javascript
const { authenticateJWT, optionalAuthJWT } = require('./middleware/auth');
```

2. Proteger los endpoints de escritura (POST, PUT, DELETE):
```javascript
// Ejemplo: Endpoint para crear recetas (requiere autenticación)
app.post('/recipes', authenticateJWT, async (req, res) => {
  // ... tu código existente
});

// Endpoints de lectura (GET) pueden usar optionalAuthJWT o no tener auth
app.get('/recipes', optionalAuthJWT, async (req, res) => {
  // ... tu código existente
});
```

**Endpoints que deben tener authenticateJWT:**
- POST /recipes
- PUT /recipes/:id
- DELETE /recipes/:id

**Endpoints que pueden ser públicos o con optionalAuthJWT:**
- GET /recipes
- GET /recipes/:id

#### 1.5 Actualizar server.js de Recommendation Service

**Archivo:** `services/recommendation-service/server.js`

**Cambios necesarios:**

1. Importar el middleware:
```javascript
const { authenticateJWT } = require('./middleware/auth');
```

2. Proteger TODOS los endpoints (las recomendaciones son personales):
```javascript
app.get('/recommendations', authenticateJWT, async (req, res) => {
  // Usar req.user.sub para obtener el userId
  const recommendations = await Recommendation.find({ userId: req.user.sub });
  res.json(recommendations);
});
```

#### 1.6 Probar la autenticación

```bash
# Obtener un token de Keycloak
curl -X POST "https://sso.ltu-m7011e-5.se/realms/chefmatch/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=chefmatch-client" \
  -d "username=TU_USUARIO" \
  -d "password=TU_PASSWORD"

# Guardar el access_token que te devuelve

# Probar endpoint protegido CON token
curl -X POST "https://recipes.ltu-m7011e-5.se/recipes" \
  -H "Authorization: Bearer TU_TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Recipe","ingredients":["test"],"instructions":"test"}'

# Probar endpoint protegido SIN token (debe dar 401)
curl -X POST "https://recipes.ltu-m7011e-5.se/recipes" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Recipe","ingredients":["test"],"instructions":"test"}'
```

#### 1.7 Commit y Push

```bash
git add .
git commit -m "feat: Add JWKS authentication to recipe and recommendation services"
git push origin main
```

---

## TAREA 2: Tests Reales (3-4h)

### 🎯 Objetivo
Escribir tests funcionales para los 3 servicios con casos de éxito y fallo

### 📂 Archivos a crear

#### 2.1 Instalar dependencias de testing

```bash
# Recipe Service
cd services/recipe-service
npm install --save-dev jest supertest

# User Service
cd ../user-service
npm install --save-dev jest supertest

# Recommendation Service
cd ../recommendation-service
npm install --save-dev jest supertest
```

#### 2.2 Actualizar package.json en cada servicio

Agrega o modifica la sección de scripts en cada `package.json`:

```json
{
  "scripts": {
    "test": "jest --coverage",
    "test:watch": "jest --watch"
  },
  "jest": {
    "testEnvironment": "node",
    "coveragePathIgnorePatterns": [
      "/node_modules/"
    ]
  }
}
```

#### 2.3 Crear archivos de tests

**Recipe Service:**
- **Archivo:** `services/recipe-service/recipe-service.test.js`
- **Contenido:** Copia el contenido de `recipe-service.test.js` que te proporcioné

**User Service:**
- **Archivo:** `services/user-service/user-service.test.js`
- **Contenido:** Copia el contenido de `user-service.test.js` que te proporcioné

**Recommendation Service:**
- **Archivo:** `services/recommendation-service/recommendation-service.test.js`
- **Contenido:** Copia el contenido de `recommendation-service.test.js` que te proporcioné

#### 2.4 Ejecutar tests localmente

```bash
# Recipe Service
cd services/recipe-service
npm test

# User Service
cd ../user-service
npm test

# Recommendation Service
cd ../recommendation-service
npm test
```

**Resultado esperado:**
- Todos los tests deben pasar ✅
- Coverage debe ser > 50% (probablemente estará alrededor de 60-70%)

#### 2.5 Verificar que GitHub Actions pasa

```bash
git add .
git commit -m "test: Add comprehensive tests for all services"
git push origin main

# Ir a GitHub y verificar que el CI pasa
# https://github.com/AlejandroYM/Project_ltu-m7011e/actions
```

---

## TAREA 3: Load Testing (1-2h)

### 🎯 Objetivo
Crear y ejecutar load test funcional con k6

### 📂 Archivos a crear

#### 3.1 Instalar k6

```bash
# En Mac
brew install k6

# En Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

#### 3.2 Crear script de load test

**Archivo:** `load-test.k6.js` (en la raíz del proyecto)

**Contenido:** Copia el contenido de `load-test.k6.js` que te proporcioné

#### 3.3 Obtener token de Keycloak

```bash
curl -X POST "https://sso.ltu-m7011e-5.se/realms/chefmatch/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=chefmatch-client" \
  -d "username=TU_USUARIO" \
  -d "password=TU_PASSWORD"
```

**Copiar el `access_token` del resultado**

#### 3.4 Actualizar el script con el token

Edita `load-test.k6.js` y reemplaza:

```javascript
const AUTH_TOKEN = 'TU_TOKEN_AQUI';
```

#### 3.5 Ejecutar load test

```bash
k6 run load-test.k6.js
```

**Métricas importantes a observar:**
- `http_req_duration`: Latencia (objetivo: p95 < 500ms)
- `http_req_failed`: Tasa de fallos (objetivo: < 10%)
- `http_reqs`: Requests por segundo (RPS)

#### 3.6 Documentar resultados

Crea un archivo `LOAD_TEST_RESULTS.md`:

```markdown
# Load Test Results - Chef Match

**Fecha:** 14 Feb 2026
**Duración:** 3.5 minutos
**Usuarios concurrentes:** 10 → 20 → 0

## Resultados

- Total requests: XXXX
- Requests fallidas: X.XX%
- Duración promedio: XXXms
- P95 latencia: XXXms
- RPS: XX.XX

## Conclusiones

[Tu análisis de los resultados]
```

#### 3.7 Commit y Push

```bash
git add load-test.k6.js LOAD_TEST_RESULTS.md
git commit -m "test: Add k6 load testing script and results"
git push origin main
```

---

## TAREA 4: Verificar Frontend (30min)

### 🎯 Objetivo
Verificar que el frontend consume APIs del backend y no tiene datos hardcodeados

### 📂 Archivos a revisar

#### 4.1 Buscar datos hardcodeados

```bash
# Desde la raíz del proyecto
cd frontend/src

# Buscar arrays de recetas hardcodeados
grep -r "const recipes" .
grep -r "const RECIPES" .
grep -r "hardcoded" .
```

#### 4.2 Verificar llamadas a API

Busca en los componentes:

**Archivos a revisar:**
- `frontend/src/components/RecipeList.jsx`
- `frontend/src/components/RecipePage.jsx`
- `frontend/src/components/Recommendations.jsx`
- `frontend/src/services/api.js` (o similar)

**Lo que debes ver:**
```javascript
// ✅ CORRECTO - Consume API
useEffect(() => {
  fetch('https://recipes.ltu-m7011e-5.se/recipes')
    .then(res => res.json())
    .then(data => setRecipes(data));
}, []);

// ❌ INCORRECTO - Datos hardcodeados
const recipes = [
  { id: 1, name: 'Pasta' },
  { id: 2, name: 'Pizza' }
];
```

#### 4.3 Si encuentras datos hardcodeados

**Reemplazar con llamadas a API:**

```javascript
// Antes
const recipes = [/* datos hardcodeados */];

// Después
const [recipes, setRecipes] = useState([]);

useEffect(() => {
  const fetchRecipes = async () => {
    try {
      const response = await fetch('https://recipes.ltu-m7011e-5.se/recipes');
      const data = await response.json();
      setRecipes(data);
    } catch (error) {
      console.error('Error fetching recipes:', error);
    }
  };
  
  fetchRecipes();
}, []);
```

#### 4.4 Probar el frontend localmente

```bash
cd frontend
npm run dev

# Abrir http://localhost:5173
# Verificar que:
# 1. Las recetas se cargan desde la API
# 2. No hay errores en la consola
# 3. La autenticación funciona si aplica
```

#### 4.5 Commit si hiciste cambios

```bash
git add .
git commit -m "fix: Remove hardcoded data from frontend, use API calls"
git push origin main
```

---

## CHECKLIST FINAL

Antes de terminar, verifica:

### ✅ Autenticación JWKS
- [ ] Middleware creado en recipe-service
- [ ] Middleware creado en recommendation-service
- [ ] jwks-rsa instalado en ambos servicios
- [ ] server.js actualizados con autenticación
- [ ] Endpoints protegidos correctamente
- [ ] Probado con curl (con y sin token)
- [ ] Commit y push realizados

### ✅ Tests Reales
- [ ] jest y supertest instalados en los 3 servicios
- [ ] Tests creados para recipe-service
- [ ] Tests creados para user-service
- [ ] Tests creados para recommendation-service
- [ ] Todos los tests pasan localmente
- [ ] Coverage > 50% en todos los servicios
- [ ] GitHub Actions pasa ✅
- [ ] Commit y push realizados

### ✅ Load Testing
- [ ] k6 instalado
- [ ] Script load-test.k6.js creado
- [ ] Token de Keycloak obtenido
- [ ] Load test ejecutado exitosamente
- [ ] Resultados documentados
- [ ] Commit y push realizados

### ✅ Frontend
- [ ] Código revisado
- [ ] No hay datos hardcodeados
- [ ] Consume APIs del backend
- [ ] Funciona correctamente
- [ ] Commit y push realizados (si aplica)

### ✅ General
- [ ] Todos los cambios commiteados
- [ ] GitHub Actions en verde
- [ ] README actualizado (si aplica)
- [ ] Documentación completa

---

## 🎯 RESUMEN DE ARCHIVOS CREADOS/MODIFICADOS

### Nuevos archivos:
1. `services/recipe-service/middleware/auth.js`
2. `services/recommendation-service/middleware/auth.js`
3. `services/recipe-service/recipe-service.test.js`
4. `services/user-service/user-service.test.js`
5. `services/recommendation-service/recommendation-service.test.js`
6. `load-test.k6.js`
7. `LOAD_TEST_RESULTS.md`

### Archivos modificados:
1. `services/recipe-service/server.js`
2. `services/recommendation-service/server.js`
3. `services/recipe-service/package.json`
4. `services/user-service/package.json`
5. `services/recommendation-service/package.json`
6. `frontend/src/**` (posiblemente)

---

## 🚨 PROBLEMAS COMUNES Y SOLUCIONES

### Problema: Tests fallan con "Cannot find module"
**Solución:** Asegúrate de que el path en el `require()` sea correcto:
```javascript
// Si tu server.js está en services/recipe-service/server.js
// Y tu middleware está en services/recipe-service/middleware/auth.js
const { authenticateJWT } = require('./middleware/auth');
```

### Problema: k6 no reconoce el token
**Solución:** 
- Verifica que el token no haya expirado
- Obtén un nuevo token
- Verifica que el formato sea: `Bearer TU_TOKEN`

### Problema: GitHub Actions falla
**Solución:**
- Revisa los logs en GitHub Actions
- Ejecuta `npm test` localmente primero
- Verifica que todas las dependencias estén en package.json

### Problema: MongoDB no conecta en tests
**Solución:** Los tests usan mocks, no deberían conectar a MongoDB real. Si ves errores:
- Verifica que el mock de mongoose esté correcto
- Revisa que jest esté configurado correctamente

---

## 📞 SIGUIENTE SESIÓN

Al empezar mañana, comparte este documento y menciona:
- ✅ Qué completaste
- ❌ Qué quedó pendiente
- 🐛 Qué problemas encontraste

**¡Éxito con la implementación! 🚀**
