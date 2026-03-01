#!/bin/bash
# ============================================================
# NetAdmin - Script de Instalación Completo para Ubuntu VPS
# Instala: AdGuard Home, Unbound, Cloudflare Tunnel,
#          Squid (SSL Bump), apt-cacher-ng, Lancache, Nginx
# Compatible: Ubuntu 20.04 / 22.04 / 24.04
# ============================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${CYAN}[NetAdmin]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

if [ "$EUID" -ne 0 ]; then
  error "Ejecuta como root: sudo bash install.sh"
fi

if ! grep -qi "ubuntu" /etc/os-release; then
  error "Solo para Ubuntu Server"
fi

UBUNTU_VERSION=$(lsb_release -rs)
IP_ADDR=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   NetAdmin - Instalador Completo de Red${NC}"
echo -e "${CYAN}   Ubuntu Server $UBUNTU_VERSION — $IP_ADDR${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Servicios a instalar:"
echo -e "    1. ${GREEN}Unbound${NC}         — DNS recursivo ultra rápido"
echo -e "    2. ${GREEN}AdGuard Home${NC}    — Bloqueo DNS (ads, infantil, MinTIC)"
echo -e "    3. ${GREEN}Squid${NC}           — Proxy caché con SSL Bump (YouTube)"
echo -e "    4. ${GREEN}apt-cacher-ng${NC}   — Caché de repos Linux"
echo -e "    5. ${GREEN}Lancache${NC}        — Caché Windows Updates, Steam, Epic"
echo -e "    6. ${GREEN}Nginx${NC}           — Caché CDN general"
echo -e "    7. ${GREEN}Cloudflare Tunnel${NC} — Acceso remoto sin IP pública"
echo -e "    8. ${GREEN}Monitor de Ping${NC}  — Detección de caídas"
echo ""

read -p "Token de Cloudflare Tunnel (Enter para configurar después): " CF_TUNNEL_TOKEN
read -p "Puerto AdGuard Web UI [3000]: " ADGUARD_PORT
ADGUARD_PORT=${ADGUARD_PORT:-3000}

echo ""
log "Iniciando instalación completa..."
echo ""

# ============================================================
# 1. ACTUALIZAR SISTEMA
# ============================================================
log "Actualizando sistema..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget gnupg lsb-release apt-transport-https \
  ca-certificates software-properties-common ufw jq openssl docker.io docker-compose
systemctl enable docker
systemctl start docker
success "Sistema actualizado + Docker instalado"

# ============================================================
# 2. UNBOUND — DNS RECURSIVO
# ============================================================
log "Instalando Unbound DNS..."
apt-get install -y -qq unbound dns-root-data
wget -q -O /var/lib/unbound/root.hints https://www.internic.net/domain/named.root

cat > /etc/unbound/unbound.conf.d/netadmin.conf << 'EOF'
server:
    interface: 127.0.0.1
    port: 5353
    do-ip6: no
    access-control: 127.0.0.0/8 allow
    access-control: 10.0.0.0/8 allow
    access-control: 192.168.0.0/16 allow

    # Rendimiento máximo
    num-threads: 4
    msg-cache-slabs: 8
    rrset-cache-slabs: 8
    infra-cache-slabs: 8
    key-cache-slabs: 8
    msg-cache-size: 128m
    rrset-cache-size: 256m
    cache-min-ttl: 3600
    cache-max-ttl: 86400
    prefetch: yes
    prefetch-key: yes
    serve-expired: yes
    serve-expired-ttl: 86400
    minimal-responses: yes
    
    # Seguridad
    hide-identity: yes
    hide-version: yes
    harden-glue: yes
    harden-dnssec-stripped: yes
    qname-minimisation: yes
    use-caps-for-id: yes
    auto-trust-anchor-file: "/var/lib/unbound/root.key"
    root-hints: /var/lib/unbound/root.hints
    
    # Logs
    verbosity: 1
    logfile: /var/log/unbound/unbound.log
EOF

mkdir -p /var/log/unbound && chown unbound:unbound /var/log/unbound

if systemctl is-active --quiet systemd-resolved; then
  systemctl stop systemd-resolved
  systemctl disable systemd-resolved
  rm -f /etc/resolv.conf
  echo "nameserver 127.0.0.1" > /etc/resolv.conf
fi

systemctl restart unbound && systemctl enable unbound
success "Unbound DNS → 127.0.0.1:5353"

# ============================================================
# 3. ADGUARD HOME — FILTRADO DNS
# ============================================================
log "Instalando AdGuard Home..."
curl -s -S -L https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v
sleep 3

