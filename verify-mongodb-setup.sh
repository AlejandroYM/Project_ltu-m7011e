#!/bin/bash
# Script de Verificación Automatizada de MongoDB en Kubernetes
# Para Chef Match Project

set -e

NAMESPACE="todo-app"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════════════════════"
echo "  VERIFICACIÓN DE MONGODB EN KUBERNETES - CHEF MATCH"
echo "════════════════════════════════════════════════════════════"
echo ""

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "ℹ $1"
}

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl no está instalado"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. VERIFICANDO POD DE MONGODB"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MONGO_POD=$(kubectl get pods -n $NAMESPACE -l app=mongodb -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$MONGO_POD" ]; then
    # Try alternative label
    MONGO_POD=$(kubectl get pods -n $NAMESPACE | grep mongo | awk '{print $1}' | head -n 1)
fi

if [ -z "$MONGO_POD" ]; then
    print_error "No se encontró pod de MongoDB en namespace $NAMESPACE"
    print_info "Pods disponibles:"
    kubectl get pods -n $NAMESPACE
    exit 1
else
    MONGO_STATUS=$(kubectl get pod -n $NAMESPACE $MONGO_POD -o jsonpath='{.status.phase}')
    if [ "$MONGO_STATUS" == "Running" ]; then
        print_success "Pod de MongoDB encontrado: $MONGO_POD (Estado: $MONGO_STATUS)"
    else
        print_error "Pod de MongoDB existe pero NO está Running: $MONGO_STATUS"
        print_info "Logs del pod:"
        kubectl logs -n $NAMESPACE $MONGO_POD --tail=20
        exit 1
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. VERIFICANDO SERVICE DE MONGODB"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MONGO_SERVICE=$(kubectl get svc -n $NAMESPACE -o jsonpath='{.items[?(@.spec.selector.app=="mongodb")].metadata.name}' 2>/dev/null || echo "")

if [ -z "$MONGO_SERVICE" ]; then
    # Try finding any service with mongo in name
    MONGO_SERVICE=$(kubectl get svc -n $NAMESPACE | grep mongo | awk '{print $1}' | head -n 1)
fi

if [ -z "$MONGO_SERVICE" ]; then
    print_error "No se encontró Service de MongoDB"
    print_warning "Sin Service, los otros servicios NO pueden conectarse a MongoDB"
    print_info "Services disponibles en namespace $NAMESPACE:"
    kubectl get svc -n $NAMESPACE
    echo ""
    print_info "NECESITAS CREAR: k8s/mongodb-service.yaml (ver guía)"
else
    MONGO_SERVICE_IP=$(kubectl get svc -n $NAMESPACE $MONGO_SERVICE -o jsonpath='{.spec.clusterIP}')
    MONGO_SERVICE_PORT=$(kubectl get svc -n $NAMESPACE $MONGO_SERVICE -o jsonpath='{.spec.ports[0].port}')
    print_success "Service de MongoDB encontrado: $MONGO_SERVICE"
    print_info "    ClusterIP: $MONGO_SERVICE_IP"
    print_info "    Puerto: $MONGO_SERVICE_PORT"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. VERIFICANDO CONECTIVIDAD A MONGODB"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if kubectl exec -n $NAMESPACE $MONGO_POD -- mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    print_success "MongoDB responde correctamente"
elif kubectl exec -n $NAMESPACE $MONGO_POD -- mongo --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    print_success "MongoDB responde correctamente (versión antigua)"
else
    print_error "MongoDB NO responde a comandos"
    print_info "Logs recientes:"
    kubectl logs -n $NAMESPACE $MONGO_POD --tail=10
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. VERIFICANDO BASES DE DATOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Bases de datos existentes:"
kubectl exec -n $NAMESPACE $MONGO_POD -- mongosh --quiet --eval "db.adminCommand('listDatabases').databases.forEach(function(db){ print('  - ' + db.name + ' (' + (db.sizeOnDisk / 1024 / 1024).toFixed(2) + ' MB)'); })" 2>/dev/null || \
kubectl exec -n $NAMESPACE $MONGO_POD -- mongo --quiet --eval "db.adminCommand('listDatabases').databases.forEach(function(db){ print('  - ' + db.name + ' (' + (db.sizeOnDisk / 1024 / 1024).toFixed(2) + ' MB)'); })" 2>/dev/null || \
print_warning "No se pudo listar bases de datos"

# Check if chefmatch database exists
if kubectl exec -n $NAMESPACE $MONGO_POD -- mongosh --quiet --eval "db.getMongo().getDBNames().includes('chefmatch')" 2>/dev/null | grep -q true; then
    print_success "Base de datos 'chefmatch' existe"
    
    echo ""
    echo "Colecciones en chefmatch:"
    kubectl exec -n $NAMESPACE $MONGO_POD -- mongosh chefmatch --quiet --eval "db.getCollectionNames().forEach(function(col){ print('  - ' + col + ': ' + db.getCollection(col).countDocuments() + ' documentos'); })" 2>/dev/null || \
    print_warning "No se pudo listar colecciones"
else
    print_warning "Base de datos 'chefmatch' NO existe (se creará cuando los servicios se conecten)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. VERIFICANDO SERVICIOS - RECIPE SERVICE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RECIPE_POD=$(kubectl get pods -n $NAMESPACE -l app=recipe-service -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$RECIPE_POD" ]; then
    print_error "Pod de recipe-service no encontrado"
