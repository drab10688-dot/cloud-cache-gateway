#!/bin/bash
# ============================================================
# NetAdmin - Script de Instalación para Ubuntu Server (VPS)
# Instala: AdGuard Home, Unbound, Cloudflare Tunnel, Nginx Cache CDN
# Compatible: Ubuntu 20.04 / 22.04 / 24.04
# ============================================================

set -e

# Colores
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${CYAN}[NetAdmin]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ============================================================
# Verificaciones
# ============================================================
if [ "$EUID" -ne 0 ]; then
  error "Ejecuta este script como root: sudo bash install.sh"
fi

log "Verificando sistema operativo..."
if ! grep -qi "ubuntu" /etc/os-release; then
  error "Este script es solo para Ubuntu Server"
fi

UBUNTU_VERSION=$(lsb_release -rs)
log "Ubuntu $UBUNTU_VERSION detectado"

# ============================================================
# Configuración interactiva
# ============================================================
echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}   NetAdmin - Instalador de Servicios de Red${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

read -p "Ingresa tu token de Cloudflare Tunnel (o presiona Enter para omitir): " CF_TUNNEL_TOKEN
read -p "Puerto para AdGuard Home Web UI [3000]: " ADGUARD_PORT
ADGUARD_PORT=${ADGUARD_PORT:-3000}
read -p "Puerto para el panel NetAdmin [8080]: " PANEL_PORT
PANEL_PORT=${PANEL_PORT:-8080}
read -p "¿Instalar Nginx Cache CDN? (s/n) [s]: " INSTALL_CACHE
INSTALL_CACHE=${INSTALL_CACHE:-s}

echo ""
log "Iniciando instalación..."
echo ""

# ============================================================
# 1. Actualizar sistema
# ============================================================
log "Actualizando sistema..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget gnupg lsb-release apt-transport-https \
  ca-certificates software-properties-common ufw jq
success "Sistema actualizado"

# ============================================================
# 2. Instalar Unbound (DNS Recursivo)
# ============================================================
log "Instalando Unbound..."
apt-get install -y -qq unbound dns-root-data

# Descargar root hints
wget -q -O /var/lib/unbound/root.hints https://www.internic.net/domain/named.root

cat > /etc/unbound/unbound.conf.d/netadmin.conf << 'UNBOUND_CONF'
server:
    interface: 127.0.0.1
    port: 5353
    do-ip6: no
    
    # Acceso
    access-control: 127.0.0.0/8 allow
    access-control: 10.0.0.0/8 allow
    access-control: 172.16.0.0/12 allow
    access-control: 192.168.0.0/16 allow
    
    # Rendimiento
    num-threads: 2
    msg-cache-slabs: 4
    rrset-cache-slabs: 4
    infra-cache-slabs: 4
    key-cache-slabs: 4
    msg-cache-size: 64m
    rrset-cache-size: 128m
    cache-min-ttl: 300
    cache-max-ttl: 86400
    prefetch: yes
    prefetch-key: yes
    serve-expired: yes
    serve-expired-ttl: 86400
    
    # Seguridad
    hide-identity: yes
    hide-version: yes
    harden-glue: yes
    harden-dnssec-stripped: yes
    harden-referral-path: yes
    qname-minimisation: yes
    use-caps-for-id: yes
    
    # Validación DNSSEC
    auto-trust-anchor-file: "/var/lib/unbound/root.key"
    
    # Root hints
    root-hints: /var/lib/unbound/root.hints
    
    # Logging
    verbosity: 1
    log-queries: no
    logfile: /var/log/unbound/unbound.log
UNBOUND_CONF

mkdir -p /var/log/unbound
chown unbound:unbound /var/log/unbound

# Desactivar systemd-resolved si interfiere
if systemctl is-active --quiet systemd-resolved; then
  warn "Desactivando systemd-resolved (conflicto con puerto 53)..."
  systemctl stop systemd-resolved
  systemctl disable systemd-resolved
  rm -f /etc/resolv.conf
  echo "nameserver 127.0.0.1" > /etc/resolv.conf
fi

systemctl restart unbound
systemctl enable unbound
success "Unbound instalado y configurado (puerto 5353)"

# ============================================================
# 3. Instalar AdGuard Home
# ============================================================
log "Instalando AdGuard Home..."

curl -s -S -L https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v

# Esperar a que AdGuard inicie
sleep 3

# Configurar AdGuard para usar Unbound como upstream
ADGUARD_CONFIG="/opt/AdGuardHome/AdGuardHome.yaml"

if [ -f "$ADGUARD_CONFIG" ]; then
  # Cambiar puerto web si es necesario
  sed -i "s/address: 0.0.0.0:3000/address: 0.0.0.0:${ADGUARD_PORT}/" "$ADGUARD_CONFIG"
  
  # Configurar upstream DNS a Unbound
  cat > /tmp/adguard_patch.py << 'PYTHON_PATCH'
import sys
try:
    import yaml
    config_path = sys.argv[1]
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    config['dns']['upstream_dns'] = ['127.0.0.1:5353']
    config['dns']['bootstrap_dns'] = ['1.1.1.1', '8.8.8.8']
    with open(config_path, 'w') as f:
        yaml.dump(config, f, default_flow_style=False)
    print("OK")
except Exception as e:
    print(f"SKIP: {e}")
PYTHON_PATCH
  
  python3 /tmp/adguard_patch.py "$ADGUARD_CONFIG" 2>/dev/null || {
    warn "Configuración manual requerida: establece upstream DNS a 127.0.0.1:5353 en AdGuard UI"
  }
  rm -f /tmp/adguard_patch.py
fi

systemctl restart AdGuardHome 2>/dev/null || /opt/AdGuardHome/AdGuardHome -s restart 2>/dev/null || true
success "AdGuard Home instalado (puerto web: ${ADGUARD_PORT}, DNS: puerto 53)"

# ============================================================
# 4. Agregar listas de bloqueo MinTIC Colombia
# ============================================================
log "Configurando listas de bloqueo colombianas..."

BLOCKLIST_DIR="/opt/AdGuardHome/blocklists"
mkdir -p "$BLOCKLIST_DIR"

cat > "$BLOCKLIST_DIR/mintic_colombia.txt" << 'MINTIC_LIST'
# Lista de bloqueo - MinTIC Colombia y Coljuegos
# Actualizar según resoluciones vigentes
# Formato: un dominio por línea

# === Coljuegos - Sitios de apuestas sin licencia ===
# Agrega aquí los dominios bloqueados por Coljuegos
# Consulta: https://www.coljuegos.gov.co/publicaciones/listado_de_sitios_web_bloqueados/

# === MinTIC - Contenido ilegal ===
# Agrega aquí los dominios ordenados por MinTIC

# === DNDA - Derechos de autor ===
# Agrega aquí los dominios bloqueados por la DNDA
MINTIC_LIST

success "Directorio de listas de bloqueo creado en $BLOCKLIST_DIR"
warn "Agrega los dominios específicos manualmente según las resoluciones vigentes"

# ============================================================
# 5. Instalar Nginx Cache CDN (opcional)
# ============================================================
if [[ "$INSTALL_CACHE" =~ ^[sS]$ ]]; then
  log "Instalando Nginx como Cache CDN..."
  apt-get install -y -qq nginx

  # Crear directorio de caché
  mkdir -p /var/cache/nginx/cdn
  chown www-data:www-data /var/cache/nginx/cdn

  cat > /etc/nginx/sites-available/cdn-cache << 'NGINX_CACHE'
proxy_cache_path /var/cache/nginx/cdn levels=1:2 keys_zone=cdn_cache:100m
                 max_size=50g inactive=30d use_temp_path=off;

server {
    listen 8888;
    server_name _;
    
    # Logging
    access_log /var/log/nginx/cdn-access.log;
    error_log /var/log/nginx/cdn-error.log;
    
    # Cache status header
    add_header X-Cache-Status $upstream_cache_status always;
    
    # Proxy cache para contenido general
    location / {
        proxy_cache cdn_cache;
        proxy_cache_valid 200 302 30d;
        proxy_cache_valid 404 1m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;
        proxy_cache_min_uses 1;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Buffer
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        
        # Tamaño máximo de archivo en caché (videos)
        proxy_max_temp_file_size 2048m;
        
        proxy_pass http://$host$request_uri;
    }
    
    # Endpoint de estadísticas de caché
    location /cache-status {
        stub_status on;
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 192.168.0.0/16;
        deny all;
    }
}
NGINX_CACHE

  ln -sf /etc/nginx/sites-available/cdn-cache /etc/nginx/sites-enabled/
  nginx -t && systemctl restart nginx
  systemctl enable nginx
  success "Nginx Cache CDN instalado (puerto 8888, caché: 50GB)"
else
  warn "Nginx Cache CDN omitido"
fi

# ============================================================
# 6. Instalar Cloudflare Tunnel
# ============================================================
log "Instalando cloudflared..."

# Detectar arquitectura
ARCH=$(dpkg --print-architecture)
case $ARCH in
  amd64) CF_ARCH="amd64" ;;
  arm64) CF_ARCH="arm64" ;;
  armhf) CF_ARCH="arm" ;;
  *) error "Arquitectura no soportada: $ARCH" ;;