mkdir -p /opt/AdGuardHome/blocklists

# Lista de bloqueo infantil y MinTIC
cat > /opt/AdGuardHome/blocklists/colombia_mintic.txt << 'BLOCKLIST'
# ========================================
# NetAdmin — Lista de Bloqueo Colombia
# MinTIC + Coljuegos + Protección Infantil
# ========================================

# === PROTECCIÓN INFANTIL ===
# Agrega dominios de contenido adulto aquí
# Se recomienda usar las listas de AdGuard:
# - AdGuard Family Protection
# - OISD (Full)

# === COLJUEGOS — Apuestas sin licencia ===
# Consulta: https://www.coljuegos.gov.co
# Agrega dominios según resoluciones vigentes

# === MinTIC — Contenido ilegal ===
# Agrega según resoluciones del MinTIC

# === DNDA — Derechos de autor ===
# Agrega según resoluciones de la DNDA
BLOCKLIST

# Configurar upstream a Unbound
ADGUARD_CONFIG="/opt/AdGuardHome/AdGuardHome.yaml"
if [ -f "$ADGUARD_CONFIG" ]; then
  sed -i "s/address: 0.0.0.0:3000/address: 0.0.0.0:${ADGUARD_PORT}/" "$ADGUARD_CONFIG"
fi

systemctl restart AdGuardHome 2>/dev/null || /opt/AdGuardHome/AdGuardHome -s restart 2>/dev/null || true
success "AdGuard Home → puerto ${ADGUARD_PORT} (DNS: 53)"
warn "Configura upstream DNS a 127.0.0.1:5353 en la UI de AdGuard"
warn "Activa las listas de Protección Familiar en AdGuard > Filtros > Listas de bloqueo"

# ============================================================
# 4. SQUID — PROXY CACHÉ CON SSL BUMP (YouTube)
# ============================================================
log "Instalando Squid con SSL Bump..."
apt-get install -y -qq squid-openssl

# Generar certificado CA para SSL Bump
mkdir -p /etc/squid/ssl_cert
cd /etc/squid/ssl_cert
openssl req -new -newkey rsa:2048 -sha256 -days 3650 -nodes -x509 \
  -keyout netadmin-ca.pem -out netadmin-ca.pem \
  -subj "/C=CO/ST=Colombia/L=Bogota/O=NetAdmin/CN=NetAdmin CA" 2>/dev/null

# Crear base de datos de certificados
/usr/lib/squid/security_file_certgen -c -s /var/spool/squid/ssl_db -M 64MB 2>/dev/null || true
chown -R proxy:proxy /var/spool/squid/ssl_db 2>/dev/null || true

# Crear directorio de caché
mkdir -p /var/cache/squid
chown proxy:proxy /var/cache/squid

cat > /etc/squid/squid.conf << 'SQUID_CONF'
# ============================================
# NetAdmin — Squid Proxy Cache + SSL Bump
# ============================================

# Puerto proxy transparente
http_port 3128
http_port 3129 intercept
https_port 3130 intercept ssl-bump \
  cert=/etc/squid/ssl_cert/netadmin-ca.pem \
  generate-host-certificates=on \
  dynamic_cert_mem_cache_size=16MB

# SSL Bump — Intercepción selectiva
acl step1 at_step SslBump1
acl youtube_domains ssl::server_name .youtube.com .googlevideo.com .ytimg.com
acl windows_update ssl::server_name .windowsupdate.com .microsoft.com .download.microsoft.com
acl cacheable_ssl ssl::server_name .youtube.com .googlevideo.com .ytimg.com .windowsupdate.com .microsoft.com

ssl_bump peek step1
ssl_bump bump cacheable_ssl
ssl_bump splice all

sslcrtd_program /usr/lib/squid/security_file_certgen -s /var/spool/squid/ssl_db -M 64MB

# Caché agresivo
cache_dir ufs /var/cache/squid 50000 16 256
maximum_object_size 4 GB
cache_mem 512 MB
maximum_object_size_in_memory 128 MB

# Reglas de caché para YouTube
refresh_pattern -i \.googlevideo\.com\/videoplayback 43200 90% 86400 override-expire override-lastmod reload-into-ims ignore-reload ignore-no-store ignore-private
refresh_pattern -i ytimg\.com 43200 90% 86400 override-expire
refresh_pattern -i \.youtube\.com 1440 40% 10080

