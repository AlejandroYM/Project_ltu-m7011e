#!/bin/bash
# find-api-urls.sh
# Script para encontrar automáticamente las URLs correctas del API

echo "════════════════════════════════════════════════════════════"
echo "  BUSCADOR DE URLs DEL API - CHEF MATCH"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Buscando dónde están tus endpoints de API..."
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Función para verificar si una respuesta es JSON
is_json() {
    local response="$1"
    # Verifica que no sea HTML y contenga caracteres JSON
    if echo "$response" | grep -q "<!doctype\|<html"; then
        return 1
    elif echo "$response" | grep -qE '^\s*[\[{]'; then
        return 0
    else
        return 1
    fi
}

# Arrays para almacenar URLs que funcionan
declare -a WORKING_RECIPES=()
declare -a WORKING_USERS=()
declare -a WORKING_RECOMMENDATIONS=()

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  PROBANDO DIFERENTES RUTAS PARA RECIPES SERVICE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Probar diferentes patrones de URL para recipes
declare -a RECIPES_PATTERNS=(
    "https://ltu-m7011e-5.se/api/recipes"
    "https://api.ltu-m7011e-5.se/recipes"
    "https://recipes.ltu-m7011e-5.se/api/recipes"
    "https://recipes.ltu-m7011e-5.se/recipes"
    "https://ltu-m7011e-5.se/recipes"
    "https://ltu-m7011e-5.se:8080/recipes"
    "https://ltu-m7011e-5.se:3000/api/recipes"
)

for url in "${RECIPES_PATTERNS[@]}"; do
    echo -n "Probando: $url ... "
    response=$(curl -k -s -m 5 "$url" 2>&1)
    
    if is_json "$response"; then
        echo -e "${GREEN}✓ JSON VÁLIDO${NC}"
        WORKING_RECIPES+=("$url")
    elif echo "$response" | grep -q "<!doctype\|<html"; then
        echo -e "${RED}✗ HTML (frontend)${NC}"
    else
        echo -e "${YELLOW}⚠ Otro formato o error${NC}"
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  PROBANDO DIFERENTES RUTAS PARA USER SERVICE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

declare -a USER_PATTERNS=(
    "https://ltu-m7011e-5.se/api/users"
    "https://api.ltu-m7011e-5.se/users"
    "https://users.ltu-m7011e-5.se/api/users"
    "https://users.ltu-m7011e-5.se/users"
    "https://ltu-m7011e-5.se/users"
)

for url in "${USER_PATTERNS[@]}"; do
    echo -n "Probando: $url ... "
    response=$(curl -k -s -m 5 "$url" 2>&1)
    
    # User service puede devolver 401/404, que está bien
    if is_json "$response"; then
        echo -e "${GREEN}✓ JSON VÁLIDO${NC}"
        WORKING_USERS+=("$url")
    elif echo "$response" | grep -q "<!doctype\|<html"; then
        echo -e "${RED}✗ HTML (frontend)${NC}"
    else
        # Puede ser 401 o similar, lo cual está bien
        echo -e "${YELLOW}⚠ Requiere auth (probablemente correcto)${NC}"
        WORKING_USERS+=("$url")
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  PROBANDO DIFERENTES RUTAS PARA RECOMMENDATION SERVICE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

declare -a RECOMMENDATION_PATTERNS=(
    "https://ltu-m7011e-5.se/api/recommendations"
    "https://api.ltu-m7011e-5.se/recommendations"
    "https://recommendations.ltu-m7011e-5.se/api/recommendations"
    "https://recommendations.ltu-m7011e-5.se/recommendations"
    "https://ltu-m7011e-5.se/recommendations"
)

for url in "${RECOMMENDATION_PATTERNS[@]}"; do
    echo -n "Probando: $url ... "
    response=$(curl -k -s -m 5 "$url" 2>&1)
    
    if is_json "$response"; then
        echo -e "${GREEN}✓ JSON VÁLIDO${NC}"
        WORKING_RECOMMENDATIONS+=("$url")
    elif echo "$response" | grep -q "<!doctype\|<html"; then
        echo -e "${RED}✗ HTML (frontend)${NC}"
    else
        echo -e "${YELLOW}⚠ Otro formato${NC}"
        WORKING_RECOMMENDATIONS+=("$url")
    fi
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  RESULTADOS Y CONFIGURACIÓN RECOMENDADA"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ ${#WORKING_RECIPES[@]} -gt 0 ] || [ ${#WORKING_USERS[@]} -gt 0 ] || [ ${#WORKING_RECOMMENDATIONS[@]} -gt 0 ]; then
    echo -e "${GREEN}✓ Se encontraron URLs válidas!${NC}"
    echo ""
    
    echo "📝 CONFIGURACIÓN PARA TU SCRIPT K6:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Copia y pega esto en tu archivo load-test-chefmatch.k6.js"
    echo "Reemplaza las líneas 26-32 con:"
    echo ""
    echo -e "${BLUE}const BASE_URLS = {${NC}"
    
    if [ ${#WORKING_RECIPES[@]} -gt 0 ]; then
        echo -e "${BLUE}  recipe: '${WORKING_RECIPES[0]}',${NC}"
    else
        echo -e "${RED}  recipe: '❌ NO ENCONTRADO - VERIFICA MANUALMENTE',${NC}"
    fi
    
    if [ ${#WORKING_USERS[@]} -gt 0 ]; then
        echo -e "${BLUE}  user: '${WORKING_USERS[0]}',${NC}"
    else
        echo -e "${RED}  user: '❌ NO ENCONTRADO - VERIFICA MANUALMENTE',${NC}"
    fi
    
    if [ ${#WORKING_RECOMMENDATIONS[@]} -gt 0 ]; then
        echo -e "${BLUE}  recommendation: '${WORKING_RECOMMENDATIONS[0]}'${NC}"
    else
        echo -e "${RED}  recommendation: '❌ NO ENCONTRADO - VERIFICA MANUALMENTE'${NC}"
    fi
    
    echo -e "${BLUE}};${NC}"
    echo ""
else
    echo -e "${RED}❌ No se encontraron URLs válidas${NC}"
    echo ""
    echo "Posibles causas:"
    echo "1. Los servicios no están corriendo"
    echo "2. Están en URLs/puertos diferentes a los probados"
    echo "3. Requieren autenticación incluso para endpoints públicos"
    echo ""
    echo "Ejecuta manualmente:"
    echo "  kubectl get pods -n <tu-namespace>"
    echo "  kubectl get services -n <tu-namespace>"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
