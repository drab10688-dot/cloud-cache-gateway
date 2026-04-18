#!/bin/bash
# ============================================================
# NetAdmin — Fix listas internas (Manual / MinTIC / Coljuegos / Infantil)
# ============================================================
# Soluciona el problema de "las 4 listas no pasan a AdGuard al pulsar
# 'Publicar listas NetAdmin'". Aplica 3 correcciones:
#   1. Crea los 4 archivos .txt si no existen (con header válido)
#   2. Ajusta permisos para que netadmin-nginx (read-only) los pueda servir
#   3. Fuerza re-registro de los 4 filtros en AdGuard via API
#
# Uso (en el VPS, como root):
#   curl -fsSL https://<tu-dominio>/fix-netadmin-blocklists.sh | bash
# o:
#   sudo bash fix-netadmin-blocklists.sh
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()     { echo -e "${CYAN}[fix]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[ "$EUID" -ne 0 ] && error "Ejecuta como root: sudo bash fix-netadmin-blocklists.sh"
[ -d /opt/netadmin ] || error "No existe /opt/netadmin — ¿NetAdmin instalado?"

NETADMIN_DIR="/opt/netadmin"
BLOCKLIST_DIR="${NETADMIN_DIR}/data/adguard/conf/blocklists"
CATEGORIES=(manual mintic coljuegos infantil)

declare -A NAMES=(
  [manual]="NetAdmin · Lista Manual"
  [mintic]="NetAdmin · MinTIC Colombia"
  [coljuegos]="NetAdmin · Coljuegos Colombia"
  [infantil]="NetAdmin · Protección Infantil"
)

# ── 1. Crear archivos vacíos válidos si no existen ──
log "Asegurando los 4 archivos de blocklist..."
mkdir -p "$BLOCKLIST_DIR"
for cat in "${CATEGORIES[@]}"; do
  FILE="${BLOCKLIST_DIR}/netadmin_${cat}.txt"
  if [ ! -f "$FILE" ] || [ ! -s "$FILE" ]; then
    cat > "$FILE" <<EOF
! Title: ${NAMES[$cat]}
! Description: NetAdmin blocklist (${cat}) — gestionado desde el panel
! Total: 0
! Updated: $(date -Iseconds)
EOF
    success "Creado: netadmin_${cat}.txt"
  else
    success "Existe: netadmin_${cat}.txt ($(wc -l < "$FILE") líneas)"
  fi
done

# ── 2. Permisos legibles para nginx (mount :ro) ──
log "Ajustando permisos..."
chmod 755 "$BLOCKLIST_DIR"
chmod 644 "$BLOCKLIST_DIR"/netadmin_*.txt
success "Permisos: dir 755, archivos 644"

# ── 3. Verificar que nginx ve los archivos ──
log "Verificando que netadmin-nginx puede servir las URLs..."
for cat in "${CATEGORIES[@]}"; do
  if docker exec netadmin-nginx test -f "/var/blocklists/netadmin_${cat}.txt" 2>/dev/null; then
    SIZE=$(docker exec netadmin-nginx wc -c < "/var/blocklists/netadmin_${cat}.txt" 2>/dev/null || echo "0")
    success "nginx ve netadmin_${cat}.txt (${SIZE} bytes)"
  else
    warn "nginx NO ve netadmin_${cat}.txt — revisa el volumen del compose"
  fi
done

# ── 4. Probar HTTP interno desde la red docker ──
log "Probando HTTP interno (lo que AdGuard usa)..."
for cat in "${CATEGORIES[@]}"; do
  CODE=$(docker exec netadmin-api wget -qO- --server-response "http://netadmin-nginx/blocklists/netadmin_${cat}.txt" 2>&1 | grep "HTTP/" | tail -1 | awk '{print $2}' || echo "ERR")
  if [ "$CODE" = "200" ]; then
    success "HTTP 200 → http://netadmin-nginx/blocklists/netadmin_${cat}.txt"
  else
    warn "HTTP $CODE → http://netadmin-nginx/blocklists/netadmin_${cat}.txt"
  fi
done

# ── 5. Forzar reparación vía API (re-registra filtros y refresca AdGuard) ──
log "Llamando a /api/blocklist/repair..."
TOKEN=$(cat /opt/netadmin/data/tunnel/panel-pass.txt 2>/dev/null || echo "")
if [ -z "$TOKEN" ]; then
  warn "No se encontró panel-pass.txt — saltando repair (hazlo desde el panel)"
else
  RESP=$(curl -fsS -X POST "http://localhost/api/blocklist/repair" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" 2>&1 || echo "FAIL")
  if echo "$RESP" | grep -q "success"; then
    success "Repair OK — los 4 filtros NetAdmin están registrados en AdGuard"
  else
    warn "Repair respondió: $RESP"
  fi
fi

# ── 6. Mostrar URLs públicas ──
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  URLs públicas (visibles en el panel AdGuard):${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
HOST=$(hostname -I | awk '{print $1}')
for cat in "${CATEGORIES[@]}"; do
  echo "  • http://${HOST}/blocklists/netadmin_${cat}.txt"
done
echo ""
success "Listo. Recarga AdGuard → Filtros: deben aparecer las 4 listas activas."
echo ""
echo "Si los contadores siguen en 0:"
echo "  1. Sube dominios a una categoría desde el panel NetAdmin"
echo "  2. Espera 5 segundos y pulsa 'Refrescar todas' en Listas Remotas"
echo "  3. AdGuard mostrará el nuevo conteo de reglas"