else
    print_success "Pod encontrado: $RECIPE_POD"
    
    # Check MONGODB_URI
    MONGO_URI=$(kubectl exec -n $NAMESPACE $RECIPE_POD -- env 2>/dev/null | grep MONGODB_URI || echo "")
    
    if [ -z "$MONGO_URI" ]; then
        print_error "Variable MONGODB_URI NO está configurada"
        print_warning "El servicio NO puede conectarse a MongoDB sin esta variable"
        print_info "NECESITAS AGREGAR en deployment: MONGODB_URI=mongodb://mongodb:27017/chefmatch"
    else
        print_success "Variable MONGODB_URI está configurada"
        print_info "    $MONGO_URI"
    fi
    
    # Check logs for MongoDB connection
    echo ""
    print_info "Últimas 10 líneas de logs (buscando MongoDB):"
    kubectl logs -n $NAMESPACE $RECIPE_POD --tail=30 2>/dev/null | grep -i mongo || print_warning "No hay menciones de MongoDB en los logs"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. VERIFICANDO SERVICIOS - USER SERVICE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

USER_POD=$(kubectl get pods -n $NAMESPACE -l app=user-service -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$USER_POD" ]; then
    print_error "Pod de user-service no encontrado"
else
    print_success "Pod encontrado: $USER_POD"
    
    MONGO_URI=$(kubectl exec -n $NAMESPACE $USER_POD -- env 2>/dev/null | grep MONGODB_URI || echo "")
    
    if [ -z "$MONGO_URI" ]; then
        print_error "Variable MONGODB_URI NO está configurada"
    else
        print_success "Variable MONGODB_URI está configurada"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7. VERIFICANDO SERVICIOS - RECOMMENDATION SERVICE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RECOMMENDATION_POD=$(kubectl get pods -n $NAMESPACE -l app=recommendation-service -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -z "$RECOMMENDATION_POD" ]; then
    print_error "Pod de recommendation-service no encontrado"
else
    print_success "Pod encontrado: $RECOMMENDATION_POD"
    
    MONGO_URI=$(kubectl exec -n $NAMESPACE $RECOMMENDATION_POD -- env 2>/dev/null | grep MONGODB_URI || echo "")
    
    if [ -z "$MONGO_URI" ]; then
        print_error "Variable MONGODB_URI NO está configurada"
        print_warning "SEGÚN TU PROFESOR: recommendation-service DEBE usar MongoDB (REQ6)"
    else
        print_success "Variable MONGODB_URI está configurada"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8. VERIFICANDO PERSISTENCIA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PVC=$(kubectl get pvc -n $NAMESPACE | grep mongo | awk '{print $1}' | head -n 1)

if [ -z "$PVC" ]; then
    print_warning "No se encontró PersistentVolumeClaim para MongoDB"
    print_warning "Los datos se perderán al reiniciar el pod"
    print_info "NECESITAS CREAR: PVC y montarlo en /data/db (ver guía)"
else
    print_success "PersistentVolumeClaim encontrado: $PVC"
    kubectl get pvc -n $NAMESPACE $PVC
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  RESUMEN DE VERIFICACIÓN"
echo "════════════════════════════════════════════════════════════"
echo ""

# Summary
ERRORS=0
WARNINGS=0

if [ -z "$MONGO_SERVICE" ]; then
    print_error "CRÍTICO: Service de MongoDB NO existe"
    ERRORS=$((ERRORS+1))
fi

if [ -z "$MONGO_URI" ] && [ ! -z "$RECIPE_POD" ]; then
    print_error "CRÍTICO: MONGODB_URI no configurada en los servicios"
    ERRORS=$((ERRORS+1))
fi

if [ -z "$PVC" ]; then
    print_warning "ADVERTENCIA: Sin persistencia, los datos se perderán"
    WARNINGS=$((WARNINGS+1))
fi

echo ""
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    print_success "✓ TODO ESTÁ CONFIGURADO CORRECTAMENTE"
elif [ $ERRORS -eq 0 ]; then
    print_warning "⚠ Configuración básica OK pero hay advertencias ($WARNINGS)"
else
    print_error "✗ HAY PROBLEMAS CRÍTICOS QUE RESOLVER ($ERRORS errores)"
    echo ""
    echo "PRÓXIMOS PASOS:"
    echo "1. Lee: mongodb-kubernetes-setup-guide.md"
    echo "2. Crea el Service de MongoDB si no existe"
    echo "3. Agrega MONGODB_URI a los deployments"
    echo "4. Aplica cambios: kubectl apply -f k8s/"
    echo "5. Ejecuta este script de nuevo para verificar"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
