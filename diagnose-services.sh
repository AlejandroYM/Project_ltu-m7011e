#!/bin/bash
# diagnose-services.sh
# Script para diagnosticar problemas de conectividad con Chef Match

echo "═══════════════════════════════════════════════════════"
echo "  DIAGNÓSTICO DE SERVICIOS - CHEF MATCH"
echo "═══════════════════════════════════════════════════════"
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# URLs a verificar
RECIPE_URL="https://recipes.ltu-m7011e-5.se"
USER_URL="https://users.ltu-m7011e-5.se"
RECOMMENDATION_URL="https://recommendations.ltu-m7011e-5.se"
KEYCLOAK_URL="https://keycloak.ltu-m7011e-5.se"
MAIN_URL="https://ltu-m7011e-5.se"

# Función para verificar un endpoint
check_endpoint() {
    local url=$1
    local name=$2
    
    echo -n "Verificando ${name}... "
    
    # Intenta hacer un request con timeout de 5 segundos
    response=$(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "${url}" 2>&1)
    
    if [ $? -eq 0 ]; then
        if [ "$response" -ge 200 ] && [ "$response" -lt 500 ]; then
            echo -e "${GREEN}✓ OK (HTTP ${response})${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ Responde pero con error (HTTP ${response})${NC}"
            return 1
        fi
    else
        echo -e "${RED}✗ NO ACCESIBLE${NC}"
        echo "   Error: ${response}"
        return 2
    fi
}

echo "1️⃣  VERIFICANDO CONECTIVIDAD DE RED"
echo "───────────────────────────────────────────────────────"

# Verificar dominio principal
check_endpoint "${MAIN_URL}" "Dominio principal (ltu-m7011e-5.se)"

# Verificar Keycloak
check_endpoint "${KEYCLOAK_URL}/realms/ChefMatchRealm" "Keycloak"

# Verificar microservicios
echo ""
echo "2️⃣  VERIFICANDO MICROSERVICIOS"
echo "───────────────────────────────────────────────────────"

check_endpoint "${RECIPE_URL}/recipes" "Recipe Service"
check_endpoint "${USER_URL}/users/profile" "User Service (sin auth, esperado 401)"
check_endpoint "${RECOMMENDATION_URL}/health" "Recommendation Service"

echo ""
echo "3️⃣  VERIFICANDO RUTAS ALTERNATIVAS (si usas misma URL base)"
echo "───────────────────────────────────────────────────────"

check_endpoint "${MAIN_URL}/api/recipes" "Recipes en /api/recipes"
check_endpoint "${MAIN_URL}/api/users" "Users en /api/users"
check_endpoint "${MAIN_URL}/api/recommendations" "Recommendations en /api/recommendations"

echo ""
echo "4️⃣  PROBANDO AUTENTICACIÓN"
echo "───────────────────────────────────────────────────────"

echo -n "Obteniendo token de Keycloak... "
token_response=$(curl -k -s -X POST "${KEYCLOAK_URL}/realms/ChefMatchRealm/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=frontend-client" \
  -d "username=testuser" \
  -d "password=Test1234" 2>&1)

if echo "$token_response" | grep -q "access_token"; then
    echo -e "${GREEN}✓ Token obtenido correctamente${NC}"
    
    # Extraer token
    access_token=$(echo "$token_response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    
    # Probar endpoint autenticado
    echo -n "Probando endpoint autenticado (GET /users/profile)... "
    auth_response=$(curl -k -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${access_token}" \
      "${USER_URL}/users/profile" 2>&1)
    
    if [ "$auth_response" == "200" ] || [ "$auth_response" == "404" ]; then
        echo -e "${GREEN}✓ Autenticación funciona (HTTP ${auth_response})${NC}"
    else
        echo -e "${YELLOW}⚠ Problema de autenticación (HTTP ${auth_response})${NC}"
    fi
else
    echo -e "${RED}✗ No se pudo obtener token${NC}"
    echo "   Respuesta: ${token_response:0:200}"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  RESUMEN Y RECOMENDACIONES"
echo "═══════════════════════════════════════════════════════"
echo ""

echo "📝 PRÓXIMOS PASOS:"
echo ""
echo "1. Si TODOS los servicios están ${RED}✗ NO ACCESIBLES${NC}:"
echo "   → Verifica que tus pods/contenedores estén corriendo en Kubernetes"
echo "   → Comando: kubectl get pods -n <tu-namespace>"
echo ""
echo "2. Si ALGUNOS servicios funcionan pero otros no:"
echo "   → Verifica los logs del servicio que falla"
echo "   → Comando: kubectl logs <nombre-pod> -n <tu-namespace>"
echo ""
echo "3. Si los servicios responden pero con errores 5xx:"
echo "   → Revisa logs de la aplicación"
echo "   → Verifica configuración de base de datos/dependencias"
echo ""
echo "4. Si todo funciona aquí pero falla en k6:"
echo "   → Actualiza el token en load-test-chefmatch-fixed.k6.js (línea 24)"
echo "   → Verifica las URLs en BASE_URLS (líneas 28-32)"
echo ""
echo "═══════════════════════════════════════════════════════"
