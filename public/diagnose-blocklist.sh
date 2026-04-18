#!/bin/bash
# Diagnóstico completo de la blocklist NetAdmin.
# Uso (en el VPS):  bash <(curl -sSL https://raw.githubusercontent.com/drab10688-dot/cloud-cache-gateway/main/public/diagnose-blocklist.sh)

set -e
PASS_FILE="/opt/netadmin/data/tunnel/panel-pass.txt"
BLOCKLIST_DIR="/opt/netadmin/data/adguard/conf/blocklists"

echo "═══════════════════════════════════════════════════════"
echo " 🔍 NetAdmin Blocklist — Diagnóstico"
echo "═══════════════════════════════════════════════════════"

# 1. Token
if [ ! -f "$PASS_FILE" ]; then
  echo "❌ No existe $PASS_FILE — no podemos autenticar contra la API"
  exit 1
fi
TOKEN=$(cat "$PASS_FILE")
echo "✅ Token cargado ($(echo -n "$TOKEN" | wc -c) chars)"

# 2. Containers
echo ""
echo "── Estado de contenedores ──"
docker ps --filter name=netadmin --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 3. Directorio físico
echo ""
echo "── Archivos físicos en $BLOCKLIST_DIR ──"
if [ ! -d "$BLOCKLIST_DIR" ]; then
  echo "❌ Directorio no existe en host — el contenedor escribe en otro lado o no escribe"
else
  ls -la "$BLOCKLIST_DIR" || true
  for f in netadmin_manual.txt netadmin_mintic.txt netadmin_coljuegos.txt netadmin_infantil.txt; do
    full="$BLOCKLIST_DIR/$f"
    if [ -f "$full" ]; then
      lines=$(grep -cE '^\|\|' "$full" || echo 0)
      echo "  ✓ $f → $lines reglas"
    else
      echo "  ✗ $f NO EXISTE"
    fi
  done
fi

# 4. Vista desde el contenedor netadmin-api
echo ""
echo "── Vista desde el contenedor netadmin-api (lo que ve la API al escribir) ──"
docker exec netadmin-api ls -la /data/adguard/conf/blocklists/ 2>&1 || echo "❌ El contenedor no puede leer ese path"

# 5. POST /api/blocklist/add (test real)
echo ""
echo "── Test 1: POST /api/blocklist/add con test-diagnose.example ──"
curl -sS -X POST http://localhost/api/blocklist/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain":"test-diagnose.example","category":"manual"}' | head -c 500
echo ""

# 6. GET /api/blocklist/full (¿aparece?)
echo ""
echo "── Test 2: GET /api/blocklist/full (debe contener test-diagnose.example) ──"
RESP=$(curl -sS http://localhost/api/blocklist/full -H "Authorization: Bearer $TOKEN")
echo "$RESP" | head -c 800
echo ""
echo ""
COUNT=$(echo "$RESP" | grep -o '"domain"' | wc -l)
echo "→ Total de objetos {domain,category} devueltos: $COUNT"
if echo "$RESP" | grep -q "test-diagnose.example"; then
  echo "✅ El dominio de prueba SÍ persistió"
else
  echo "❌ El dominio de prueba NO está en la respuesta — el endpoint add no escribió"
fi

# 7. Logs de la API (últimas 30 líneas)
echo ""
echo "── Últimas 30 líneas de docker logs netadmin-api ──"
docker logs --tail 30 netadmin-api 2>&1 | tail -30

echo ""
echo "═══════════════════════════════════════════════════════"
echo " Comparte la salida completa para diagnóstico."
echo "═══════════════════════════════════════════════════════"