esac

curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb" -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb
rm -f /tmp/cloudflared.deb

if [ -n "$CF_TUNNEL_TOKEN" ]; then
  log "Configurando Cloudflare Tunnel con token..."
  cloudflared service install "$CF_TUNNEL_TOKEN"
  success "Cloudflare Tunnel configurado como servicio"
else
  warn "Token no proporcionado. Configura manualmente:"
  echo -e "  ${CYAN}cloudflared tunnel login${NC}"
  echo -e "  ${CYAN}cloudflared tunnel create netadmin${NC}"
  echo -e "  ${CYAN}cloudflared tunnel route dns netadmin tu-dominio.com${NC}"
  echo ""
fi
success "cloudflared instalado"

# ============================================================
# 7. Script de monitoreo de ping
# ============================================================
log "Configurando monitor de ping..."

cat > /opt/netadmin-ping-monitor.sh << 'PING_SCRIPT'
#!/bin/bash
# Monitor de ping a Google DNS - Registra latencia y caídas
LOG_DIR="/var/log/netadmin"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/ping-$(date +%Y-%m-%d).log"

while true; do
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  RESULT=$(ping -c 1 -W 3 8.8.8.8 2>/dev/null)
  
  if [ $? -eq 0 ]; then
    LATENCY=$(echo "$RESULT" | grep 'time=' | sed 's/.*time=\([0-9.]*\).*/\1/')
    echo "$TIMESTAMP | OK | ${LATENCY}ms" >> "$LOG_FILE"
  else
    echo "$TIMESTAMP | FAIL | timeout" >> "$LOG_FILE"
  fi
  
  sleep 5
