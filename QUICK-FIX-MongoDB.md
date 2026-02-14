# 🚨 QUICK FIX: MONGODB VACÍA - SOLUCIÓN RÁPIDA

## ❌ PROBLEMA ACTUAL

Según las capturas de pantalla:
- ✅ MongoDB está corriendo (`mongo-service-85658f75fb-nzdt6`)
- ✅ Los 3 servicios están corriendo
- ❌ MongoDB está vacía porque los servicios NO se están conectando
- ❌ Probablemente falta el Service de MongoDB
- ❌ Probablemente falta la variable MONGODB_URI en los deployments

## ✅ SOLUCIÓN EN 10 MINUTOS

### PASO 1: Ejecutar Comandos de Diagnóstico (2 minutos)

Abre tu terminal y ejecuta:

```bash
# Verificar si existe el Service de MongoDB
kubectl get svc -n todo-app | grep mongo

# Verificar si recipe-service tiene MONGODB_URI
kubectl exec -n todo-app recipe-service-5c96bc798d-vs5qn -- env | grep MONGODB_URI
```

**Resultado esperado:**
- ❌ Si NO aparece nada = TIENES QUE CREAR EL SERVICE Y AGREGAR LA VARIABLE
- ✅ Si aparece algo = continúa al PASO 3

### PASO 2: Crear Service de MongoDB (3 minutos)

Crea el archivo `k8s/mongodb-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  namespace: todo-app
spec:
  type: ClusterIP
  ports:
  - port: 27017
    targetPort: 27017
  selector:
    app: mongodb  # O el label que tenga tu deployment actual
```

Aplicar:
```bash
kubectl apply -f k8s/mongodb-service.yaml

# Verificar que se creó
kubectl get svc -n todo-app mongodb
```

### PASO 3: Agregar MONGODB_URI a los Servicios (5 minutos)

Edita directamente los deployments:

```bash
# Opción A: Editar en línea (más rápido)
kubectl set env deployment/recipe-service -n todo-app \
  MONGODB_URI="mongodb://mongodb:27017/chefmatch"

kubectl set env deployment/user-service -n todo-app \
  MONGODB_URI="mongodb://mongodb:27017/chefmatch"

kubectl set env deployment/recommendation-service -n todo-app \
  MONGODB_URI="mongodb://mongodb:27017/chefmatch"

# Esto reiniciará automáticamente los pods
```

**O Opción B: Editar YAML manualmente:**

```bash
# Editar recipe-service
kubectl edit deployment recipe-service -n todo-app

# Buscar la sección "env:" y agregar:
        env:
        - name: MONGODB_URI
          value: "mongodb://mongodb:27017/chefmatch"
        # ... otras variables ...

# Guardar y salir (ESC, :wq, ENTER)
# Repetir para user-service y recommendation-service
```

### PASO 4: Verificar que Funciona (2 minutos)

```bash
# 1. Esperar a que los pods se reinicien
kubectl get pods -n todo-app -w
# Presiona Ctrl+C cuando todos estén Running

# 2. Verificar logs (debe decir "Connected to MongoDB")
kubectl logs -n todo-app -l app=recipe-service --tail=20

# 3. Verificar que la variable está configurada
kubectl exec -n todo-app $(kubectl get pods -n todo-app -l app=recipe-service -o jsonpath='{.items[0].metadata.name}') -- env | grep MONGODB_URI

# Debe mostrar: MONGODB_URI=mongodb://mongodb:27017/chefmatch
```

### PASO 5: Probar Creando Datos (2 minutos)

```bash
# 1. Conectarse a MongoDB
kubectl exec -it -n todo-app mongo-service-85658f75fb-nzdt6 -- mongosh

# 2. Dentro de mongosh, ejecutar:
use chefmatch
db.recipes.insertOne({
  name: "Test Recipe",
  ingredients: ["test"],
  instructions: ["test"]
})
show collections
db.recipes.find()
exit

# Si funciona, los servicios ahora pueden guardar/leer datos
```

---

## ⚡ RESUMEN SUPER RÁPIDO

Si tienes prisa, ejecuta esto:

```bash
# 1. Crear Service
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  namespace: todo-app
spec:
  type: ClusterIP
  ports:
  - port: 27017
    targetPort: 27017
  selector:
    app: mongodb
EOF

# 2. Agregar MONGODB_URI a los 3 servicios
kubectl set env deployment/recipe-service -n todo-app MONGODB_URI="mongodb://mongodb:27017/chefmatch"
kubectl set env deployment/user-service -n todo-app MONGODB_URI="mongodb://mongodb:27017/chefmatch"
kubectl set env deployment/recommendation-service -n todo-app MONGODB_URI="mongodb://mongodb:27017/chefmatch"

# 3. Esperar 30 segundos y verificar logs
sleep 30
kubectl logs -n todo-app -l app=recipe-service --tail=20
```

---

## 🔍 VERIFICACIÓN FINAL

Descarga y ejecuta el script de verificación:

```bash
# Descargar el script
curl -O verify-mongodb-setup.sh
chmod +x verify-mongodb-setup.sh

# Ejecutar
./verify-mongodb-setup.sh

# Debe mostrar:
# ✓ Pod de MongoDB encontrado
# ✓ Service de MongoDB encontrado
# ✓ MongoDB responde correctamente
# ✓ Variable MONGODB_URI está configurada
```

---

## ⚠️ NOTA IMPORTANTE: SELECTOR DEL SERVICE

El Service usa `selector: app: mongodb` para encontrar el pod. Si tu pod de MongoDB tiene un label diferente, necesitas cambiarlo.

Para verificar el label actual:

```bash
kubectl get pod -n todo-app mongo-service-85658f75fb-nzdt6 --show-labels
```

Si muestra algo como `app=mongo-service`, entonces en tu Service usa:

```yaml
selector:
  app: mongo-service  # ← Cambiar aquí al label real
```

---

## 📞 SI ALGO NO FUNCIONA

1. Comparte los logs: `kubectl logs -n todo-app recipe-service-xxx --tail=50`
2. Comparte los eventos: `kubectl get events -n todo-app --sort-by='.lastTimestamp'`
3. Ejecuta el script de verificación y comparte el output

---

## 📚 SIGUIENTE PASO: PERSISTENCIA

Una vez que MongoDB funcione, DEBES agregar persistencia:
- Crear PersistentVolumeClaim
- Montar volumen en `/data/db`
- Ver archivo: `mongodb-kubernetes-setup-guide.md`

¡Esto evitará que pierdas los datos al reiniciar MongoDB!