# Reglas de caché para Windows Update
refresh_pattern -i windowsupdate\.com/.*\.(cab|exe|ms[i|u|f|p]|[ap]sf|wm[v|a]|dat|zip|msu) 43200 80% 129600 reload-into-ims
refresh_pattern -i microsoft\.com/.*\.(cab|exe|ms[i|u|f|p]|[ap]sf|wm[v|a]|dat|zip|msu) 43200 80% 129600 reload-into-ims
refresh_pattern -i download\.microsoft\.com 43200 80% 129600

# Reglas generales
refresh_pattern ^ftp:    1440 20% 10080
refresh_pattern -i (/cgi-bin/|\?) 0 0% 0
refresh_pattern .        0 20% 4320

# ACLs
acl localnet src 10.0.0.0/8
acl localnet src 172.16.0.0/12
acl localnet src 192.168.0.0/16
acl SSL_ports port 443
acl Safe_ports port 80 443 21 70 210 280 488 591 777 1025-65535

http_access allow localnet
http_access allow localhost
http_access deny all

# Logs
access_log /var/log/squid/access.log squid
cache_log /var/log/squid/cache.log
cache_store_log /var/log/squid/store.log

# Visible hostname
visible_hostname netadmin-proxy
SQUID_CONF

squid -z 2>/dev/null || true
systemctl restart squid && systemctl enable squid
success "Squid Proxy → puerto 3128 (SSL Bump para YouTube + Windows)"
warn "Instala el certificado CA en los dispositivos: /etc/squid/ssl_cert/netadmin-ca.pem"

# ============================================================
# 5. APT-CACHER-NG — CACHÉ DE REPOS LINUX
# ============================================================
log "Instalando apt-cacher-ng..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq apt-cacher-ng

cat >> /etc/apt-cacher-ng/acng.conf << 'APT_CONF'
# NetAdmin config
CacheDir: /var/cache/apt-cacher-ng
LogDir: /var/log/apt-cacher-ng
Port: 3142
ExTreshold: 4
PassThroughPattern: .*
EOF
APT_CONF

systemctl restart apt-cacher-ng && systemctl enable apt-cacher-ng

# Configurar este servidor para usar su propio caché
echo 'Acquire::http::Proxy "http://127.0.0.1:3142";' > /etc/apt/apt.conf.d/01proxy

success "apt-cacher-ng → puerto 3142"

# ============================================================
# 6. LANCACHE — CACHÉ WINDOWS UPDATE, STEAM, EPIC
# ============================================================
log "Instalando Lancache (Docker)..."

mkdir -p /opt/lancache
cat > /opt/lancache/docker-compose.yml << LANCACHE_COMPOSE
version: '3'
services:
  lancache-dns:
    image: lancachenet/lancache-dns:latest
    container_name: lancache-dns
    environment:
      - USE_GENERIC_CACHE=true
      - LANCACHE_IP=$IP_ADDR
      - UPSTREAM_DNS=127.0.0.1
    ports:
      - "5354:53/udp"
      - "5354:53/tcp"
    restart: unless-stopped

  lancache:
    image: lancachenet/monolithic:latest
    container_name: lancache
    environment:
      - CACHE_MEM_SIZE=2g
      - CACHE_DISK_SIZE=100g
      - CACHE_MAX_AGE=30d
    volumes:
      - /var/cache/lancache/data:/data/cache
      - /var/cache/lancache/logs:/data/logs
    ports:
      - "8880:80"
    restart: unless-stopped
LANCACHE_COMPOSE

mkdir -p /var/cache/lancache/{data,logs}
cd /opt/lancache
docker-compose up -d
success "Lancache → puerto 8880 (Windows Update, Steam, Epic, Origin, Battle.net)"

# ============================================================
# 7. NGINX — CACHÉ CDN GENERAL
# ============================================================
log "Instalando Nginx Cache CDN..."
apt-get install -y -qq nginx

mkdir -p /var/cache/nginx/cdn
chown www-data:www-data /var/cache/nginx/cdn

cat > /etc/nginx/sites-available/cdn-cache << 'NGINX_CONF'
proxy_cache_path /var/cache/nginx/cdn levels=1:2 keys_zone=cdn_cache:200m
                 max_size=50g inactive=30d use_temp_path=off;