done
PING_SCRIPT

chmod +x /opt/netadmin-ping-monitor.sh

# Crear servicio systemd para el monitor
cat > /etc/systemd/system/netadmin-ping.service << 'PING_SERVICE'
[Unit]
Description=NetAdmin Ping Monitor
After=network.target

[Service]
Type=simple
ExecStart=/opt/netadmin-ping-monitor.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
PING_SERVICE

systemctl daemon-reload
systemctl enable netadmin-ping
systemctl start netadmin-ping
success "Monitor de ping activo (logs en /var/log/netadmin/)"

# ============================================================
# 8. Configurar Firewall
# ============================================================
log "Configurando firewall (UFW)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 53/tcp        # DNS
ufw allow 53/udp        # DNS
ufw allow ${ADGUARD_PORT}/tcp   # AdGuard Home Web UI
ufw allow ${PANEL_PORT}/tcp     # NetAdmin Panel
if [[ "$INSTALL_CACHE" =~ ^[sS]$ ]]; then
  ufw allow 8888/tcp    # Nginx Cache
fi
echo "y" | ufw enable
success "Firewall configurado"

# ============================================================
# 9. Script de estado rápido
# ============================================================
cat > /usr/local/bin/netadmin-status << 'STATUS_SCRIPT'
#!/bin/bash
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}   NetAdmin - Estado de Servicios${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""

check_service() {
  if systemctl is-active --quiet "$1" 2>/dev/null; then
    echo -e "  ${GREEN}●${NC} $2"
  else
    echo -e "  ${RED}●${NC} $2 (inactivo)"
  fi
}

check_service "unbound" "Unbound DNS"
check_service "AdGuardHome" "AdGuard Home"
check_service "nginx" "Nginx Cache CDN"
check_service "cloudflared" "Cloudflare Tunnel"
check_service "netadmin-ping" "Monitor de Ping"

echo ""
PING=$(ping -c 1 -W 2 8.8.8.8 2>/dev/null | grep 'time=' | sed 's/.*time=\([0-9.]*\).*/\1/')
if [ -n "$PING" ]; then
  echo -e "  Latencia Google DNS: ${GREEN}${PING}ms${NC}"
else
  echo -e "  Latencia Google DNS: ${RED}Sin conexión${NC}"
fi

if [ -d "/var/cache/nginx/cdn" ]; then
  CACHE_SIZE=$(du -sh /var/cache/nginx/cdn 2>/dev/null | cut -f1)
  echo -e "  Caché CDN: ${CYAN}${CACHE_SIZE}${NC}"
fi
echo ""
STATUS_SCRIPT

chmod +x /usr/local/bin/netadmin-status
success "Comando 'netadmin-status' disponible"

# ============================================================
# Resumen final
# ============================================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}   ¡Instalación completada exitosamente!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Servicios instalados:${NC}"
echo -e "    • Unbound DNS       → 127.0.0.1:5353 (recursivo)"
echo -e "    • AdGuard Home      → 0.0.0.0:${ADGUARD_PORT} (web UI)"
echo -e "    • AdGuard DNS       → 0.0.0.0:53"
if [[ "$INSTALL_CACHE" =~ ^[sS]$ ]]; then
echo -e "    • Nginx Cache CDN   → 0.0.0.0:8888"
fi
echo -e "    • Cloudflare Tunnel → cloudflared"
echo -e "    • Monitor de Ping   → /var/log/netadmin/"
echo ""
echo -e "  ${CYAN}Comandos útiles:${NC}"
echo -e "    ${YELLOW}netadmin-status${NC}          — Ver estado de servicios"
echo -e "    ${YELLOW}systemctl status unbound${NC} — Estado de Unbound"
echo -e "    ${YELLOW}tail -f /var/log/netadmin/ping-\$(date +%Y-%m-%d).log${NC} — Ver ping en vivo"
echo ""
if [ -z "$CF_TUNNEL_TOKEN" ]; then
echo -e "  ${YELLOW}⚠ Configura Cloudflare Tunnel manualmente:${NC}"
echo -e "    ${CYAN}cloudflared tunnel login${NC}"
echo -e "    ${CYAN}cloudflared tunnel create netadmin${NC}"
echo ""
fi
echo -e "  ${CYAN}Configura tu router/DHCP para usar este servidor como DNS:${NC}"
IP_ADDR=$(hostname -I | awk '{print $1}')
echo -e "    DNS Primario: ${GREEN}${IP_ADDR}${NC}"
echo ""
