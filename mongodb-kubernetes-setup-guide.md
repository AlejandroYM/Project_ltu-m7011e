# GUÍA COMPLETA: CONFIGURAR MONGODB EN KUBERNETES

## PROBLEMA COMÚN

Los servicios están corriendo pero NO se conectan a MongoDB porque:
1. ❌ No tienen la variable `MONGODB_URI` configurada
2. ❌ El Service de MongoDB no existe o tiene nombre incorrecto
3. ❌ MongoDB está en un namespace diferente
4. ❌ MongoDB no tiene persistencia (datos se pierden al reiniciar)

## SOLUCIÓN PASO A PASO

### PASO 1: Verificar y Crear el Service de MongoDB

Primero, verifica si existe:
```bash
kubectl get svc -n todo-app | grep mongo
```

Si NO existe, crea este archivo:

```yaml
# k8s/mongodb-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  namespace: todo-app
  labels:
    app: mongodb
spec:
  type: ClusterIP
  ports:
  - port: 27017
    targetPort: 27017
    protocol: TCP
  selector:
    app: mongodb  # IMPORTANTE: debe coincidir con el label del Deployment
```

Aplicar:
```bash
kubectl apply -f k8s/mongodb-service.yaml
```

### PASO 2: Verificar/Actualizar el Deployment de MongoDB

```yaml
# k8s/mongodb-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongodb
  namespace: todo-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mongodb  # IMPORTANTE: debe coincidir con el Service
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
      - name: mongodb
        image: mongo:7.0
        ports:
        - containerPort: 27017
        env:
        - name: MONGO_INITDB_ROOT_USERNAME
          value: "admin"
        - name: MONGO_INITDB_ROOT_PASSWORD
          value: "password123"  # CAMBIAR en producción
        - name: MONGO_INITDB_DATABASE
          value: "chefmatch"
        volumeMounts:
        - name: mongodb-data
          mountPath: /data/db
      volumes:
      - name: mongodb-data
        persistentVolumeClaim:
          claimName: mongodb-pvc

---
# PersistentVolumeClaim para mantener los datos
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongodb-pvc
  namespace: todo-app
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

Aplicar:
```bash
kubectl apply -f k8s/mongodb-deployment.yaml
```

### PASO 3: Crear Secret para MongoDB

NO hardcodear passwords en el código. Usar Kubernetes Secrets:

```bash
# Crear secret con credenciales de MongoDB
kubectl create secret generic mongodb-secret \
  --from-literal=mongodb-root-username=admin \
  --from-literal=mongodb-root-password=password123 \
  --from-literal=mongodb-uri=mongodb://admin:password123@mongodb:27017/chefmatch?authSource=admin \
  -n todo-app
```

### PASO 4: Actualizar Deployments de los Servicios

Todos los servicios necesitan la variable `MONGODB_URI`. Ejemplo para recipe-service:

```yaml
# k8s/recipe-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recipe-service
  namespace: todo-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: recipe-service
  template:
    metadata:
      labels:
        app: recipe-service
    spec:
      containers:
      - name: recipe-service
        image: your-registry/recipe-service:latest
        ports:
        - containerPort: 3002
        env:
        # ✅ AGREGAR ESTA VARIABLE (la más importante)
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: mongodb-secret
              key: mongodb-uri
        
        # Otras variables necesarias
        - name: KEYCLOAK_URL
          value: "https://keycloak.ltu-m7011e-5.se"
        - name: KEYCLOAK_REALM
          value: "chefmatch"
        - name: KEYCLOAK_CLIENT_ID
          value: "recipe-service"
        - name: PORT
          value: "3002"
```

**IMPORTANTE**: Aplicar el mismo cambio a:
- user-service-deployment.yaml
- recommendation-service-deployment.yaml

### PASO 5: Aplicar Todos los Cambios

```bash
# Aplicar configuración de MongoDB
kubectl apply -f k8s/mongodb-deployment.yaml
kubectl apply -f k8s/mongodb-service.yaml

# Aplicar deployments actualizados de los servicios
kubectl apply -f k8s/recipe-service-deployment.yaml
kubectl apply -f k8s/user-service-deployment.yaml
kubectl apply -f k8s/recommendation-service-deployment.yaml

# O si usas Helm, actualizar el chart
helm upgrade chef-match ./helm-chart -n todo-app
```

### PASO 6: Verificar que Todo Funciona

```bash
# 1. Verificar que MongoDB está corriendo
kubectl get pods -n todo-app | grep mongodb
# Debe mostrar: mongodb-xxx   1/1   Running