server {
    listen 8888;
    server_name _;
    
    add_header X-Cache-Status $upstream_cache_status always;
    
    location / {
        proxy_cache cdn_cache;
        proxy_cache_valid 200 302 30d;
        proxy_cache_valid 404 1m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_max_temp_file_size 4096m;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_pass http://$host$request_uri;
    }
    
    location /cache-status {
        stub_status on;
        allow 127.0.0.1;
        allow 192.168.0.0/16;
        deny all;
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/cdn-cache /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx
success "Nginx Cache CDN → puerto 8888 (50GB)"

# ============================================================
# 8. CLOUDFLARE TUNNEL
# ============================================================
log "Instalando cloudflared..."
ARCH=$(dpkg --print-architecture)
curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb && rm -f /tmp/cloudflared.deb

# Script para activar/desactivar el túnel
cat > /usr/local/bin/netadmin-tunnel << 'TUNNEL_SCRIPT'
#!/bin/bash
case "$1" in
  start)
    echo "Iniciando túnel Cloudflare..."
    if [ -n "$2" ]; then
      cloudflared service install "$2"
      systemctl start cloudflared
    else
      # Túnel rápido sin cuenta (genera URL temporal)
      cloudflared tunnel --url http://localhost:3000 &
      echo $! > /tmp/cloudflared.pid
      sleep 3
      echo "Túnel activo. Revisa la URL en los logs: journalctl -u cloudflared -f"
    fi
    ;;
  stop)
    echo "Deteniendo túnel..."
    if [ -f /tmp/cloudflared.pid ]; then
      kill $(cat /tmp/cloudflared.pid) 2>/dev/null
      rm /tmp/cloudflared.pid
    fi
    systemctl stop cloudflared 2>/dev/null
    ;;
  status)
    if systemctl is-active --quiet cloudflared 2>/dev/null || [ -f /tmp/cloudflared.pid ]; then
      echo "ACTIVE"
    else
      echo "INACTIVE"
    fi
    ;;
  url)
    journalctl -u cloudflared --no-pager -n 50 2>/dev/null | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
    ;;
  *)
    echo "Uso: netadmin-tunnel {start [token]|stop|status|url}"
    ;;
esac
TUNNEL_SCRIPT
chmod +x /usr/local/bin/netadmin-tunnel

if [ -n "$CF_TUNNEL_TOKEN" ]; then
  cloudflared service install "$CF_TUNNEL_TOKEN"
  success "Cloudflare Tunnel configurado con token"
else
  warn "Usa 'netadmin-tunnel start' para crear un túnel rápido"
fi
success "cloudflared instalado"

# ============================================================
# 9. MONITOR DE PING
# ============================================================
log "Configurando monitor de ping..."
cat > /opt/netadmin-ping-monitor.sh << 'PING_SCRIPT'
#!/bin/bash
LOG_DIR="/var/log/netadmin"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/ping-$(date +%Y-%m-%d).log"
DOWNTIME_LOG="$LOG_DIR/downtime.log"
WAS_DOWN=false

while true; do
  TS=$(date '+%Y-%m-%d %H:%M:%S')
  RESULT=$(ping -c 1 -W 3 8.8.8.8 2>/dev/null)
  if [ $? -eq 0 ]; then
    LAT=$(echo "$RESULT" | grep 'time=' | sed 's/.*time=\([0-9.]*\).*/\1/')
    echo "$TS | OK | ${LAT}ms" >> "$LOG_FILE"
    if [ "$WAS_DOWN" = true ]; then
      echo "$TS | RECOVERED" >> "$DOWNTIME_LOG"
      WAS_DOWN=false
    fi
  else
    echo "$TS | FAIL | timeout" >> "$LOG_FILE"
    if [ "$WAS_DOWN" = false ]; then
      echo "$TS | DOWN" >> "$DOWNTIME_LOG"
      WAS_DOWN=true
    fi
  fi
  sleep 5
done
PING_SCRIPT
chmod +x /opt/netadmin-ping-monitor.sh

cat > /etc/systemd/system/netadmin-ping.service << 'PING_SVC'
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
PING_SVC

systemctl daemon-reload && systemctl enable netadmin-ping && systemctl start netadmin-ping
success "Monitor de ping activo"

# ============================================================
# 10. NETADMIN-STATUS COMMAND
# ============================================================
cat > /usr/local/bin/netadmin-status << 'STATUS'
#!/bin/bash
G='\033[0;32m'; R='\033[0;31m'; C='\033[0;36m'; Y='\033[1;33m'; N='\033[0m'

echo -e "${C}═════════════════════════════════════════${N}"
echo -e "${C}   NetAdmin — Estado de Servicios${N}"
echo -e "${C}═════════════════════════════════════════${N}"
echo ""

cs() {
  if systemctl is-active --quiet "$1" 2>/dev/null; then
    echo -e "  ${G}●${N} $2"
  else
    echo -e "  ${R}●${N} $2 ${R}(inactivo)${N}"
  fi
}

cs "unbound" "Unbound DNS (recursivo)"
cs "AdGuardHome" "AdGuard Home (filtrado)"
cs "squid" "Squid Proxy (SSL Bump + YouTube)"
cs "apt-cacher-ng" "apt-cacher-ng (repos Linux)"
cs "nginx" "Nginx Cache CDN"
cs "netadmin-ping" "Monitor de Ping"

# Docker containers
echo ""
for c in lancache lancache-dns; do
  if docker ps --format '{{.Names}}' | grep -q "^${c}$" 2>/dev/null; then
    echo -e "  ${G}●${N} $c (Docker)"
  else
    echo -e "  ${R}●${N} $c (Docker) ${R}(detenido)${N}"
  fi
done

# Cloudflare
echo ""
TUNNEL_STATUS=$(netadmin-tunnel status 2>/dev/null)
if [ "$TUNNEL_STATUS" = "ACTIVE" ]; then
  URL=$(netadmin-tunnel url 2>/dev/null)
  echo -e "  ${G}●${N} Cloudflare Tunnel"
  [ -n "$URL" ] && echo -e "    URL: ${C}${URL}${N}"
else
  echo -e "  ${R}●${N} Cloudflare Tunnel ${Y}(usa: netadmin-tunnel start)${N}"
fi

echo ""
P=$(ping -c 1 -W 2 8.8.8.8 2>/dev/null | grep 'time=' | sed 's/.*time=\([0-9.]*\).*/\1/')
[ -n "$P" ] && echo -e "  Latencia: ${G}${P}ms${N}" || echo -e "  Latencia: ${R}Sin conexión${N}"

for d in /var/cache/squid /var/cache/nginx/cdn /var/cache/lancache/data /var/cache/apt-cacher-ng; do
  [ -d "$d" ] && echo -e "  $(basename $(dirname $d))/$(basename $d): ${C}$(du -sh $d 2>/dev/null | cut -f1)${N}"
done
echo ""
STATUS
chmod +x /usr/local/bin/netadmin-status

# ============================================================
# 11. FIREWALL
# ============================================================
log "Configurando firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 53/tcp
ufw allow 53/udp
ufw allow ${ADGUARD_PORT}/tcp
ufw allow 3128/tcp   # Squid
ufw allow 3142/tcp   # apt-cacher-ng
ufw allow 8880/tcp   # Lancache
ufw allow 8888/tcp   # Nginx CDN
echo "y" | ufw enable
success "Firewall configurado"

# ============================================================
# RESUMEN FINAL
# ============================================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   ¡INSTALACIÓN COMPLETADA!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Servicios DNS:${NC}"
echo -e "    Unbound          → 127.0.0.1:5353 (recursivo, DNSSEC)"
echo -e "    AdGuard Home     → 0.0.0.0:53 (filtrado) + Web :${ADGUARD_PORT}"
echo ""
echo -e "  ${CYAN}Servicios de Caché:${NC}"
echo -e "    Squid SSL Bump   → 0.0.0.0:3128 (YouTube, Windows)"
echo -e "    apt-cacher-ng    → 0.0.0.0:3142 (repos Ubuntu/Debian)"
echo -e "    Lancache         → 0.0.0.0:8880 (Steam, Epic, Windows Update)"
echo -e "    Nginx CDN        → 0.0.0.0:8888 (contenido general)"
echo ""
echo -e "  ${CYAN}Acceso Remoto:${NC}"
echo -e "    cloudflared      → netadmin-tunnel start"
echo ""
echo -e "  ${CYAN}Comandos:${NC}"
echo -e "    ${YELLOW}netadmin-status${NC}          — Estado de todo"
echo -e "    ${YELLOW}netadmin-tunnel start${NC}    — Activar túnel (genera URL)"
echo -e "    ${YELLOW}netadmin-tunnel stop${NC}     — Desactivar túnel"
echo -e "    ${YELLOW}netadmin-tunnel url${NC}      — Ver URL del túnel"
echo ""
echo -e "  ${CYAN}Configura tus dispositivos:${NC}"
echo -e "    DNS Primario: ${GREEN}${IP_ADDR}${NC}"
echo -e "    Proxy HTTP:   ${GREEN}${IP_ADDR}:3128${NC}"
echo -e "    Repos Linux:  ${GREEN}http://${IP_ADDR}:3142${NC}"
echo ""
echo -e "  ${YELLOW}⚠ IMPORTANTE:${NC}"
echo -e "    Para cachear YouTube con SSL Bump, instala el certificado CA"
echo -e "    en cada dispositivo: ${CYAN}/etc/squid/ssl_cert/netadmin-ca.pem${NC}"
echo ""