# 2. Verificar que el Service existe
kubectl get svc -n todo-app mongodb
# Debe mostrar: mongodb   ClusterIP   10.x.x.x   <none>   27017/TCP

# 3. Verificar que los servicios tienen MONGODB_URI
kubectl exec -n todo-app $(kubectl get pods -n todo-app -l app=recipe-service -o jsonpath='{.items[0].metadata.name}') -- env | grep MONGODB_URI
# Debe mostrar: MONGODB_URI=mongodb://admin:password123@mongodb:27017/chefmatch?authSource=admin

# 4. Ver logs de un servicio (NO debe haber errores de MongoDB)
kubectl logs -n todo-app $(kubectl get pods -n todo-app -l app=recipe-service -o jsonpath='{.items[0].metadata.name}') --tail=50

# Buscar líneas como:
# ✅ "Connected to MongoDB" 
# ❌ "MongooseServerSelectionError" o "ECONNREFUSED"

# 5. Conectarse a MongoDB y verificar las bases de datos
kubectl exec -it -n todo-app $(kubectl get pods -n todo-app -l app=mongodb -o jsonpath='{.items[0].metadata.name}') -- mongosh -u admin -p password123 --authenticationDatabase admin

# Dentro de mongosh:
show dbs
use chefmatch
show collections
# Deberías ver: recipes, users, recommendations (si ya se crearon datos)
```

### PASO 7: Probar Creando una Receta

```bash
# Obtener un JWT token válido desde Keycloak primero
# Luego probar el endpoint:

curl -X POST https://ltu-m7011e-5.se/api/recipes \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Recipe",
    "ingredients": ["ingredient 1", "ingredient 2"],
    "instructions": ["step 1", "step 2"],
    "category": "Test"
  }'

# Si funciona, verificar que se guardó en MongoDB:
kubectl exec -it -n todo-app $(kubectl get pods -n todo-app -l app=mongodb -o jsonpath='{.items[0].metadata.name}') -- mongosh -u admin -p password123 --authenticationDatabase admin

# Dentro de mongosh:
use chefmatch
db.recipes.find().pretty()
# Deberías ver tu receta de prueba
```

## TROUBLESHOOTING

### Error: "MongooseServerSelectionError: connect ECONNREFUSED"

**Causa**: El servicio no puede conectarse a MongoDB

**Solución**:
1. Verificar que el Service de MongoDB existe: `kubectl get svc -n todo-app mongodb`
2. Verificar que MONGODB_URI apunta a `mongodb` (el nombre del Service)
3. Verificar que ambos están en el mismo namespace (`todo-app`)

### Error: "Authentication failed"

**Causa**: Credenciales incorrectas en MONGODB_URI

**Solución**:
1. Verificar usuario/password en el Secret
2. Asegurarse de incluir `?authSource=admin` en la URI
3. URI correcta: `mongodb://admin:password123@mongodb:27017/chefmatch?authSource=admin`

### MongoDB pierde datos al reiniciar

**Causa**: No hay PersistentVolume configurado

**Solución**:
1. Crear PersistentVolumeClaim (ver PASO 2)
2. Montar el volumen en `/data/db`
3. Aplicar deployment actualizado

### Los servicios no ven MONGODB_URI

**Causa**: Variable no definida en el Deployment

**Solución**:
1. Agregar la variable env en el Deployment (ver PASO 4)
2. Aplicar el deployment: `kubectl apply -f ...`
3. Reiniciar pods: `kubectl rollout restart deployment/recipe-service -n todo-app`

## CHECKLIST FINAL

- [ ] Service de MongoDB existe y es tipo ClusterIP
- [ ] MongoDB Deployment tiene labels que coinciden con Service selector
- [ ] Secret con mongodb-uri está creado
- [ ] Todos los servicios tienen `MONGODB_URI` en env
- [ ] Logs de los servicios muestran "Connected to MongoDB"
- [ ] Se puede crear/listar recetas via API
- [ ] Los datos persisten después de reiniciar MongoDB

## ARQUITECTURA CORRECTA

```
┌─────────────────┐
│  recipe-service │──┐
└─────────────────┘  │
                     │
┌─────────────────┐  │    ┌──────────────┐      ┌──────────────┐
│   user-service  │──┼───→│   mongodb    │─────→│ PersistentVol│
└─────────────────┘  │    │   (Service)  │      │              │
                     │    └──────────────┘      └──────────────┘
┌─────────────────┐  │           ↓
│recommendation-  │──┘    ┌──────────────┐
│    service      │       │  mongodb Pod │
└─────────────────┘       └──────────────┘
```

Todos los servicios → Service "mongodb" → Pod de MongoDB → PersistentVolume
