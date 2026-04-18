#!/bin/bash
# ============================================================
# NetAdmin v4.0 — Instalación 100% Docker
# Ubuntu Server VPS — Un solo docker-compose.yml
# ============================================================
# Servicios (todos en contenedores):
#   - Unbound DNS (recursivo, DNSSEC, caché agresivo)
#   - AdGuard Home (filtrado DNS, bloqueo infantil, MinTIC)
#   - Squid (proxy caché SSL Bump para YouTube/HTTPS)
#   - apt-cacher-ng (caché repos Linux)
#   - Lancache (Windows Update, Steam, Epic)
#   - Uptime Kuma (monitoreo de servicios)
#   - Cloudflare Tunnel (acceso sin IP pública)
#   - Monitor de Ping (detección de caídas)
#   - API Backend (Node.js — conecta panel con servicios)
#   - Nginx (panel web + reverse proxy)
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${CYAN}[NetAdmin]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[ "$EUID" -ne 0 ] && error "Ejecuta como root: sudo bash install.sh"

# ── Arreglar cwd roto (sucede tras una reinstalación previa que borró el dir actual)
# Sin esto, comandos como `git clone` dentro de /tmp fallan con "getcwd() failed"
if ! pwd >/dev/null 2>&1; then
  cd /root 2>/dev/null || cd / 2>/dev/null || true
  warn "Directorio de trabajo previo inválido — reposicionado a $(pwd)"
fi
cd /root 2>/dev/null || cd / 2>/dev/null || true

# ── Mostrar versiones compatibles ──
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Versiones de Ubuntu compatibles:                    ║${NC}"
echo -e "${CYAN}║  ✓ Ubuntu 24.04 LTS (Noble)   — Recomendada         ║${NC}"
echo -e "${CYAN}║  ✓ Ubuntu 22.04 LTS (Jammy)   — Compatible          ║${NC}"
echo -e "${CYAN}║  ✓ Ubuntu 20.04 LTS (Focal)   — Compatible (básico) ║${NC}"
echo -e "${CYAN}║  ✗ Ubuntu 18.04 o inferior    — No soportado         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Detectar si ya está instalado ──
if [ -d "/opt/netadmin" ] && [ -f "/opt/netadmin/docker-compose.yml" ]; then
  RUNNING=$(docker compose -f /opt/netadmin/docker-compose.yml ps --status running -q 2>/dev/null | wc -l)
  echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  NetAdmin ya está instalado — ${RUNNING} contenedores activos${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
  echo ""
  echo "  ¿Qué deseas hacer?"
  echo ""
  echo "    1) Reinstalar (elimina todo y vuelve a instalar)"
  echo "    2) Desinstalar completamente"
  echo "    3) Cancelar"
  echo ""
  read -p "  Opción [3]: " OPTION
  OPTION=${OPTION:-3}

  if [ "$OPTION" = "2" ]; then
    echo ""
    warn "Se eliminarán TODOS los contenedores, datos y configuraciones."
    read -p "  ¿Confirmar desinstalación? (s/n) [n]: " CONFIRM
    if [ "${CONFIRM,,}" != "s" ]; then
      echo "Cancelado."
      exit 0
    fi

    log "Deteniendo y eliminando contenedores..."
    cd /opt/netadmin 2>/dev/null && docker compose down --rmi all --volumes --remove-orphans 2>/dev/null || true

    log "Eliminando directorio /opt/netadmin..."
    rm -rf /opt/netadmin

    log "Eliminando comandos netadmin..."
    rm -f /usr/local/bin/netadmin /usr/local/bin/netadmin-tunnel

    log "Restaurando systemd-resolved..."
    systemctl enable systemd-resolved 2>/dev/null || true
    systemctl start systemd-resolved 2>/dev/null || true

    read -p "  ¿Desinstalar Docker también? (s/n) [n]: " REMOVE_DOCKER
    if [ "${REMOVE_DOCKER,,}" = "s" ]; then
      log "Desinstalando Docker..."
      apt-get purge -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin docker-ce-rootless-extras docker-model-plugin 2>/dev/null || true
      apt-get autoremove -y 2>/dev/null || true
      rm -rf /var/lib/docker /var/lib/containerd
      success "Docker desinstalado"
    fi

    success "NetAdmin desinstalado completamente"
    echo ""
    exit 0

  elif [ "$OPTION" = "1" ]; then
    log "Reinstalando NetAdmin..."
    cd /opt/netadmin && docker compose down --remove-orphans 2>/dev/null || true
    # Force remove any orphan containers with netadmin- prefix
    docker ps -a --filter "name=netadmin-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker compose -f /opt/netadmin/docker-compose.yml down --rmi all --volumes 2>/dev/null || true
    rm -rf /opt/netadmin
  else
    echo "Cancelado."
    exit 0
  fi
fi

# ── Modo desinstalar por flag ──
if [ "${1:-}" = "--uninstall" ] || [ "${1:-}" = "uninstall" ]; then
  if [ ! -d "/opt/netadmin" ]; then
    warn "NetAdmin no está instalado en este servidor."
    exit 0
  fi
  echo ""
  echo -e "${RED}══════════════════════════════════════════════════════${NC}"
  echo -e "${RED}   NetAdmin — DESINSTALACIÓN COMPLETA${NC}"
  echo -e "${RED}══════════════════════════════════════════════════════${NC}"
  echo ""
  read -p "¿Estás seguro? Se eliminarán TODOS los contenedores, datos y configuraciones. (s/n) [n]: " CONFIRM
  if [ "${CONFIRM,,}" != "s" ]; then
    echo "Cancelado."
    exit 0
  fi

  log "Deteniendo y eliminando contenedores..."
  cd /opt/netadmin 2>/dev/null && docker compose down --rmi all --volumes --remove-orphans 2>/dev/null || true

  log "Eliminando directorio /opt/netadmin..."
  rm -rf /opt/netadmin

  log "Eliminando comandos netadmin..."
  rm -f /usr/local/bin/netadmin /usr/local/bin/netadmin-tunnel

  log "Restaurando systemd-resolved..."
  systemctl enable systemd-resolved 2>/dev/null || true
  systemctl start systemd-resolved 2>/dev/null || true

  read -p "¿Desinstalar Docker también? (s/n) [n]: " REMOVE_DOCKER
  if [ "${REMOVE_DOCKER,,}" = "s" ]; then
    log "Desinstalando Docker..."
    apt-get purge -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin docker-ce-rootless-extras docker-model-plugin 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    rm -rf /var/lib/docker /var/lib/containerd
    success "Docker desinstalado"
  fi

  success "NetAdmin desinstalado completamente"
  echo ""
  exit 0
fi
# ── Verificar compatibilidad del sistema ──
if ! grep -qi "ubuntu" /etc/os-release; then
  error "Este script solo es compatible con Ubuntu Server. Sistema detectado: $(. /etc/os-release && echo $PRETTY_NAME)"
fi

UBUNTU_VER=$(lsb_release -rs 2>/dev/null || grep VERSION_ID /etc/os-release | tr -d '"' | cut -d= -f2)
UBUNTU_MAJOR=$(echo "$UBUNTU_VER" | cut -d. -f1)

if [ "$UBUNTU_MAJOR" -lt 20 ]; then
  error "Ubuntu $UBUNTU_VER no es compatible. Se requiere Ubuntu 20.04 o superior."
elif [ "$UBUNTU_MAJOR" -lt 22 ]; then
  warn "Ubuntu $UBUNTU_VER: compatible pero se recomienda 22.04 o 24.04 para mejor rendimiento."
  read -p "  ¿Continuar de todos modos? (s/n) [s]: " CONT_VER
  [ "${CONT_VER,,}" = "n" ] && exit 0
else
  success "Ubuntu $UBUNTU_VER detectado — Compatible ✓"
fi

# Verificar arquitectura
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "aarch64" ]; then
  error "Arquitectura $ARCH no soportada. Se requiere x86_64 o aarch64."
fi

# Verificar recursos mínimos
MEM_TOTAL_MB=$(grep MemTotal /proc/meminfo | awk '{print int($2/1024)}')
CPU_CORES=$(nproc)
if [ "$MEM_TOTAL_MB" -lt 1800 ]; then
  warn "RAM insuficiente: ${MEM_TOTAL_MB}MB detectados. Mínimo recomendado: 2GB."
  read -p "  ¿Continuar de todos modos? (s/n) [n]: " CONT_MEM
  [ "${CONT_MEM,,}" != "s" ] && error "Instalación cancelada. Se necesitan al menos 2GB de RAM."
fi
if [ "$CPU_CORES" -lt 2 ]; then
  warn "CPU: $CPU_CORES núcleo(s). Se recomiendan mínimo 2 vCPU."
fi



IP_ADDR=$(hostname -I | awk '{print $1}')
UBUNTU_VERSION=$(lsb_release -rs)
NETADMIN_DIR="/opt/netadmin"

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   NetAdmin v4.0 — Instalación 100% Docker${NC}"
echo -e "${CYAN}   Ubuntu $UBUNTU_VERSION — $IP_ADDR${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""

# Disco disponible
DISK_AVAIL=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
echo -e "  ${CYAN}Disco disponible: ${GREEN}${DISK_AVAIL} GB${NC}"
echo ""

# ── Configuración interactiva ──
read -p "Contraseña para el panel web [admin123]: " PANEL_PASS
PANEL_PASS=${PANEL_PASS:-admin123}
read -p "Puerto del panel web [80]: " PANEL_PORT
PANEL_PORT=${PANEL_PORT:-80}
read -p "Token de Cloudflare Tunnel (Enter para omitir): " CF_TUNNEL_TOKEN

echo ""
echo -e "${CYAN}  ── Configuración de caché (disco) ──${NC}"
echo -e "  Disco disponible: ${GREEN}${DISK_AVAIL} GB${NC}"
echo ""
read -p "  Caché Squid (YouTube/HTTPS) en GB [50]: " SQUID_CACHE_GB
SQUID_CACHE_GB=${SQUID_CACHE_GB:-50}
read -p "  Caché Lancache (Steam/Windows) en GB [100]: " LANCACHE_CACHE_GB
LANCACHE_CACHE_GB=${LANCACHE_CACHE_GB:-100}
read -p "  Caché Nginx CDN (general) en GB [50]: " NGINX_CACHE_GB
NGINX_CACHE_GB=${NGINX_CACHE_GB:-50}
read -p "  Caché RAM Squid en MB [512]: " SQUID_CACHE_MEM
SQUID_CACHE_MEM=${SQUID_CACHE_MEM:-512}
read -p "  Caché RAM Lancache en MB [512]: " LANCACHE_CACHE_MEM
LANCACHE_CACHE_MEM=${LANCACHE_CACHE_MEM:-512}

TOTAL_CACHE=$((SQUID_CACHE_GB + LANCACHE_CACHE_GB + NGINX_CACHE_GB + 5))
echo ""
if [ "$TOTAL_CACHE" -gt "$DISK_AVAIL" ]; then
  warn "¡La caché total (${TOTAL_CACHE}GB) supera el disco disponible (${DISK_AVAIL}GB)!"
  read -p "  ¿Continuar de todos modos? (s/n) [n]: " CONT
  [ "${CONT,,}" != "s" ] && error "Instalación cancelada. Ajusta los tamaños de caché."
fi

echo ""
log "Iniciando instalación Docker..."
echo ""

# ============================================================
# 1. INSTALAR DOCKER + DOCKER COMPOSE
# ============================================================
log "Instalando Docker..."
apt-get update -qq
apt-get install -y -qq curl wget jq openssl ca-certificates gnupg lsb-release apache2-utils

if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker && systemctl start docker

# ── FIX RED: kernel/sysctl para que Docker bridge funcione ──
# Previene "Connection reset" / paquetes dropeados al bridge Docker
log "Configurando kernel para Docker bridge networking..."
modprobe br_netfilter 2>/dev/null || true
modprobe nf_conntrack 2>/dev/null || true
cat > /etc/sysctl.d/99-netadmin-docker.conf <<'SYSCTL_EOF'
net.ipv4.ip_forward=1
net.bridge.bridge-nf-call-iptables=1
net.bridge.bridge-nf-call-ip6tables=1
SYSCTL_EOF
sysctl -p /etc/sysctl.d/99-netadmin-docker.conf >/dev/null 2>&1 || true

# ── FIX UFW: permitir FORWARD para el bridge Docker ──
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  log "Ajustando UFW para Docker bridge..."
  sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
  if ! grep -q "netadmin-docker-forward" /etc/ufw/before.rules 2>/dev/null; then
    sed -i '/^# End required lines/a\\n# netadmin-docker-forward\n-A ufw-before-forward -i br-+ -j ACCEPT\n-A ufw-before-forward -o br-+ -j ACCEPT\n-A ufw-before-forward -i docker0 -j ACCEPT\n-A ufw-before-forward -o docker0 -j ACCEPT' /etc/ufw/before.rules
  fi
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw reload >/dev/null 2>&1 || true
fi
success "Kernel y firewall configurados para Docker"

# ── Liberar puerto 53 (systemd-resolved) ──
if systemctl is-active --quiet systemd-resolved; then
  log "Desactivando systemd-resolved (puerto 53 en uso)..."
  systemctl stop systemd-resolved
  systemctl disable systemd-resolved
  rm -f /etc/resolv.conf
  echo "nameserver 8.8.8.8" > /etc/resolv.conf
  success "systemd-resolved desactivado, DNS temporal 8.8.8.8"
fi

# Instalar docker-compose plugin si no existe
if ! docker compose version &>/dev/null; then
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name)
  ARCH=$(uname -m)
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${ARCH}" -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi
success "Docker $(docker --version | awk '{print $3}') + Compose $(docker compose version --short)"

# ============================================================
# 2. CREAR ESTRUCTURA DE DIRECTORIOS
# ============================================================
log "Creando estructura de directorios..."
mkdir -p ${NETADMIN_DIR}/{configs,api,web,logs,certs}
mkdir -p ${NETADMIN_DIR}/data/{unbound,adguard/{work,conf},squid-cache,squid-logs,lancache/{data,logs},apt-cache,kuma,nginx-cache,ping-logs,cron-logs}

# ============================================================
# 3. CONFIGURACIÓN UNBOUND
# ============================================================
log "Generando configuración Unbound..."
wget -q -O ${NETADMIN_DIR}/configs/root.hints https://www.internic.net/domain/named.root 2>/dev/null || true

cat > ${NETADMIN_DIR}/configs/unbound.conf << 'EOF'
server:
    interface: 0.0.0.0
    port: 53
    do-ip4: yes
    do-ip6: no
    do-udp: yes
    do-tcp: yes
    access-control: 0.0.0.0/0 allow

    # === RENDIMIENTO MÁXIMO (ping mínimo) ===
    num-threads: 4
    msg-cache-slabs: 16
    rrset-cache-slabs: 16
    infra-cache-slabs: 16
    key-cache-slabs: 16
    msg-cache-size: 512m
    rrset-cache-size: 1g
    key-cache-size: 128m
    neg-cache-size: 64m
    infra-cache-numhosts: 100000

    # === BUFFERS DE RED (latencia ultra baja) ===
    so-rcvbuf: 8m
    so-sndbuf: 8m
    so-reuseport: yes
    edns-buffer-size: 1232
    outgoing-range: 8192
    num-queries-per-thread: 4096

    # === CACHÉ AGRESIVO (responde sin esperar internet) ===
    cache-min-ttl: 7200
    cache-max-ttl: 172800
    cache-min-negative-ttl: 60
    prefetch: yes
    prefetch-key: yes
    serve-expired: yes
    serve-expired-ttl: 0
    serve-expired-reply-ttl: 30
    serve-expired-client-timeout: 1800
    minimal-responses: yes
    rrset-roundrobin: yes
    aggressive-nsec: yes

    # === PRIVACIDAD / HARDENING ===
    hide-identity: yes
    hide-version: yes
    harden-glue: yes
    harden-dnssec-stripped: yes
    harden-below-nxdomain: yes
    harden-referral-path: yes
    use-caps-for-id: no
    qname-minimisation: yes
    qname-minimisation-strict: no

    # === TRUST / ROOT ===
    auto-trust-anchor-file: "/var/lib/unbound/root.key"
    root-hints: /etc/unbound/root.hints
    trust-anchor-signaling: yes

    # === LOGS MÍNIMOS (no consume CPU) ===
    verbosity: 0
    logfile: ""
    log-queries: no
    log-replies: no
    log-servfail: no
    use-syslog: no
    statistics-interval: 0
    extended-statistics: no

# === FORWARD ZONE (UDP plano para velocidad máxima) ===
# Se incluye archivo separado y editable sin tocar unbound.conf
include: /etc/unbound/forward-records.conf
EOF

# Generar forward-records.conf con UDP plano (Cloudflare + Google)
# Sin DoT para minimizar latencia (overhead TLS handshake ~300ms eliminado)
cat > ${NETADMIN_DIR}/configs/forward-records.conf << 'EOF'
# Forward DNS upstream — UDP plano para velocidad máxima
# Editable desde el panel NetAdmin (DNS Config) o manualmente.
# Para volver a DoT, cambia a forward-tls-upstream: yes y usa @853#hostname
forward-zone:
    name: "."
    forward-first: no
    forward-addr: 1.1.1.1        # Cloudflare primario
    forward-addr: 1.0.0.1        # Cloudflare secundario
    forward-addr: 8.8.8.8        # Google primario
    forward-addr: 8.8.4.4        # Google secundario
EOF

# ============================================================
# 3b. CONFIGURACIÓN ADGUARD HOME (upstream → Unbound :5335)
# ============================================================
log "Configurando AdGuard Home con Unbound como upstream..."
mkdir -p ${NETADMIN_DIR}/data/adguard/conf

# Generate bcrypt hash for AdGuard admin user
ADGUARD_HASH=$(htpasswd -bnBC 10 "" "${PANEL_PASS}" | tr -d ':\n' | sed 's/\$2y/\$2a/')

# Write config - use temp file approach to avoid $ escaping issues with bcrypt hash
cat > ${NETADMIN_DIR}/data/adguard/conf/AdGuardHome.yaml << 'ADGUARD_CONF'
schema_version: 28
bind_host: 0.0.0.0
bind_port: 3000
users:
  - name: admin
    password: ADGUARD_HASH_PLACEHOLDER
ADGUARD_CONF
# Replace placeholder with actual hash (write to temp file to avoid shell escaping)
printf '%s' "$ADGUARD_HASH" > /tmp/_adguard_hash.tmp
CFG_FILE="${NETADMIN_DIR}/data/adguard/conf/AdGuardHome.yaml"
python3 - "$CFG_FILE" << 'PYSCRIPT'
import sys
cfg = sys.argv[1]
with open('/tmp/_adguard_hash.tmp') as f:
    h = f.read().strip()
with open(cfg) as f:
    content = f.read()
content = content.replace('ADGUARD_HASH_PLACEHOLDER', h)
with open(cfg, 'w') as f:
    f.write(content)
PYSCRIPT
rm -f /tmp/_adguard_hash.tmp

# Append rest of config
cat >> ${NETADMIN_DIR}/data/adguard/conf/AdGuardHome.yaml << 'ADGUARD_CONF2'
auth_attempts: 5
block_auth_min: 15
http_proxy: ""
language: es
theme: auto
dns:
  bind_hosts:
    - 0.0.0.0
  port: 53
  protection_enabled: true
  filtering_enabled: true
  upstream_dns:
    - 172.20.0.10
  fallback_dns:
    - 9.9.9.10
    - 149.112.112.10
  bootstrap_dns:
    - 127.0.0.1
  all_servers: false
  fastest_addr: false
  fast_queries: true
  cache_size: 4194304
  cache_ttl_min: 300
  cache_ttl_max: 86400
  cache_optimistic: true
  ratelimit: 0
  upstream_timeout: 10s
  upstream_mode: load_balance
  blocking_mode: default
  parental_enabled: false
  safesearch:
    enabled: false
  safebrowsing_enabled: true
  use_private_ptr_resolvers: false
  resolve_clients: false
filters:
  - enabled: true
    url: https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt
    name: AdGuard DNS filter
    id: 1
  - enabled: true
    url: https://adaway.org/hosts.txt
    name: AdAway Default Blocklist
    id: 2
  - enabled: true
    url: https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
    name: Steven Black Hosts
    id: 3
user_rules:
  - '||suros.xyz^$important'
ADGUARD_CONF2

success "AdGuard Home configurado → Unbound 172.20.0.10 (puerto 53)"

# ============================================================
# 4. CONFIGURACIÓN SQUID SSL BUMP
# ============================================================
log "Generando certificado CA y configuración Squid..."

openssl req -new -newkey rsa:2048 -sha256 -days 3650 -nodes -x509 \
  -keyout ${NETADMIN_DIR}/certs/netadmin-ca.pem \
  -out ${NETADMIN_DIR}/certs/netadmin-ca.pem \
  -subj "/C=CO/ST=Colombia/O=NetAdmin/CN=NetAdmin CA" 2>/dev/null

SQUID_CACHE_MB=$((SQUID_CACHE_GB * 1000))
cat > ${NETADMIN_DIR}/configs/squid.conf << SQUID_CONF
http_port 3128
http_port 3129 intercept
https_port 3130 intercept ssl-bump cert=/etc/squid/ssl_cert/netadmin-ca.pem generate-host-certificates=on dynamic_cert_mem_cache_size=16MB

acl step1 at_step SslBump1
acl cacheable_ssl ssl::server_name .youtube.com .googlevideo.com .ytimg.com .windowsupdate.com .microsoft.com

ssl_bump peek step1
ssl_bump bump cacheable_ssl
ssl_bump splice all

sslcrtd_program /usr/lib/squid/security_file_certgen -s /var/spool/squid/ssl_db -M 64MB

cache_dir ufs /var/cache/squid ${SQUID_CACHE_MB} 16 256
maximum_object_size 4 GB
cache_mem ${SQUID_CACHE_MEM} MB
maximum_object_size_in_memory 128 MB

refresh_pattern -i \.googlevideo\.com\/videoplayback 43200 90% 86400 override-expire override-lastmod reload-into-ims ignore-reload ignore-no-store ignore-private
refresh_pattern -i ytimg\.com 43200 90% 86400 override-expire
refresh_pattern -i windowsupdate\.com/.*\.(cab|exe|ms[i|u|f|p]|[ap]sf|wm[v|a]|dat|zip|msu) 43200 80% 129600 reload-into-ims
refresh_pattern -i download\.microsoft\.com 43200 80% 129600
refresh_pattern ^ftp: 1440 20% 10080
refresh_pattern -i (/cgi-bin/|\?) 0 0% 0
refresh_pattern . 0 20% 4320

acl localnet src all
acl Safe_ports port 80 443 21 70 210 280 488 591 777 1025-65535
http_access allow localnet
http_access allow localhost
http_access deny all

access_log stdio:/var/log/squid/access.log squid
cache_log stdio:/var/log/squid/cache.log
visible_hostname netadmin-proxy
SQUID_CONF

# ============================================================
# 5. DOCKERFILE SQUID (necesita ssl-bump)
# ============================================================
cat > ${NETADMIN_DIR}/Dockerfile.squid << 'DOCKERFILE'
FROM ubuntu:24.04
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y squid-openssl openssl && \
    rm -rf /var/lib/apt/lists/*
RUN mkdir -p /var/cache/squid /var/log/squid /etc/squid/ssl_cert /var/spool/squid /run && \
    chown -R proxy:proxy /var/cache/squid /var/log/squid /var/spool/squid /run
COPY configs/squid.conf /etc/squid/squid.conf
COPY certs/netadmin-ca.pem /etc/squid/ssl_cert/netadmin-ca.pem
RUN CERTGEN=$(find /usr/lib/squid -name "security_file_certgen" -o -name "ssl_crtd" 2>/dev/null | head -1) && \
    rm -rf /var/spool/squid/ssl_db && \
    $CERTGEN -c -s /var/spool/squid/ssl_db -M 64MB && \
    chown -R proxy:proxy /var/spool/squid/ssl_db
RUN squid -z 2>/dev/null || true; rm -f /run/squid.pid
EXPOSE 3128 3129 3130
CMD ["sh", "-c", "chown -R proxy:proxy /var/log/squid /var/cache/squid /var/spool/squid && squid -z 2>/dev/null; rm -f /run/squid.pid && squid -N -d1"]
DOCKERFILE

# ============================================================
# 6. API BACKEND (Node.js)
# ============================================================
log "Generando API Backend..."

cat > ${NETADMIN_DIR}/api/package.json << 'PKG'
{
  "name": "netadmin-api",
  "version": "4.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dockerode": "^4.0.0",
    "node-routeros": "^1.6.9"
  }
}
PKG

cat > ${NETADMIN_DIR}/api/server.js << 'API_JS'
import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import Docker from 'dockerode';
import { RouterOSAPI } from 'node-routeros';

const app = express();
app.use(cors());
app.use(express.json());

const API_PORT = process.env.API_PORT || 4000;
let PANEL_PASS = process.env.PANEL_PASS || 'admin123';
const PASS_FILE = '/data/tunnel/panel-pass.txt';
// Load saved password if exists
try { 
  const saved = fs.readFileSync(PASS_FILE, 'utf8').trim();
  if (saved) PANEL_PASS = saved;
} catch {}

const ADGUARD_URL = process.env.ADGUARD_URL || 'http://adguard:3000';
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

function normalizeDomain(input = '') {
  const value = String(input).trim().toLowerCase();
  if (!value) return '';

  const sanitized = value
    .replace(/^\|\|/, '')
    .replace(/^0\.0\.0\.0\s+/, '')
    .replace(/^127\.0\.0\.1\s+/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:.*$/, '')
    .replace(/^\.+|\.+$/g, '');

  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(sanitized)
    ? sanitized
    : '';
}

// === BLOCKLIST: 1 archivo por categoría, registrados como filter URLs en AdGuard ===
// AdGuard carga estos archivos en hash table al refresh → lookup O(1), soporta millones.
const BLOCKLIST_DIR = '/data/adguard/conf/blocklists';
const BLOCKLIST_CATEGORIES = ['manual', 'mintic', 'coljuegos', 'infantil'];
const BLOCKLIST_FILES = {
  manual:    `${BLOCKLIST_DIR}/netadmin_manual.txt`,
  mintic:    `${BLOCKLIST_DIR}/netadmin_mintic.txt`,
  coljuegos: `${BLOCKLIST_DIR}/netadmin_coljuegos.txt`,
  infantil:  `${BLOCKLIST_DIR}/netadmin_infantil.txt`,
};
const BLOCKLIST_NAMES = {
  manual:    'NetAdmin · Lista Manual',
  mintic:    'NetAdmin · MinTIC Colombia',
  coljuegos: 'NetAdmin · Coljuegos Colombia',
  infantil:  'NetAdmin · Protección Infantil',
};
// AdGuard descarga los archivos por HTTP desde el nginx interno.
// IMPORTANTE: usamos la IP fija (172.20.0.19) en vez del hostname "netadmin-nginx"
// porque AdGuard tiene su propio resolver DNS y NO usa el DNS interno de Docker (127.0.0.11).
// Con el hostname falla con "no addresses for host netadmin-nginx" → 400 al registrar filtros.
// La IP 172.20.0.19 está fijada en el docker-compose.yml más abajo (sección networks).
const BLOCKLIST_HTTP_BASE = process.env.BLOCKLIST_HTTP_BASE || 'http://172.20.0.19/blocklists';
const adguardUrlFor = (cat) => `${BLOCKLIST_HTTP_BASE}/netadmin_${cat}.txt`;

function ensureBlocklistDir() {
  fs.mkdirSync(BLOCKLIST_DIR, { recursive: true });
}

function readCategory(category) {
  try {
    const content = fs.readFileSync(BLOCKLIST_FILES[category], 'utf8');
    return [...new Set(
      content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('!') && !line.startsWith('#'))
        .map(line => normalizeDomain(line))
        .filter(Boolean)
    )];
  } catch {
    return [];
  }
}

function writeCategory(category, domains) {
  const file = BLOCKLIST_FILES[category];
  if (!file) throw new Error(`Categoría inválida: ${category}`);
  ensureBlocklistDir();
  const unique = [...new Set(domains.map(d => normalizeDomain(d)).filter(Boolean))].sort();
  // Formato Adblock estándar: AdGuard lo indexa en hash table (O(1) lookup)
  const body = [
    `! Title: ${BLOCKLIST_NAMES[category]}`,
    `! Description: NetAdmin blocklist (${category}) — gestionado desde el panel`,
    `! Total: ${unique.length}`,
    `! Updated: ${new Date().toISOString()}`,
    ...unique.map(d => `||${d}^`),
  ].join('\n');
  fs.writeFileSync(file, `${body}\n`);
  return unique;
}

function readAllDomains() {
  const all = [];
  for (const cat of BLOCKLIST_CATEGORIES) {
    for (const d of readCategory(cat)) all.push({ domain: d, category: cat });
  }
  return all;
}

let adguardCookie = null;
let adguardCookieAt = 0;

async function adguardLogin() {
  // Reusar cookie 5 minutos para evitar login en cada request
  if (adguardCookie && (Date.now() - adguardCookieAt) < 5 * 60 * 1000) return adguardCookie;
  const response = await fetch(`${ADGUARD_URL}/control/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'admin', password: PANEL_PASS }),
  });
  if (!response.ok) throw new Error(`Login AdGuard falló (${response.status})`);
  const cookie = (response.headers.get('set-cookie') || '').split(';')[0].trim();
  if (!cookie) throw new Error('AdGuard no devolvió cookie de sesión');
  adguardCookie = cookie;
  adguardCookieAt = Date.now();
  return cookie;
}

async function adguardRequest(path, method = 'GET', body) {
  const cookie = await adguardLogin();
  const opts = { method, headers: { 'Content-Type': 'application/json', Cookie: cookie } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${ADGUARD_URL}${path}`, opts);
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`AdGuard ${path} → ${r.status}${txt ? ': ' + txt.slice(0, 200) : ''}`);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : { success: true };
}

async function postAdguard(path, body = {}) {
  return adguardRequest(path, 'POST', body);
}

// Garantiza: protección ON, filtrado ON, filtros viejos eliminados, y cada categoría registrada con URL HTTP.
async function ensureAdguardConfigured() {
  const status = await adguardRequest('/control/status');
  if (status && status.protection_enabled === false) {
    await postAdguard('/control/protection', { enabled: true, duration: 0 });
  }
  const filtering = await adguardRequest('/control/filtering/status');
  if (!filtering.enabled) {
    await postAdguard('/control/filtering/config', { enabled: true, interval: filtering.interval || 24 });
  }

  const expectedUrls = new Set(BLOCKLIST_CATEGORIES.map(adguardUrlFor));
  const existingFilters = filtering.filters || [];

  // 1. Eliminar filtros NetAdmin viejos con URL incorrecta (paths locales o stale)
  for (const f of existingFilters) {
    const isNetadmin = (f.name || '').toLowerCase().includes('netadmin');
    const isLegacyPath = typeof f.url === 'string' && f.url.startsWith('/opt/');
    const isStaleNetadmin = isNetadmin && !expectedUrls.has(f.url);
    if (isLegacyPath || isStaleNetadmin) {
      try {
        await postAdguard('/control/filtering/remove_url', { url: f.url, whitelist: false });
      } catch (e) { console.warn(`[blocklist] No se pudo borrar filtro viejo ${f.url}: ${e.message}`); }
    }
  }

  // 2. Re-leer estado tras la limpieza
  const filtering2 = await adguardRequest('/control/filtering/status');
  const existingUrls2 = new Set((filtering2.filters || []).map(f => f.url));

  // 3. Registrar cada categoría (asegurando que el archivo exista en disco para que nginx lo sirva)
  for (const cat of BLOCKLIST_CATEGORIES) {
    const url = adguardUrlFor(cat);
    if (!fs.existsSync(BLOCKLIST_FILES[cat])) writeCategory(cat, []);
    if (!existingUrls2.has(url)) {
      try {
        await postAdguard('/control/filtering/add_url', {
          name: BLOCKLIST_NAMES[cat],
          url,
          whitelist: false,
        });
      } catch (e) {
        console.warn(`[blocklist] No se pudo registrar ${cat}: ${e.message}`);
      }
    }
  }
}

async function reloadAdguardFilters() {
  // 1. Garantizar que los filtros estén registrados
  try { await ensureAdguardConfigured(); } catch (e) { console.warn(`[blocklist] ensureConfigured: ${e.message}`); }
  // 2. Refrescar (AdGuard hace HTTP GET a nginx → relee los archivos al instante)
  try {
    await postAdguard('/control/filtering/refresh', { whitelist: false });
  } catch (e) {
    console.warn(`[blocklist] refresh: ${e.message}`);
  }
}

// Auth middleware
// Parse raw body for speed test upload
app.use('/api/speedtest/upload', express.raw({ type: 'application/octet-stream', limit: '50mb' }));

const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== PANEL_PASS) return res.status(401).json({ error: 'No autorizado' });
  next();
};

app.use((req, res, next) => {
  // Public routes (no auth required)
  if (req.path === '/api/auth/login') return next();
  if (req.path.startsWith('/api/speedtest/')) return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== PANEL_PASS) return res.status(401).json({ error: 'No autorizado' });
  next();
});

// === AUTH ===
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === PANEL_PASS) {
    res.json({ token: PANEL_PASS, success: true });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

app.post('/api/auth/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (currentPassword !== PANEL_PASS) {
    return res.status(401).json({ success: false, error: 'Contraseña actual incorrecta' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }
  PANEL_PASS = newPassword;
  try { fs.writeFileSync(PASS_FILE, newPassword); } catch {}
  res.json({ success: true });
});

// === DOCKER SERVICE STATUS ===
app.get('/api/services', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const serviceMap = {};
    const expectedServices = [
      'netadmin-unbound', 'netadmin-adguard', 'netadmin-squid',
      'netadmin-apt-cacher', 'netadmin-lancache', 'netadmin-lancache-dns',
      'netadmin-kuma', 'netadmin-nginx', 'netadmin-ping',
      'netadmin-cloudflared', 'netadmin-blocklist-updater'
    ];
    const nameMap = {
      'netadmin-unbound': 'unbound',
      'netadmin-adguard': 'adguard',
      'netadmin-squid': 'squid',
      'netadmin-apt-cacher': 'apt-cacher-ng',
      'netadmin-lancache': 'lancache',
      'netadmin-lancache-dns': 'lancache-dns',
      'netadmin-kuma': 'uptime-kuma',
      'netadmin-nginx': 'nginx',
      'netadmin-ping': 'ping_monitor',
      'netadmin-cloudflared': 'cloudflared',
      'netadmin-blocklist-updater': 'blocklist_updater',
    };
    expectedServices.forEach(svc => {
      const container = containers.find(c => c.Names.some(n => n === `/${svc}`));
      const key = nameMap[svc] || svc;
      serviceMap[key] = container ? container.State === 'running' : false;
    });
    res.json(serviceMap);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === SYSTEM INFO (from host via mounted /host-proc) ===
app.get('/api/system', (req, res) => {
  try {
    const uptime = (() => {
      const secs = parseFloat(fs.readFileSync('/host-proc/uptime', 'utf8').split(' ')[0]);
      const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
      return `up ${d > 0 ? d + 'd ' : ''}${h}h ${m}m`;
    })();
    const meminfo = fs.readFileSync('/host-proc/meminfo', 'utf8');
    const memTotal = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)?.[1] || 0) / 1024;
    const memAvail = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] || 0) / 1024;
    const memUsed = memTotal - memAvail;
    const memory = `${Math.round(memUsed)}M/${Math.round(memTotal)}M`;
    const loadavg = fs.readFileSync('/host-proc/loadavg', 'utf8').split(' ');
    const cpu = parseFloat(loadavg[0]) * 100 / (parseInt(fs.readFileSync('/host-proc/cpuinfo', 'utf8').match(/processor/g)?.length || '1'));
    let disk = 'N/A';
    try { disk = execSync("df -h /host-data | awk 'NR==2 {print $3\"/\"$2}'").toString().trim(); } catch {}
    res.json({ uptime, memory, disk, cpu: Math.round(cpu * 10) / 10 });
  } catch (e) {
    res.json({ uptime: 'N/A', memory: 'N/A', disk: 'N/A', cpu: 0 });
  }
});

app.get('/api/system/monitor', (req, res) => {
  try {
    const meminfo = fs.readFileSync('/host-proc/meminfo', 'utf8');
    const memTotal = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)?.[1] || '0', 10) * 1024;
    const memAvail = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] || '0', 10) * 1024;
    const memUsed = Math.max(memTotal - memAvail, 0);
    const loadavg = fs.readFileSync('/host-proc/loadavg', 'utf8').split(' ');
    const cpuCount = Math.max((fs.readFileSync('/host-proc/cpuinfo', 'utf8').match(/^processor\s*:/gm) || []).length, 1);
    const cpu = Math.max(0, Math.min(100, +(parseFloat(loadavg[0] || '0') * 100 / cpuCount).toFixed(1)));
    const df = execSync("df -B1 /host-data | tail -1").toString().trim().split(/\s+/);
    const diskTotal = Number(df[1] || 0);
    const diskUsed = Number(df[2] || 0);
    const diskAvail = Number(df[3] || 0);
    const diskPercent = parseInt((df[4] || '0').replace('%', ''), 10) || 0;
    const current = readNetworkBytes();
    const now = Date.now();
    let rxSpeed = 0;
    let txSpeed = 0;

    if (previousNetSample && now > previousNetSample.ts) {
      const seconds = (now - previousNetSample.ts) / 1000;
      rxSpeed = Math.max(0, Math.round((current.rx - previousNetSample.rx) / seconds));
      txSpeed = Math.max(0, Math.round((current.tx - previousNetSample.tx) / seconds));
    }

    previousNetSample = { ...current, ts: now };

    const uptimeSeconds = parseFloat(fs.readFileSync('/host-proc/uptime', 'utf8').split(' ')[0] || '0');
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    res.json({
      cpu,
      memory: {
        used: memUsed,
        total: memTotal,
        percent: memTotal ? Math.round((memUsed / memTotal) * 1000) / 10 : 0,
      },
      disk: {
        used: `${(diskUsed / (1024 ** 3)).toFixed(1)} GB`,
        total: `${(diskTotal / (1024 ** 3)).toFixed(1)} GB`,
        available: `${(diskAvail / (1024 ** 3)).toFixed(1)} GB`,
        percent: diskPercent,
      },
      network: {
        rx_bytes: current.rx,
        tx_bytes: current.tx,
        rx_speed: rxSpeed,
        tx_speed: txSpeed,
      },
      uptime: `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === PING DATA ===
app.get('/api/ping', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const logFile = `/data/ping-logs/ping-${today}.log`;
  try {
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-120);
    const data = lines.map(line => {
      const [time, status, value] = line.split('|');
      return { time: time.trim(), status: status.trim(), ping: parseFloat(value) || 0 };
    });
    const pings = data.filter(d => d.status === 'OK').map(d => d.ping);
    res.json({
      data,
      stats: {
        current: pings[pings.length - 1] || 0,
        avg: pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length * 10) / 10 : 0,
        max: pings.length ? Math.round(Math.max(...pings) * 10) / 10 : 0,
        lost: data.filter(d => d.status === 'FAIL').length,
      }
    });
  } catch {
    res.json({ data: [], stats: { current: 0, avg: 0, max: 0, lost: 0 } });
  }
});

app.get('/api/ping/downtime', (req, res) => {
  try {
    const log = fs.readFileSync('/data/ping-logs/downtime.log', 'utf8').trim().split('\n').slice(-50);
    res.json(log.map(l => { const [time, event] = l.split('|'); return { time: time.trim(), event: event.trim() }; }));
  } catch { res.json([]); }
});

// === ADGUARD PROXY ===
const proxyAdGuard = (path, method = 'GET') => async (req, res) => {
  try {
    const cookie = await adguardLogin();
    const opts = { method, headers: { 'Content-Type': 'application/json', Cookie: cookie } };
    if (method === 'POST') opts.body = JSON.stringify(req.body);
    const r = await fetch(`${ADGUARD_URL}${path}`, opts);
    const contentType = r.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await r.text();
      if (text.includes('<html') || text.includes('<!DOCTYPE')) {
        return res.status(502).json({ error: 'AdGuard Home está en modo setup o no responde JSON. Accede al panel en /adguard/ para completar la configuración inicial.' });
      }
      return res.json({});
    }
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: `No se pudo conectar con AdGuard Home: ${e.message}` }); }
};

app.get('/api/adguard/status', proxyAdGuard('/control/status'));
app.get('/api/adguard/stats', proxyAdGuard('/control/stats'));
app.get('/api/adguard/querylog', proxyAdGuard('/control/querylog?limit=100'));
app.get('/api/adguard/filtering', proxyAdGuard('/control/filtering/status'));
app.post('/api/adguard/filtering/add', proxyAdGuard('/control/filtering/add_url', 'POST'));
app.post('/api/adguard/filtering/remove', proxyAdGuard('/control/filtering/remove_url', 'POST'));
app.post('/api/adguard/filtering/set', proxyAdGuard('/control/filtering/set_url', 'POST'));
app.post('/api/adguard/filtering/refresh', proxyAdGuard('/control/filtering/refresh', 'POST'));

// Lista plana de dominios (compat hacia atrás con el frontend actual)
app.get('/api/blocklist', (req, res) => {
  try {
    const all = readAllDomains();
    res.json(all.map(item => item.domain));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Lista detallada (dominio + categoría) para el panel
app.get('/api/blocklist/full', (req, res) => {
  try { res.json(readAllDomains()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/blocklist/add', async (req, res) => {
  try {
    const domain = normalizeDomain(req.body.domain);
    if (!domain) return res.status(400).json({ error: 'Dominio inválido' });
    const category = BLOCKLIST_CATEGORIES.includes(req.body.category) ? req.body.category : 'manual';
    const current = readCategory(category);
    if (!current.includes(domain)) {
      writeCategory(category, [...current, domain]);
      await reloadAdguardFilters();
    }
    res.json({ success: true, domain, category });
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Carga masiva: agrega N dominios a una categoría con UN solo refresh de AdGuard
app.post('/api/blocklist/bulk-add', async (req, res) => {
  try {
    const category = BLOCKLIST_CATEGORIES.includes(req.body.category) ? req.body.category : 'manual';
    const incoming = Array.isArray(req.body.domains) ? req.body.domains : [];
    const normalized = incoming.map(d => normalizeDomain(d)).filter(Boolean);
    const before = readCategory(category);
    const beforeSet = new Set(before);
    const toAdd = normalized.filter(d => !beforeSet.has(d));
    if (toAdd.length > 0) {
      writeCategory(category, [...before, ...toAdd]);
      await reloadAdguardFilters();
    }
    res.json({
      success: true,
      category,
      received: incoming.length,
      valid: normalized.length,
      added: toAdd.length,
      duplicates: normalized.length - toAdd.length,
      invalid: incoming.length - normalized.length,
      total_in_category: before.length + toAdd.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/blocklist/remove', async (req, res) => {
  try {
    const domain = normalizeDomain(req.body.domain);
    let removed = false;
    for (const cat of BLOCKLIST_CATEGORIES) {
      const list = readCategory(cat);
      if (list.includes(domain)) {
        writeCategory(cat, list.filter(d => d !== domain));
        removed = true;
      }
    }
    if (removed) await reloadAdguardFilters();
    res.json({ success: true, removed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Eliminación por lote: borra N dominios con UN solo refresh de AdGuard
app.post('/api/blocklist/bulk-remove', async (req, res) => {
  try {
    const incoming = Array.isArray(req.body.domains) ? req.body.domains : [];
    const targets = new Set(incoming.map(d => normalizeDomain(d)).filter(Boolean));
    if (targets.size === 0) return res.json({ success: true, removed: 0 });
    let removed = 0;
    for (const cat of BLOCKLIST_CATEGORIES) {
      const list = readCategory(cat);
      const kept = list.filter(d => !targets.has(d));
      const diff = list.length - kept.length;
      if (diff > 0) {
        writeCategory(cat, kept);
        removed += diff;
      }
    }
    if (removed > 0) await reloadAdguardFilters();
    res.json({ success: true, removed, requested: incoming.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Borra todos los dominios de una categoría (o todas si se omite)
app.post('/api/blocklist/clear', async (req, res) => {
  try {
    const target = req.body.category;
    const cats = target && BLOCKLIST_CATEGORIES.includes(target) ? [target] : BLOCKLIST_CATEGORIES;
    for (const cat of cats) writeCategory(cat, []);
    await reloadAdguardFilters();
    res.json({ success: true, cleared: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === DIAGNÓSTICO: por qué un dominio no se bloquea ===
app.get('/api/blocklist/diagnose', async (req, res) => {
  const report = {
    adguard_reachable: false,
    protection_enabled: null,
    filtering_enabled: null,
    registered_filters: [],
    expected_filters: BLOCKLIST_CATEGORIES.map(c => ({ category: c, name: BLOCKLIST_NAMES[c], url: adguardUrlFor(c) })),
    files_on_disk: {},
    issues: [],
    test_domain: null,
  };
  try {
    const status = await adguardRequest('/control/status');
    report.adguard_reachable = true;
    report.protection_enabled = status.protection_enabled;
    if (!status.protection_enabled) report.issues.push('AdGuard tiene la protección DESACTIVADA. Actívala en /adguard/ → "Disable protection".');
    const filtering = await adguardRequest('/control/filtering/status');
    report.filtering_enabled = filtering.enabled;
    if (!filtering.enabled) report.issues.push('AdGuard tiene el filtrado DESACTIVADO. Actívalo en Configuración → Reglas de filtrado.');
    report.registered_filters = (filtering.filters || []).map(f => ({
      name: f.name, url: f.url, enabled: f.enabled, rules_count: f.rules_count, last_updated: f.last_updated,
    }));
    const registeredUrls = new Set(report.registered_filters.map(f => f.url));
    for (const cat of BLOCKLIST_CATEGORIES) {
      const url = adguardUrlFor(cat);
      const file = BLOCKLIST_FILES[cat];
      const exists = fs.existsSync(file);
      const lines = exists ? readCategory(cat).length : 0;
      report.files_on_disk[cat] = { path: file, exists, domain_count: lines };
      if (!registeredUrls.has(url)) report.issues.push(`Filtro ${cat} NO está registrado en AdGuard (esperado: ${url}).`);
      else {
        const reg = report.registered_filters.find(f => f.url === url);
        if (reg && !reg.enabled) report.issues.push(`Filtro ${cat} está registrado pero DESACTIVADO en AdGuard.`);
        if (reg && reg.rules_count === 0 && lines > 0) report.issues.push(`Filtro ${cat}: ${lines} dominios en disco pero AdGuard cargó 0 reglas. Probable: AdGuard no puede leer ${url}. Revisa el volumen del contenedor.`);
      }
    }
    // Test opcional: ?domain=ejemplo.com
    if (req.query.domain) {
      try {
        const check = await adguardRequest(`/control/filtering/check_host?name=${encodeURIComponent(String(req.query.domain))}`);
        report.test_domain = { name: req.query.domain, ...check };
      } catch (e) { report.test_domain = { name: req.query.domain, error: e.message }; }
    }
  } catch (e) {
    report.issues.push(`No se pudo conectar con AdGuard: ${e.message}`);
  }
  if (report.issues.length === 0) report.issues.push('✅ Configuración correcta. Si un dominio sigue sin bloquearse, prueba con ?domain=ejemplo.com');
  res.json(report);
});

// Fuerza re-registro y refresh — útil después de un reinstall o si algo se desincroniza
// Devuelve un reporte detallado de qué pasó con cada lista (para depurar desde el panel)
app.post('/api/blocklist/repair', async (req, res) => {
  const report = { success: true, steps: [], filters: [], errors: [] };
  try {
    ensureBlocklistDir();
    report.steps.push(`Directorio listo: ${BLOCKLIST_DIR}`);

    // 1. Crear archivos vacíos válidos si no existen (con header AdGuard)
    for (const cat of BLOCKLIST_CATEGORIES) {
      if (!fs.existsSync(BLOCKLIST_FILES[cat])) {
        writeCategory(cat, []);
        report.steps.push(`Creado archivo vacío: netadmin_${cat}.txt`);
      } else {
        const stat = fs.statSync(BLOCKLIST_FILES[cat]);
        report.steps.push(`Existe: netadmin_${cat}.txt (${stat.size} bytes)`);
      }
    }

    // 2. Asegurar permisos legibles para nginx (mount :ro)
    try {
      execSync(`chmod 755 ${BLOCKLIST_DIR} && chmod 644 ${BLOCKLIST_DIR}/netadmin_*.txt`);
      report.steps.push('Permisos ajustados (755 dir, 644 archivos)');
    } catch (e) { report.errors.push(`chmod: ${e.message}`); }

    // 3. Verificar que nginx sirve cada URL (HEAD test desde el contenedor api)
    for (const cat of BLOCKLIST_CATEGORIES) {
      const url = adguardUrlFor(cat);
      try {
        const code = execSync(`wget -q --spider --server-response "${url}" 2>&1 | grep "HTTP/" | tail -1 | awk '{print $2}'`).toString().trim();
        report.steps.push(`HTTP ${code} → ${url}`);
        if (code !== '200') report.errors.push(`nginx no sirve ${cat}: HTTP ${code}`);
      } catch (e) { report.errors.push(`wget ${cat}: ${e.message}`); }
    }

    // 4. Limpiar user_rules viejas
    try {
      await postAdguard('/control/filtering/set_rules', { rules: [] });
      report.steps.push('user_rules limpiadas');
    } catch (e) { report.errors.push(`set_rules: ${e.message}`); }

    // 5. Registrar / asegurar las 4 listas en AdGuard
    try {
      await ensureAdguardConfigured();
      report.steps.push('ensureAdguardConfigured() OK');
    } catch (e) {
      report.errors.push(`ensureAdguardConfigured: ${e.message}`);
      report.success = false;
    }

    // 6. Refresh AdGuard
    try {
      await postAdguard('/control/filtering/refresh', { whitelist: false });
      report.steps.push('AdGuard refresh OK');
    } catch (e) { report.errors.push(`refresh: ${e.message}`); }

    // 7. Confirmar qué filtros quedaron registrados (verificación final)
    try {
      const status = await adguardRequest('/control/filtering/status');
      const netadminFilters = (status.filters || []).filter(f => (f.name || '').toLowerCase().includes('netadmin'));
      report.filters = netadminFilters.map(f => ({
        name: f.name, url: f.url, enabled: f.enabled, rules_count: f.rules_count, last_updated: f.last_updated,
      }));
      if (netadminFilters.length < BLOCKLIST_CATEGORIES.length) {
        report.success = false;
        report.errors.push(`Solo ${netadminFilters.length}/${BLOCKLIST_CATEGORIES.length} listas NetAdmin quedaron registradas`);
      }
    } catch (e) { report.errors.push(`status final: ${e.message}`); }

    res.json(report);
  } catch (e) {
    report.success = false;
    report.errors.push(`fatal: ${e.message}`);
    res.status(500).json(report);
  }
});

// === BLOCKLIST AUTO-UPDATE STATUS ===
app.get('/api/blocklist/update-status', (req, res) => {
  try {
    const status = JSON.parse(fs.readFileSync('/data/cron-logs/last-update.json', 'utf8'));
    res.json(status);
  } catch { res.json({ timestamp: null, status: 'never', sources_ok: 0, sources_fail: 0, domains_total: 0 }); }
});

app.get('/api/blocklist/update-log', (req, res) => {
  try {
    const log = fs.readFileSync('/data/cron-logs/blocklist-updates.log', 'utf8').trim().split('\n').slice(-50);
    res.json(log);
  } catch { res.json([]); }
});

app.post('/api/blocklist/update-now', async (req, res) => {
  try {
    execSync('docker restart netadmin-blocklist-updater 2>/dev/null || true');
    res.json({ success: true, message: 'Actualización iniciada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === CACHE STATS ===
const getCacheSize = (path) => {
  try { return execSync(`du -sh ${path} 2>/dev/null | cut -f1`).toString().trim(); }
  catch { return '0'; }
};

app.get('/api/cache/squid', (req, res) => {
  const size = getCacheSize('/data/squid-cache');
  let hits = 0, misses = 0, youtube = 0;
  try {
    const lines = fs.readFileSync('/data/squid-logs/access.log', 'utf8').trim().split('\n').slice(-1000);
    lines.forEach(l => {
      if (l.includes('HIT')) hits++; else misses++;
      if (l.includes('googlevideo') || l.includes('youtube')) youtube++;
    });
  } catch {}
  res.json({ size, hits, misses, hitRate: hits + misses > 0 ? Math.round(hits / (hits + misses) * 100) : 0, youtube });
});

app.get('/api/cache/lancache', (req, res) => {
  res.json({ size: getCacheSize('/data/lancache-data'), status: 'active' });
});

app.get('/api/cache/apt', (req, res) => {
  res.json({ size: getCacheSize('/data/apt-cache') });
});

app.get('/api/cache/nginx', (req, res) => {
  res.json({ size: getCacheSize('/data/nginx-cache') });
});

// === CACHE MANAGEMENT ===
const getDiskUsage = () => {
  try {
    const df = execSync("df -h /data | tail -1").toString().trim().split(/\s+/);
    return { total: df[1], used: df[2], available: df[3], percent: parseInt(df[4]) };
  } catch { return { total: '?', used: '?', available: '?', percent: 0 }; }
};

app.get('/api/cache/disk', requireAuth, (req, res) => {
  res.json(getDiskUsage());
});

app.post('/api/cache/purge', requireAuth, (req, res) => {
  const { service } = req.body; // squid, lancache, apt, nginx, all
  try {
    const cmds = {
      squid: 'rm -rf /data/squid-cache/* && docker restart netadmin-squid',
      lancache: 'rm -rf /data/lancache-data/*',
      apt: 'rm -rf /data/apt-cache/*',
      nginx: 'rm -rf /data/nginx-cache/*',
    };
    if (service === 'all') {
      Object.values(cmds).forEach(cmd => { try { execSync(cmd); } catch {} });
    } else if (cmds[service]) {
      execSync(cmds[service]);
    } else {
      return res.status(400).json({ error: 'Servicio inválido' });
    }
    res.json({ success: true, message: 'Caché limpiado: ' + service });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Auto-cleanup config file
const CLEANUP_CONFIG = '/data/cache-cleanup.json';
const getCleanupConfig = () => {
  try { return JSON.parse(fs.readFileSync(CLEANUP_CONFIG, 'utf8')); }
  catch { return { enabled: false, threshold: 85 }; }
};

app.get('/api/cache/cleanup-config', requireAuth, (req, res) => {
  res.json(getCleanupConfig());
});

app.post('/api/cache/cleanup-config', requireAuth, (req, res) => {
  const { enabled, threshold } = req.body;
  const config = { enabled: !!enabled, threshold: threshold || 85 };
  fs.writeFileSync(CLEANUP_CONFIG, JSON.stringify(config));
  res.json({ success: true, ...config });
});

// Auto-cleanup check (runs every 5 min)
setInterval(() => {
  const config = getCleanupConfig();
  if (!config.enabled) return;
  const disk = getDiskUsage();
  if (disk.percent >= config.threshold) {
    console.log('[AutoCleanup] Disk at ' + disk.percent + '%, threshold ' + config.threshold + '%. Cleaning oldest cache...');
    try {
      execSync('find /data/squid-cache -type f -atime +7 -delete 2>/dev/null || true');
      execSync('find /data/lancache-data -type f -atime +14 -delete 2>/dev/null || true');
      execSync('find /data/nginx-cache -type f -atime +7 -delete 2>/dev/null || true');
    } catch {}
  }
}, 5 * 60 * 1000);

// === CLOUDFLARE TUNNEL ===
const TUNNEL_URL_FILE = '/data/tunnel/tunnel-url.txt';
const TUNNEL_TOKEN_FILE = '/data/tunnel/cf-token.txt';

function sh(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) {
    // Return stdout + stderr concatenated so callers can diagnose
    const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
    return out.trim() || ('exit ' + (e.status || '?') + ': ' + (e.message || ''));
  }
}

function containerExists(name) {
  return sh(`docker ps -a --format '{{.Names}}' | grep -x ${name} || true`) === name;
}
function containerRunning(name) {
  return sh(`docker ps --format '{{.Names}}' | grep -x ${name} || true`) === name;
}

function readTunnelLogs() {
  return sh('docker logs netadmin-cloudflared 2>&1 | tail -n 300');
}

function extractUrlFromLogs(logs) {
  const m = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
  return m && m.length ? m[m.length - 1] : '';
}

function getTunnelUrl() {
  try {
    const url = fs.readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
    if (url) return url;
  } catch {}
  const url = extractUrlFromLogs(readTunnelLogs());
  if (url) { try { fs.writeFileSync(TUNNEL_URL_FILE, url); } catch {} }
  return url;
}

async function waitForTunnelUrl(timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = extractUrlFromLogs(readTunnelLogs());
    if (url) {
      try { fs.writeFileSync(TUNNEL_URL_FILE, url); } catch {}
      return url;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return '';
}

function ensureCloudflaredContainer(token) {
  // Custom token path: manual docker run (compose doesn't have token preconfigured)
  if (token && token.trim()) {
    if (containerExists('netadmin-cloudflared')) {
      sh('docker rm -f netadmin-cloudflared 2>&1');
    }
    let network = '';
    try {
      network = sh("docker inspect netadmin-api --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'").trim().split('\n')[0] || '';
    } catch {}
    if (!network) {
      network = sh("docker network ls --format '{{.Name}}' | grep -E '^netadmin' | head -1").trim() || 'netadmin_default';
    }
    const cmd = `docker run -d --name netadmin-cloudflared --restart unless-stopped --network ${network} cloudflare/cloudflared:latest tunnel --no-autoupdate run --token ${token.trim()}`;
    const out = sh(cmd);
    if (!containerExists('netadmin-cloudflared')) {
      throw new Error('No se pudo crear cloudflared con token. Salida: ' + (out || 'vacío'));
    }
    return;
  }
  // Quick Tunnel: docker run direct (más confiable que compose --profile)
  if (containerExists('netadmin-cloudflared')) {
    sh('docker rm -f netadmin-cloudflared 2>&1');
  }
  // Asegurar imagen disponible
  const pullOut = sh('docker pull cloudflare/cloudflared:latest 2>&1');
  // Detectar red de netadmin (la misma que usa la API)
  let network = '';
  try {
    network = sh("docker inspect netadmin-api --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'").split('\n')[0].trim() || '';
  } catch {}
  if (!network) {
    network = sh("docker network ls --format '{{.Name}}' | grep -E '^netadmin' | head -1").trim() || 'netadmin_default';
  }
  const cmd = `docker run -d --name netadmin-cloudflared --restart unless-stopped --network ${network} cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://netadmin-nginx:80`;
  const runOut = sh(cmd);
  if (!containerExists('netadmin-cloudflared')) {
    throw new Error(
      'No se pudo crear cloudflared (Quick Tunnel).\n' +
      'Red usada: ' + network + '\n' +
      'docker pull: ' + (pullOut.split('\n').slice(-3).join(' | ') || 'sin salida') + '\n' +
      'docker run: ' + (runOut || 'sin salida')
    );
  }
}

app.get('/api/tunnel/status', async (req, res) => {
  try {
    const exists = containerExists('netadmin-cloudflared');
    const active = exists && containerRunning('netadmin-cloudflared');
    const url = active ? getTunnelUrl() : '';
    res.json({ active, url, state: exists ? (active ? 'running' : 'stopped') : 'not_created' });
  } catch { res.json({ active: false, url: '' }); }
});

app.post('/api/tunnel/start', async (req, res) => {
  try {
    const token = (req.body && req.body.token) ? String(req.body.token).trim() : '';
    if (token) {
      try { fs.writeFileSync(TUNNEL_TOKEN_FILE, token); } catch {}
    }
    // If container doesn't exist or token changed, (re)create it
    let needRecreate = !containerExists('netadmin-cloudflared');
    if (!needRecreate && token) {
      // If user provided a token, always recreate to apply it
      needRecreate = true;
    }
    if (needRecreate) {
      ensureCloudflaredContainer(token);
    } else {
      sh('docker start netadmin-cloudflared 2>&1');
    }
    // Quick tunnel: wait & extract URL. With token: no URL needed.
    let url = '';
    if (!token) {
      url = await waitForTunnelUrl(25000);
      if (!url) {
        const logs = readTunnelLogs().split('\n').slice(-20).join('\n');
        return res.status(500).json({ error: 'Túnel iniciado pero no devolvió URL en 25s. Logs:\n' + logs });
      }
    }
    res.json({ success: true, url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tunnel/stop', async (req, res) => {
  try {
    sh('docker stop netadmin-cloudflared 2>&1');
    try { fs.unlinkSync(TUNNEL_URL_FILE); } catch {}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === KUMA MONITORS ===
app.get('/api/kuma/monitors', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const kuma = containers.find(c => c.Names.some(n => n === '/netadmin-kuma'));
    if (!kuma || kuma.State !== 'running') {
      return res.json([]);
    }
    // Try to get monitors from Kuma API
    try {
      const r = await fetch('http://netadmin-kuma:3001/api/status-page/heartbeat/default');
      const data = await r.json();
      if (data.heartbeatList) {
        const monitors = Object.entries(data.heartbeatList).map(([id, beats]) => {
          const last = beats[beats.length - 1] || {};
          return {
            id: parseInt(id),
            name: last.name || `Monitor ${id}`,
            type: last.type || 'unknown',
            target: last.url || last.hostname || '',
            status: last.status === 1 ? 'up' : 'down',
            uptime: '—',
            ping: last.ping ? `${last.ping}ms` : '—',
          };
        });
        return res.json(monitors);
      }
    } catch {}
    // Fallback: return basic service status
    res.json([]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === DOCKER CONTAINER MANAGEMENT ===
app.get('/api/docker/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const netadminContainers = containers
      .filter(c => c.Names.some(n => n.startsWith('/netadmin-')))
      .map(c => ({
        name: c.Names[0].replace('/', ''),
        displayName: c.Names[0].replace('/netadmin-', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        state: c.State,
        status: c.Status,
        image: c.Image,
      }));
    res.json(netadminContainers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/docker/start', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.startsWith('netadmin-')) return res.status(400).json({ error: 'Contenedor no válido' });
    const container = docker.getContainer(name);
    await container.start();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/docker/stop', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.startsWith('netadmin-')) return res.status(400).json({ error: 'Contenedor no válido' });
    const container = docker.getContainer(name);
    await container.stop();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/docker/restart', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.startsWith('netadmin-')) return res.status(400).json({ error: 'Contenedor no válido' });
    const container = docker.getContainer(name);
    await container.restart();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === DNS UPSTREAM CONFIG ===
const DNS_CONFIG_FILE = '/data/dns-config.json';

app.get('/api/dns/config', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(DNS_CONFIG_FILE, 'utf8'));
    res.json(config);
  } catch {
    res.json({ primary: '8.8.8.8', secondary: '8.8.4.4' });
  }
});

app.post('/api/dns/config', (req, res) => {
  try {
    const { primary, secondary } = req.body;
    // Save config metadata
    fs.writeFileSync(DNS_CONFIG_FILE, JSON.stringify({ primary, secondary, updated: new Date().toISOString() }));
    // Update Unbound forward-records.conf (UDP plano para velocidad máxima)
    const fwdConf = `# Forward DNS upstream — gestionado desde NetAdmin\n# Última actualización: ${new Date().toISOString()}\nforward-zone:\n    name: "."\n    forward-first: no\n    forward-addr: ${primary}\n    forward-addr: ${secondary}\n`;
    // Path real: el archivo está montado desde ./configs/forward-records.conf
    fs.writeFileSync('/app/configs/forward-records.conf', fwdConf);
    // Restart Unbound to apply
    execSync('docker restart netadmin-unbound 2>/dev/null || true');
    res.json({ success: true, primary, secondary });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === QUIC / NETWORK PERFORMANCE ===
app.get('/api/network/quic-status', (req, res) => {
  try {
    const rules = execSync('docker run --rm --net=host --privileged alpine sh -c "apk add --no-cache iptables >/dev/null 2>&1; iptables -L FORWARD -n 2>/dev/null || true"').toString();
    const blocked = rules.includes('udp dpt:443') && rules.includes('DROP');
    res.json({ blocked, rules_active: blocked });
  } catch { res.json({ blocked: false, rules_active: false }); }
});

app.post('/api/network/quic-block', (req, res) => {
  try {
    // Execute iptables on host via docker
    execSync('docker run --rm --net=host --privileged alpine sh -c "apk add --no-cache iptables >/dev/null 2>&1; iptables -C FORWARD -p udp --dport 443 -j DROP 2>/dev/null || iptables -A FORWARD -p udp --dport 443 -j DROP; iptables -C FORWARD -p udp --dport 80 -j DROP 2>/dev/null || iptables -A FORWARD -p udp --dport 80 -j DROP; iptables -C OUTPUT -p udp --dport 443 -j DROP 2>/dev/null || iptables -A OUTPUT -p udp --dport 443 -j DROP"');
    res.json({ success: true, blocked: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/network/quic-unblock', (req, res) => {
  try {
    execSync('docker run --rm --net=host --privileged alpine sh -c "apk add --no-cache iptables >/dev/null 2>&1; iptables -D FORWARD -p udp --dport 443 -j DROP 2>/dev/null; iptables -D FORWARD -p udp --dport 80 -j DROP 2>/dev/null; iptables -D OUTPUT -p udp --dport 443 -j DROP 2>/dev/null"');
    res.json({ success: true, blocked: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === TCP BBR STATUS ===
app.get('/api/network/tcp-optimization', (req, res) => {
  try {
    const congestion = execSync('sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo unknown').toString().trim();
    const qdisc = execSync('sysctl -n net.core.default_qdisc 2>/dev/null || echo unknown').toString().trim();
    const fastopen = execSync('sysctl -n net.ipv4.tcp_fastopen 2>/dev/null || echo 0').toString().trim();
    const rmem = execSync('sysctl -n net.core.rmem_max 2>/dev/null || echo 0').toString().trim();
    const wmem = execSync('sysctl -n net.core.wmem_max 2>/dev/null || echo 0').toString().trim();
    const twReuse = execSync('sysctl -n net.ipv4.tcp_tw_reuse 2>/dev/null || echo 0').toString().trim();
    const windowScaling = execSync('sysctl -n net.ipv4.tcp_window_scaling 2>/dev/null || echo 0').toString().trim();
    res.json({
      bbr_active: congestion === 'bbr',
      congestion_control: congestion,
      qdisc,
      tcp_fastopen: parseInt(fastopen) >= 3,
      rmem_max: parseInt(rmem),
      wmem_max: parseInt(wmem),
      tw_reuse: twReuse === '1',
      window_scaling: windowScaling === '1',
    });
  } catch { res.json({ bbr_active: false, congestion_control: 'unknown', qdisc: 'unknown', tcp_fastopen: false, rmem_max: 0, wmem_max: 0, tw_reuse: false, window_scaling: false }); }
});

app.get('/api/network/video-stats', (req, res) => {
  try {
    const lines = fs.readFileSync('/data/squid-logs/access.log', 'utf8').trim().split('\n').slice(-5000);
    const videoDomains = ['googlevideo', 'youtube', 'ytimg', 'nflxvideo', 'fbcdn', 'tiktokcdn', 'akamaihd'];
    let total = 0, cached = 0, totalBytes = 0, cachedBytes = 0;
    const domainStats = {};
    
    lines.forEach(line => {
      const isVideo = videoDomains.some(d => line.includes(d));
      if (!isVideo) return;
      total++;
      const isHit = line.includes('HIT');
      if (isHit) cached++;
      // Try to extract bytes
      const parts = line.split(/\s+/);
      const bytes = parseInt(parts[4]) || 0;
      totalBytes += bytes;
      if (isHit) cachedBytes += bytes;
      // Track per domain
      const matchedDomain = videoDomains.find(d => line.includes(d));
      if (matchedDomain) {
        if (!domainStats[matchedDomain]) domainStats[matchedDomain] = { hits: 0, cached: 0 };
        domainStats[matchedDomain].hits++;
        if (isHit) domainStats[matchedDomain].cached++;
      }
    });
    
    const formatBytes = (b) => {
      if (b > 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
      if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
      return (b / 1024).toFixed(1) + ' KB';
    };
    
    const top_domains = Object.entries(domainStats)
      .map(([domain, stats]) => ({ domain: `*.${domain}.*`, hits: stats.hits, cached: stats.cached }))
      .sort((a, b) => b.hits - a.hits);
    
    res.json({
      total_requests: total,
      cached_requests: cached,
      hit_rate: total > 0 ? Math.round(cached / total * 100) : 0,
      bandwidth_saved: formatBytes(cachedBytes),
      top_domains,
    });
  } catch {
    res.json({ total_requests: 0, cached_requests: 0, hit_rate: 0, bandwidth_saved: '0 KB', top_domains: [] });
  }
});

// === SYSTEM UPDATES ===
// Helper: run a one-shot container via dockerode (host-side actions)
async function runOneShot({ Image, Cmd, HostConfig = {}, Env = [] }) {
  // Pull image first (best-effort)
  try {
    await new Promise((resolve, reject) => {
      docker.pull(Image, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (e) => e ? reject(e) : resolve());
      });
    });
  } catch (e) { /* image may already exist */ }

  const container = await docker.createContainer({
    Image,
    Cmd,
    Env,
    HostConfig: { AutoRemove: false, ...HostConfig },
    Tty: false,
  });
  await container.start();
  const result = await container.wait();
  let logs = '';
  try {
    const buf = await container.logs({ stdout: true, stderr: true, follow: false });
    logs = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  } catch {}
  try { await container.remove({ force: true }); } catch {}
  return { exitCode: result.StatusCode, logs };
}

// ── Async jobs registry (in-memory) ──
const jobs = new Map(); // id -> { status, startedAt, finishedAt, message, logs, error }
function newJob() {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const job = { id, status: 'running', startedAt: Date.now(), finishedAt: null, message: '', logs: '', error: null };
  jobs.set(id, job);
  // Auto-cleanup after 1h
  setTimeout(() => jobs.delete(id), 60 * 60 * 1000);
  return job;
}

app.get('/api/system/job/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ success: false, error: 'job no encontrado (expiró o id inválido)' });
  res.json({ success: true, job: j });
});

app.post('/api/system/update-docker', (req, res) => {
  const job = newJob();
  // Respond immediately
  res.json({ success: true, jobId: job.id, message: 'Actualización iniciada en segundo plano' });
  // Run in background
  (async () => {
    try {
      const r = await runOneShot({
        Image: 'docker:cli',
        Cmd: ['sh', '-c', 'docker compose -f /compose/docker-compose.yml pull && docker compose -f /compose/docker-compose.yml up -d'],
        HostConfig: {
          Binds: [
            '/var/run/docker.sock:/var/run/docker.sock',
            '/opt/netadmin:/compose:rw',
          ],
        },
      });
      job.logs = (r.logs || '').slice(-4000);
      job.finishedAt = Date.now();
      if (r.exitCode === 0) {
        job.status = 'success';
        job.message = 'Imágenes actualizadas y contenedores reiniciados';
      } else {
        job.status = 'error';
        job.error = 'docker compose falló';
      }
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      job.finishedAt = Date.now();
    }
  })();
});

app.post('/api/system/update-panel', (req, res) => {
  const job = newJob();
  res.json({ success: true, jobId: job.id, message: 'Compilación iniciada en segundo plano' });
  (async () => {
    try {
      // ── Step 1: build frontend panel ──
      const buildScript = [
        'set -e',
        'apk add --no-cache git >/dev/null',
        'rm -rf /build',
        'git clone --depth 1 https://github.com/drab10688-dot/cloud-cache-gateway.git /build',
        'cd /build',
        'npm install --silent --no-audit --no-fund',
        'npm run build',
        'rm -rf /web/*',
        'cp -r /build/dist/* /web/',
        // Extract the embedded API server.js from install-netadmin.sh into /api-out so
        // we can later rebuild netadmin-api with the latest backend code.
        'mkdir -p /api-out',
        // Use sed (simpler than awk) — match the literal start/end markers without complex regex
        "sed -n '/^cat > .*\\/api\\/server\\.js << .API_JS./,/^API_JS$/p' /build/public/install-netadmin.sh | sed '1d;$d' > /api-out/server.js",
        '[ -s /api-out/server.js ] || { echo \"server.js extraction failed\"; exit 1; }',
        'echo PANEL_OK',
      ].join(' && ');
      const r1 = await runOneShot({
        Image: 'node:20-alpine',
        Cmd: ['sh', '-c', buildScript],
        HostConfig: {
          Binds: [
            '/opt/netadmin/web:/web:rw',
            '/opt/netadmin/api:/api-out:rw',
          ],
        },
      });
      job.logs = (r1.logs || '').slice(-4000);
      if (r1.exitCode !== 0) {
        job.status = 'error';
        job.error = 'build del panel falló';
        job.finishedAt = Date.now();
        return;
      }

      // Restart nginx to serve new web bundle immediately
      try {
        const nginx = docker.getContainer('netadmin-nginx');
        await nginx.restart();
      } catch {}

      // ── Step 2: rebuild netadmin-api with the new server.js ──
      job.message = 'Panel listo. Reconstruyendo backend API...';
      const rebuildScript = 'docker compose -f /compose/docker-compose.yml up -d --build api';
      const r2 = await runOneShot({
        Image: 'docker:cli',
        Cmd: ['sh', '-c', rebuildScript],
        HostConfig: {
          Binds: [
            '/var/run/docker.sock:/var/run/docker.sock',
            '/opt/netadmin:/compose:rw',
          ],
        },
      });
      job.logs = ((job.logs || '') + '\n--- API REBUILD ---\n' + (r2.logs || '')).slice(-6000);
      job.finishedAt = Date.now();
      if (r2.exitCode === 0) {
        job.status = 'success';
        job.message = 'Panel web y backend API actualizados';
      } else {
        job.status = 'error';
        job.error = 'rebuild del backend API falló (el panel sí se actualizó)';
      }
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      job.finishedAt = Date.now();
    }
  })();
});


// === SPEED TEST (public, no auth) ===
app.get('/api/speedtest/ping', (req, res) => {
  res.json({ ok: true, t: Date.now() });
});

app.get('/api/speedtest/download', (req, res) => {
  const sizeMB = Math.min(parseInt(req.query.size) || 1, 100); // max 100MB
  const bytes = sizeMB * 1024 * 1024;
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': bytes,
    'Cache-Control': 'no-store, no-cache',
    'X-Speed-Size': sizeMB + 'MB',
  });
  // Send random data in 1MB chunks
  const chunkSize = 1024 * 1024;
  let sent = 0;
  const sendChunk = () => {
    while (sent < bytes) {
      const remaining = bytes - sent;
      const size = Math.min(chunkSize, remaining);
      const buf = Buffer.alloc(size);
      // Fill with pseudo-random to prevent compression
      for (let i = 0; i < size; i += 4) {
        buf.writeUInt32LE(Math.random() * 0xFFFFFFFF >>> 0, i);
      }
      const canContinue = res.write(buf);
      sent += size;
      if (!canContinue) {
        res.once('drain', sendChunk);
        return;
      }
    }
    res.end();
  };
  sendChunk();
});

app.post('/api/speedtest/upload', (req, res) => {
  const size = req.headers['content-length'] || 0;
  res.json({ ok: true, received: parseInt(size), t: Date.now() });
});

// === MIKROTIK REST API PROXY ===
const MK_CONFIG_FILE = '/data/mikrotik-config.json';

function getMkConfig() {
  try { return JSON.parse(fs.readFileSync(MK_CONFIG_FILE, 'utf8')); }
  catch { return null; }
}

// Helper: connect via RouterOS API (v6/v7 API protocol, port 8728/8729)
async function mkApiConnect(config) {
  const api = new RouterOSAPI({
    host: config.host,
    port: config.port || 8728,
    user: config.user,
    password: config.password,
    timeout: 15,
  });
  await api.connect();
  return api;
}

// Helper: connect via REST API (v7 only, port 443/80)
function mkRestHeaders(config) {
  return {
    'Authorization': 'Basic ' + Buffer.from(`${config.user}:${config.password}`).toString('base64'),
    'Content-Type': 'application/json',
  };
}

// Save MikroTik connection config
app.post('/api/mikrotik/config', requireAuth, (req, res) => {
  try {
    const { host, user, password, port, version } = req.body;
    if (!host || !user) return res.status(400).json({ error: 'host y user son requeridos' });
    const config = { host, user, password, port: port || (version === 'v6' ? 8728 : 443), version: version || 'v7', updated: new Date().toISOString() };
    fs.writeFileSync(MK_CONFIG_FILE, JSON.stringify(config, null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get saved MikroTik config (without password)
app.get('/api/mikrotik/config', requireAuth, (req, res) => {
  const config = getMkConfig();
  if (!config) return res.json({});
  const { password, ...safe } = config;
  res.json(safe);
});

// Test MikroTik connection — supports both v6 API and v7 REST
app.post('/api/mikrotik/test', requireAuth, async (req, res) => {
  const config = getMkConfig();
  if (!config) return res.status(400).json({ success: false, error: 'No hay configuración MikroTik guardada. Configura primero.' });

  // RouterOS API protocol (v6 or v7 API port)
  const isApiProtocol = config.version === 'v6' || (config.port !== 443 && config.port !== 80);
  if (isApiProtocol) {
    let api;
    try {
      api = await mkApiConnect(config);
      const identity = await api.write('/system/identity/print');
      const resource = await api.write('/system/resource/print');
      const name = identity.length > 0 ? identity[0].name : config.host;
      const version = resource.length > 0 ? resource[0].version : 'v6';
      await api.close();
      return res.json({ success: true, identity: name, version });
    } catch (e) {
      if (api) try { await api.close(); } catch {}
      return res.json({ success: false, error: `API v6 error: ${e.message}. Verifica IP (${config.host}), puerto (${config.port}), usuario y contraseña. El servicio API debe estar habilitado en MikroTik (IP → Services → api).` });
    }
  }

  // REST API (v7)
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = `https://${config.host}:${config.port}/rest/system/identity`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { headers: mkRestHeaders(config), signal: controller.signal, agent });
    clearTimeout(timeout);
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.json({ success: false, error: `MikroTik respondió ${resp.status}: ${txt.slice(0, 200)}` });
    }
    const identity = await resp.json();
    let version = config.version;
    try {
      const vResp = await fetch(`https://${config.host}:${config.port}/rest/system/resource`, { headers: mkRestHeaders(config), agent });
      if (vResp.ok) { const vData = await vResp.json(); version = vData.version || version; }
    } catch {}
    res.json({ success: true, identity: identity.name || config.host, version });
  } catch (e) {
    if (e.name === 'AbortError') return res.json({ success: false, error: `Timeout conectando a ${config.host}:${config.port}` });
    res.json({ success: false, error: `Error: ${e.message}. Verifica IP, puerto y REST API habilitada.` });
  }
});

// Step commands for API protocol (v6 compatible — uses CLI-style paths)
function getStepCommandsV6(step, serverIp, totalBw, wanIface) {
  const total = Math.max(1, parseInt(totalBw) || 100);
  const dnsBw = Math.max(1, Math.round(total * 0.05));
  const voipBw = Math.max(1, Math.round(total * 0.10));
  const clientBw = Math.max(1, total - dnsBw - voipBw);
  switch (step) {
    case 1: return [
      { path: '/ip/dns/set', params: { servers: serverIp, 'allow-remote-requests': 'yes' } },
      { path: '/ip/firewall/nat/add', params: { chain: 'dstnat', protocol: 'tcp', 'dst-port': '53', action: 'dst-nat', 'to-addresses': serverIp, 'to-ports': '53', comment: 'NetAdmin: Forzar DNS TCP' } },
      { path: '/ip/firewall/nat/add', params: { chain: 'dstnat', protocol: 'udp', 'dst-port': '53', action: 'dst-nat', 'to-addresses': serverIp, 'to-ports': '53', comment: 'NetAdmin: Forzar DNS UDP' } },
    ];
    case 2: return [
      { path: '/ip/dhcp-server/network/set', params: { numbers: '0', 'dns-server': serverIp } },
      { path: '/ppp/profile/set', params: { numbers: 'default', 'dns-server': serverIp } },
    ];
    case 3: return [
      { path: '/ip/firewall/filter/add', params: { chain: 'forward', protocol: 'udp', 'dst-port': '443', action: 'drop', comment: 'NetAdmin: Bloquear QUIC' } },
      { path: '/ip/firewall/filter/add', params: { chain: 'forward', protocol: 'udp', 'dst-port': '80', action: 'drop', comment: 'NetAdmin: Bloquear HTTP/3' } },
    ];
    case 4: return [
      { path: '/ip/firewall/mangle/add', params: { chain: 'forward', 'connection-mark': 'no-mark', action: 'mark-connection', 'new-connection-mark': 'client-traffic', passthrough: 'yes', comment: 'NetAdmin: Marcar tráfico' } },
      { path: '/ip/firewall/mangle/add', params: { chain: 'forward', 'connection-mark': 'client-traffic', action: 'mark-packet', 'new-packet-mark': 'client-packets', passthrough: 'no', comment: 'NetAdmin: Paquetes clientes' } },
      { path: '/ip/firewall/mangle/add', params: { chain: 'forward', protocol: 'udp', 'dst-port': '53', action: 'mark-packet', 'new-packet-mark': 'dns-priority', passthrough: 'no', comment: 'NetAdmin: DNS prioridad' } },
      { path: '/ip/firewall/mangle/add', params: { chain: 'forward', protocol: 'udp', 'dst-port': '5060-5061', action: 'mark-packet', 'new-packet-mark': 'voip-priority', passthrough: 'no', comment: 'NetAdmin: VoIP prioridad' } },
    ];
    case 5: return [
      { path: '/queue/tree/add', params: { name: 'Total-Download', parent: 'global', 'max-limit': `${total}M`, comment: `NetAdmin: BW total ${total}M` } },
      { path: '/queue/tree/add', params: { name: 'DNS-Priority', parent: 'Total-Download', 'packet-mark': 'dns-priority', priority: '1', 'max-limit': `${dnsBw}M` } },
      { path: '/queue/tree/add', params: { name: 'VoIP-Priority', parent: 'Total-Download', 'packet-mark': 'voip-priority', priority: '2', 'max-limit': `${voipBw}M` } },
      { path: '/queue/tree/add', params: { name: 'Client-Traffic', parent: 'Total-Download', 'packet-mark': 'client-packets', priority: '5', 'max-limit': `${clientBw}M` } },
    ];
    case 6: return [
      { path: '/ppp/profile/add', params: { name: 'plan-10mbps', 'rate-limit': '10M/10M', 'dns-server': serverIp, comment: 'NetAdmin: Plan 10Mbps' } },
    ];
    case 7: return [
      { path: '/ip/firewall/mangle/add', params: { chain: 'forward', protocol: 'tcp', 'tcp-flags': 'syn', action: 'change-mss', 'new-mss': 'clamp-to-pmtu', passthrough: 'yes', comment: 'NetAdmin: MSS Clamp forward' } },
      { path: '/ip/firewall/mangle/add', params: { chain: 'postrouting', protocol: 'tcp', 'tcp-flags': 'syn', action: 'change-mss', 'new-mss': 'clamp-to-pmtu', passthrough: 'yes', comment: 'NetAdmin: MSS Clamp postrouting' } },
    ];
    case 8: return [
      { path: '/ip/firewall/connection/tracking/set', params: { 'udp-timeout': '30s', 'udp-stream-timeout': '120s', 'icmp-timeout': '10s', 'generic-timeout': '120s', 'tcp-close-timeout': '10s', 'tcp-close-wait-timeout': '10s', 'tcp-fin-wait-timeout': '10s', 'tcp-last-ack-timeout': '10s', 'tcp-time-wait-timeout': '10s', 'tcp-syn-sent-timeout': '30s', 'tcp-syn-received-timeout': '10s', 'tcp-established-timeout': '7200s' } },
    ];
    case 9: return [
      { path: '/ip/firewall/mangle/add', params: { chain: 'postrouting', action: 'change-ttl', 'new-ttl': 'set:64', passthrough: 'yes', comment: 'NetAdmin Stealth: TTL normalize 64' } },
      { path: '/ip/firewall/mangle/add', params: { chain: 'forward', action: 'change-ttl', 'new-ttl': 'set:64', passthrough: 'yes', comment: 'NetAdmin Stealth: TTL forward 64' } },
      { path: '/ip/firewall/filter/add', params: { chain: 'forward', protocol: 'tcp', 'connection-limit': '200,32', action: 'drop', comment: 'NetAdmin Stealth: Limit TCP conn' } },
      { path: '/ip/firewall/filter/add', params: { chain: 'forward', protocol: 'udp', 'connection-limit': '100,32', action: 'drop', comment: 'NetAdmin Stealth: Limit UDP conn' } },
      { path: '/ip/firewall/mangle/add', params: { chain: 'postrouting', protocol: 'tcp', 'tcp-flags': 'syn', action: 'change-mss', 'new-mss': '1360', passthrough: 'yes', comment: 'NetAdmin Stealth: Uniform MSS 1360' } },
    ];
    case 10: {
      const iface = wanIface || 'ether1';
      // NOTE: /queue/type does NOT accept `comment` (would fail with "unknown parameter comment")
      // NOTE: /queue/interface does NOT have `add` — interfaces always exist; use `set` with numbers=<iface_name>
      // NOTE: /queue/interface/set does NOT accept `comment` either
      return [
        { path: '/queue/type/add', params: { name: 'fq-codel-wan', kind: 'fq-codel', 'fq-codel-target': '5ms', 'fq-codel-interval': '100ms', 'fq-codel-quantum': '1514', 'fq-codel-limit': '10240', 'fq-codel-flows': '1024' } },
        { path: '/queue/interface/set', params: { numbers: iface, queue: 'fq-codel-wan' } },
      ];
    }
    default: return [];
  }
}

// Step commands for REST API (v7)
function getStepCommandsV7(step, serverIp, totalBw, wanIface) {
  const total = Math.max(1, parseInt(totalBw) || 100);
  const dnsBw = Math.max(1, Math.round(total * 0.05));
  const voipBw = Math.max(1, Math.round(total * 0.10));
  const clientBw = Math.max(1, total - dnsBw - voipBw);
  switch (step) {
    case 1: return [
      { method: 'POST', endpoint: '/rest/ip/dns/set', body: { servers: serverIp, 'allow-remote-requests': 'yes' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/nat', body: { chain: 'dstnat', protocol: 'tcp', 'dst-port': '53', action: 'dst-nat', 'to-addresses': serverIp, 'to-ports': '53', comment: 'NetAdmin: Forzar DNS TCP' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/nat', body: { chain: 'dstnat', protocol: 'udp', 'dst-port': '53', action: 'dst-nat', 'to-addresses': serverIp, 'to-ports': '53', comment: 'NetAdmin: Forzar DNS UDP' } },
    ];
    case 2: return [
      { method: 'POST', endpoint: '/rest/ip/dhcp-server/network/set', body: { numbers: '*0', 'dns-server': serverIp } },
      { method: 'POST', endpoint: '/rest/ppp/profile/set', body: { numbers: 'default', 'dns-server': serverIp } },
    ];
    case 3: return [
      { method: 'PUT', endpoint: '/rest/ip/firewall/filter', body: { chain: 'forward', protocol: 'udp', 'dst-port': '443', action: 'drop', comment: 'NetAdmin: Bloquear QUIC' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/filter', body: { chain: 'forward', protocol: 'udp', 'dst-port': '80', action: 'drop', comment: 'NetAdmin: Bloquear HTTP/3' } },
    ];
    case 4: return [
      { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', 'connection-mark': 'no-mark', action: 'mark-connection', 'new-connection-mark': 'client-traffic', passthrough: 'yes', comment: 'NetAdmin: Marcar tráfico' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', 'connection-mark': 'client-traffic', action: 'mark-packet', 'new-packet-mark': 'client-packets', passthrough: 'no', comment: 'NetAdmin: Paquetes clientes' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', protocol: 'udp', 'dst-port': '53', action: 'mark-packet', 'new-packet-mark': 'dns-priority', passthrough: 'no', comment: 'NetAdmin: DNS prioridad' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', protocol: 'udp', 'dst-port': '5060-5061', action: 'mark-packet', 'new-packet-mark': 'voip-priority', passthrough: 'no', comment: 'NetAdmin: VoIP prioridad' } },
    ];
    case 5: return [
      { method: 'PUT', endpoint: '/rest/queue/tree', body: { name: 'Total-Download', parent: 'global', 'max-limit': `${total}M`, comment: `NetAdmin: BW total ${total}M` } },
      { method: 'PUT', endpoint: '/rest/queue/tree', body: { name: 'DNS-Priority', parent: 'Total-Download', 'packet-mark': 'dns-priority', priority: '1', 'max-limit': `${dnsBw}M` } },
      { method: 'PUT', endpoint: '/rest/queue/tree', body: { name: 'VoIP-Priority', parent: 'Total-Download', 'packet-mark': 'voip-priority', priority: '2', 'max-limit': `${voipBw}M` } },
      { method: 'PUT', endpoint: '/rest/queue/tree', body: { name: 'Client-Traffic', parent: 'Total-Download', 'packet-mark': 'client-packets', priority: '5', 'max-limit': `${clientBw}M` } },
    ];
    case 6: return [
      { method: 'PUT', endpoint: '/rest/ppp/profile', body: { name: 'plan-10mbps', 'rate-limit': '10M/10M', 'dns-server': serverIp, comment: 'NetAdmin: Plan 10Mbps' } },
    ];
    case 7: return [
      { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', protocol: 'tcp', 'tcp-flags': 'syn', action: 'change-mss', 'new-mss': 'clamp-to-pmtu', passthrough: 'yes', comment: 'NetAdmin: MSS Clamp forward' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'postrouting', protocol: 'tcp', 'tcp-flags': 'syn', action: 'change-mss', 'new-mss': 'clamp-to-pmtu', passthrough: 'yes', comment: 'NetAdmin: MSS Clamp postrouting' } },
    ];
    case 8: return [
      { method: 'POST', endpoint: '/rest/ip/firewall/connection/tracking/set', body: { 'udp-timeout': '30s', 'udp-stream-timeout': '120s', 'icmp-timeout': '10s', 'generic-timeout': '120s', 'tcp-close-timeout': '10s', 'tcp-close-wait-timeout': '10s', 'tcp-fin-wait-timeout': '10s', 'tcp-last-ack-timeout': '10s', 'tcp-time-wait-timeout': '10s', 'tcp-syn-sent-timeout': '30s', 'tcp-syn-received-timeout': '10s', 'tcp-established-timeout': '7200s' } },
    ];
    case 9: return [
      { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'postrouting', action: 'change-ttl', 'new-ttl': 'set:64', passthrough: 'yes', comment: 'NetAdmin Stealth: TTL normalize 64' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', action: 'change-ttl', 'new-ttl': 'set:64', passthrough: 'yes', comment: 'NetAdmin Stealth: TTL forward 64' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/filter', body: { chain: 'forward', protocol: 'tcp', 'connection-limit': '200,32', action: 'drop', comment: 'NetAdmin Stealth: Limit TCP conn' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/filter', body: { chain: 'forward', protocol: 'udp', 'connection-limit': '100,32', action: 'drop', comment: 'NetAdmin Stealth: Limit UDP conn' } },
      { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'postrouting', protocol: 'tcp', 'tcp-flags': 'syn', action: 'change-mss', 'new-mss': '1360', passthrough: 'yes', comment: 'NetAdmin Stealth: Uniform MSS 1360' } },
    ];
    case 10: {
      const iface = wanIface || 'ether1';
      // NOTE: /queue/type does NOT accept `comment` (would fail with "unknown parameter comment")
      // NOTE: /rest/queue/interface does NOT have POST/PUT for `add` — interfaces always exist; use PATCH on /rest/queue/interface/{iface}
      // NOTE: /rest/queue/interface does NOT accept `comment` either
      return [
        { method: 'PUT', endpoint: '/rest/queue/type', body: { name: 'fq-codel-wan', kind: 'fq-codel', 'fq-codel-target': '5ms', 'fq-codel-interval': '100ms', 'fq-codel-quantum': '1514', 'fq-codel-limit': '10240', 'fq-codel-flows': '1024' } },
        { method: 'PATCH', endpoint: `/rest/queue/interface/${encodeURIComponent(iface)}`, body: { queue: 'fq-codel-wan' } },
      ];
    }
    default: return [];
  }
}

// Execute commands on MikroTik — dual v6/v7
app.post('/api/mikrotik/execute', requireAuth, async (req, res) => {
  const config = getMkConfig();
  if (!config) return res.status(400).json({ success: false, error: 'No hay configuración MikroTik guardada' });
  const { commands } = req.body;
  if (!commands || !Array.isArray(commands)) return res.status(400).json({ success: false, error: 'commands debe ser un array' });

  const isApiProtocol = config.version === 'v6' || (config.port !== 443 && config.port !== 80);
  const results = [];

  for (const cmd of commands) {
    if (cmd === 'interfaces:list') {
      if (isApiProtocol) {
        let api;
        try {
          api = await mkApiConnect(config);
          const interfaceList = await api.write('/interface/print');
          await api.close();
          results.push({ cmd, success: true, result: interfaceList });
        } catch (e) {
          if (api) try { await api.close(); } catch {}
          results.push({ cmd, success: false, error: `No se pudieron leer las interfaces: ${e.message}` });
        }
      } else {
        try {
          const agent = new https.Agent({ rejectUnauthorized: false });
          const r = await fetch(`https://${config.host}:${config.port}/rest/interface`, {
            headers: mkRestHeaders(config),
            agent,
          });
          const text = await r.text().catch(() => '');
          if (!r.ok) {
            results.push({ cmd, success: false, error: `MikroTik respondió ${r.status}: ${text.slice(0, 200)}` });
          } else {
            results.push({ cmd, success: true, result: text ? JSON.parse(text) : [] });
          }
        } catch (e) {
          results.push({ cmd, success: false, error: `No se pudieron leer las interfaces: ${e.message}` });
        }
      }
      continue;
    }

    // ── Generic passthrough: "METHOD /rest/path [JSON_BODY_OR_QUERY]" ──
    // Supported: GET, POST, PUT, PATCH, DELETE. Requires REST (v7, port 443/80).
    const genericMatch = typeof cmd === 'string' && cmd.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/rest\/[^\s?]+)(\?[^\s]*)?(\s+(.+))?$/i);
    if (genericMatch && !isApiProtocol) {
      const method = genericMatch[1].toUpperCase();
      const pathBase = genericMatch[2];
      const queryStr = genericMatch[3] || '';
      const bodyStr = genericMatch[5];
      try {
        const agent = new https.Agent({ rejectUnauthorized: false });
        const baseUrl = `https://${config.host}:${config.port}${pathBase}`;

        // Special: DELETE /rest/<path>?comment=... or ?name=... → find then remove
        if (method === 'DELETE' && queryStr) {
          const params = new URLSearchParams(queryStr.slice(1));
          const filterKey = params.has('comment') ? 'comment' : params.has('name') ? 'name' : null;
          if (!filterKey) {
            results.push({ cmd, success: false, error: 'DELETE requiere ?comment=... o ?name=...' });
            continue;
          }
          const filterVal = params.get(filterKey);
          const listRes = await fetch(baseUrl, { headers: mkRestHeaders(config), agent });
          const listText = await listRes.text().catch(() => '');
          if (!listRes.ok) {
            results.push({ cmd, success: false, error: `MikroTik ${listRes.status} listando: ${listText.slice(0, 200)}` });
            continue;
          }
          const rows = listText ? JSON.parse(listText) : [];
          const matches = (Array.isArray(rows) ? rows : []).filter((r) => {
            const v = r && r[filterKey];
            return typeof v === 'string' && v.includes(filterVal);
          });
          if (matches.length === 0) {
            results.push({ cmd, success: true, result: { removed: 0, note: 'no había entradas con ese ' + filterKey } });
            continue;
          }
          let removed = 0;
          const errors = [];
          for (const row of matches) {
            const id = row['.id'] || row.id;
            if (!id) continue;
            const delRes = await fetch(`${baseUrl}/${encodeURIComponent(id)}`, {
              method: 'DELETE',
              headers: mkRestHeaders(config),
              agent,
            });
            if (delRes.ok) removed += 1;
            else errors.push(`${id}: ${delRes.status}`);
          }
          if (errors.length) {
            results.push({ cmd, success: removed > 0, result: { removed }, error: errors.join('; ') });
          } else {
            results.push({ cmd, success: true, result: { removed } });
          }
          continue;
        }

        // GET / POST / PUT / PATCH
        const fetchOpts = { method, headers: mkRestHeaders(config), agent };
        if (bodyStr && method !== 'GET') {
          fetchOpts.body = bodyStr;
        }
        const url = baseUrl + (method === 'GET' ? queryStr : '');
        const r = await fetch(url, fetchOpts);
        const text = await r.text().catch(() => '');
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        if (!r.ok) {
          results.push({
            cmd,
            success: false,
            error: `MikroTik ${r.status}: ${(typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed)).slice(0, 300)}`,
          });
        } else {
          results.push({ cmd, success: true, result: parsed });
        }
      } catch (e) {
        results.push({ cmd, success: false, error: `Error REST: ${e.message}` });
      }
      continue;
    }

    if (!cmd.startsWith('step:')) {
      results.push({
        cmd,
        success: false,
        error: isApiProtocol
          ? `Comando no soportado en API RouterOS v6 (use 'step:N' o 'interfaces:list'): ${String(cmd).slice(0, 80)}`
          : `Comando no reconocido. Use 'METHOD /rest/path [body]' o 'step:N'. Recibido: ${String(cmd).slice(0, 80)}`,
      });
      continue;
    }

    if (!cmd.startsWith('step:')) continue;
    const parts = cmd.split(':');
    const stepNum = parseInt(parts[1]);
    const serverIp = parts[2] || config.host;
    // Optional 4th parameter: total bandwidth in Mbps (used by step:5 Queue Tree)
    // Optional 5th parameter: WAN interface name (used by step:10 FQ_CODEL)
    const totalBw = parts[3] ? parseInt(parts[3]) : undefined;
    const wanIface = parts[4] || undefined;

    if (isApiProtocol) {
      // RouterOS API protocol
      const stepCmds = getStepCommandsV6(stepNum, serverIp, totalBw, wanIface);
      if (stepCmds.length === 0) { results.push({ cmd, success: false, error: `Paso ${stepNum} no definido` }); continue; }
      let api;
      try {
        api = await mkApiConnect(config);
        let allOk = true;
        const stepResults = [];
        for (const sc of stepCmds) {
          try {
            const params = Object.entries(sc.params).map(([k, v]) => `=${k}=${v}`);
            const result = await api.write(sc.path, params);
            stepResults.push({ path: sc.path, ok: true, result });
          } catch (e) {
            // "already have" errors are OK
            if (e.message && (e.message.includes('already') || e.message.includes('failure: already'))) {
              stepResults.push({ path: sc.path, ok: true, note: 'Ya existe' });
            } else {
              allOk = false;
              stepResults.push({ path: sc.path, error: e.message });
            }
          }
        }
        await api.close();
        results.push({ cmd, success: allOk, details: stepResults });
      } catch (e) {
        if (api) try { await api.close(); } catch {}
        results.push({ cmd, success: false, error: `Conexión API falló: ${e.message}` });
      }
    } else {
      // REST API v7
      const agent = new https.Agent({ rejectUnauthorized: false });
      const baseUrl = `https://${config.host}:${config.port}`;
      const stepCmds = getStepCommandsV7(stepNum, serverIp, totalBw, wanIface);
      if (stepCmds.length === 0) { results.push({ cmd, success: false, error: `Paso ${stepNum} no definido` }); continue; }
      let allOk = true;
      const stepResults = [];
      for (const sc of stepCmds) {
        try {
          const fetchOpts = { method: sc.method, headers: mkRestHeaders(config), agent };
          if (sc.body) fetchOpts.body = JSON.stringify(sc.body);
          const r = await fetch(`${baseUrl}${sc.endpoint}`, fetchOpts);
          const txt = await r.text().catch(() => '');
          if (!r.ok && r.status !== 409) { allOk = false; stepResults.push({ endpoint: sc.endpoint, status: r.status, error: txt.slice(0, 200) }); }
          else { stepResults.push({ endpoint: sc.endpoint, status: r.status, ok: true }); }
        } catch (e) { allOk = false; stepResults.push({ endpoint: sc.endpoint, error: e.message }); }
      }
      results.push({ cmd, success: allOk, details: stepResults });
    }
  }

  const allSuccess = results.length > 0 && results.every(r => r.success);
  res.json({ success: allSuccess, message: allSuccess ? 'Comandos ejecutados correctamente' : 'Algunos comandos fallaron', results });
});

// === TELEGRAM ALERTS ===
const TELEGRAM_CONFIG_FILE = '/data/tunnel/telegram-config.json';

function getTelegramConfig() {
  try { return JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf8')); }
  catch { return { botToken: '', chatId: '', enabled: false }; }
}

app.get('/api/telegram/config', requireAuth, (req, res) => {
  const config = getTelegramConfig();
  res.json({ chatId: config.chatId || '', enabled: !!config.enabled, configured: !!(config.botToken && config.chatId) });
});

app.post('/api/telegram/config', requireAuth, (req, res) => {
  try {
    const { botToken, chatId, enabled } = req.body;
    const config = { botToken: botToken || '', chatId: chatId || '', enabled: !!enabled, updated: new Date().toISOString() };
    fs.writeFileSync(TELEGRAM_CONFIG_FILE, JSON.stringify(config, null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/telegram/test', requireAuth, async (req, res) => {
  const config = getTelegramConfig();
  if (!config.botToken || !config.chatId) return res.status(400).json({ error: 'Bot Token y Chat ID requeridos' });
  try {
    const msg = '🔔 *NetAdmin* — Test de conexión exitoso\\n✅ Las alertas de Telegram están funcionando.';
    const r = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: msg, parse_mode: 'Markdown' }),
    });
    const data = await r.json();
    if (data.ok) res.json({ success: true });
    else res.json({ success: false, error: data.description || 'Error de Telegram' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/telegram/alert', requireAuth, async (req, res) => {
  const config = getTelegramConfig();
  if (!config.botToken || !config.chatId || !config.enabled) return res.status(400).json({ error: 'Telegram no configurado o desactivado' });
  try {
    const { message } = req.body;
    const r = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: message, parse_mode: 'Markdown' }),
    });
    const data = await r.json();
    res.json({ success: data.ok });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`NetAdmin API v4.0 → http://0.0.0.0:${API_PORT}`);
  // Auto-bootstrap blocklists: espera a AdGuard, limpia filtros viejos, registra los 4 NetAdmin
  (async () => {
    ensureBlocklistDir();
    for (const cat of BLOCKLIST_CATEGORIES) {
      if (!fs.existsSync(BLOCKLIST_FILES[cat])) writeCategory(cat, []);
    }
    for (let i = 0; i < 30; i++) {
      try {
        await ensureAdguardConfigured();
        await postAdguard('/control/filtering/refresh', { whitelist: false });
        console.log('[blocklist] AdGuard configurado: 4 filtros NetAdmin registrados vía http://netadmin-nginx/blocklists/');
        return;
      } catch (e) {
        if (i === 29) console.warn(`[blocklist] No se pudo auto-configurar AdGuard tras 30 intentos: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  })();
});
API_JS

cat > ${NETADMIN_DIR}/api/Dockerfile << 'DOCKERFILE'
FROM node:20-alpine
WORKDIR /app
# Install docker-cli + docker-compose so the API can manage Cloudflare tunnel and other containers
RUN apk add --no-cache docker-cli docker-cli-compose curl bash
COPY package.json .
RUN npm install --production --silent
COPY server.js .
EXPOSE 4000
CMD ["node", "server.js"]
DOCKERFILE

# ============================================================
# 7. PING MONITOR CONTAINER
# ============================================================
log "Generando monitor de ping..."

cat > ${NETADMIN_DIR}/configs/ping-monitor.sh << 'PING_SCRIPT'
#!/bin/sh
LOG_DIR="/data"
WAS_DOWN=false
while true; do
  TS=$(date '+%Y-%m-%d %H:%M:%S')
  LOG_FILE="$LOG_DIR/ping-$(date +%Y-%m-%d).log"
  RESULT=$(ping -c 1 -W 3 8.8.8.8 2>/dev/null)
  if [ $? -eq 0 ]; then
    LAT=$(echo "$RESULT" | grep 'time=' | sed 's/.*time=\([0-9.]*\).*/\1/')
    echo "$TS|OK|${LAT}" >> "$LOG_FILE"
    if [ "$WAS_DOWN" = "true" ]; then
      echo "$TS|RECOVERED" >> "$LOG_DIR/downtime.log"
      WAS_DOWN=false
    fi
  else
    echo "$TS|FAIL|0" >> "$LOG_FILE"
    if [ "$WAS_DOWN" = "false" ]; then
      echo "$TS|DOWN" >> "$LOG_DIR/downtime.log"
      WAS_DOWN=true
    fi
  fi
  sleep 5
done
PING_SCRIPT
chmod +x ${NETADMIN_DIR}/configs/ping-monitor.sh
# Fix line endings (remove Windows CRLF) on all generated scripts
sed -i 's/\r$//' ${NETADMIN_DIR}/configs/ping-monitor.sh

# ============================================================
# 8. NGINX CONFIG
# ============================================================
log "Generando configuración Nginx..."

NGINX_CACHE_MB=$((NGINX_CACHE_GB * 1000))
cat > ${NETADMIN_DIR}/configs/nginx.conf << NGINX_CONF
worker_processes auto;
events { worker_connections 1024; }

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    gzip on;
    client_max_body_size 50m;

    # Panel Web + API proxy
    server {
        listen 80;
        server_name _;
        root /var/www/netadmin;
        index index.html;

        location / {
            try_files \$uri \$uri/ /index.html;
        }

        # Blocklists públicas — AdGuard las descarga como cualquier filter URL.
        # Son listas de bloqueo (no datos sensibles), exponerlas públicamente es seguro
        # y permite que aparezcan en la UI de AdGuard como "listas remotas" normales.
        location /blocklists/ {
            alias /var/blocklists/;
            default_type text/plain;
            charset utf-8;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header X-NetAdmin-Blocklist "1";
            add_header Access-Control-Allow-Origin "*";
            autoindex on;
            autoindex_exact_size off;
        }

        # Speed test API (public, no auth, higher timeout + body size)
        location /api/speedtest/ {
            proxy_pass http://netadmin-api:4000;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_read_timeout 120s;
            proxy_send_timeout 120s;
            client_max_body_size 50m;
        }

        # Long-running system ops (update-docker, update-panel): 10 min timeout
        location /api/system/ {
            proxy_pass http://netadmin-api:4000;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_connect_timeout 600s;
            proxy_read_timeout 600s;
            proxy_send_timeout 600s;
            proxy_buffering off;
        }

        location /api/ {
            proxy_pass http://netadmin-api:4000;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_read_timeout 30s;
        }

        location = /adguard {
            return 302 http://\$host:3000/;
        }

        location /adguard/ {
            return 302 http://\$host:3000/;
        }

        location /kuma/ {
            proxy_pass http://netadmin-kuma:3001/;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }

    # CDN Cache (puerto 8888)
    proxy_cache_path /var/cache/nginx/cdn levels=1:2 keys_zone=cdn_cache:200m max_size=${NGINX_CACHE_GB}g inactive=30d use_temp_path=off;

    server {
        listen 8888;
        server_name _;
        add_header X-Cache-Status \$upstream_cache_status always;

        location / {
            proxy_cache cdn_cache;
            proxy_cache_valid 200 302 30d;
            proxy_cache_valid 404 1m;
            proxy_cache_use_stale error timeout updating;
            proxy_cache_lock on;
            proxy_buffering on;
            proxy_max_temp_file_size 4096m;
            proxy_set_header Host \$host;
            proxy_pass http://\$host\$request_uri;
        }
    }
}
NGINX_CONF

# Crear página de espera
mkdir -p ${NETADMIN_DIR}/web
cat > ${NETADMIN_DIR}/web/index.html << 'WAIT_HTML'
<!DOCTYPE html>
<html><head><title>NetAdmin</title>
<style>body{background:#0f1419;color:#14b8a6;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.c{text-align:center}h1{font-size:2rem}p{color:#64748b;margin-top:1rem}</style></head>
<body><div class="c"><h1>NetAdmin v4.0</h1><p>Panel instalado. Sube el build del frontend.</p>
<p>scp -r dist/* root@tu-vps:/opt/netadmin/web/</p></div></body></html>
WAIT_HTML

# ============================================================
# 9. BLOCKLISTS + CRON UPDATER
# ============================================================
mkdir -p ${NETADMIN_DIR}/data/adguard/conf/blocklists
cat > ${NETADMIN_DIR}/data/adguard/conf/blocklists/colombia_mintic.txt << 'BLOCKLIST'
# NetAdmin — Lista Colombia (MinTIC + Coljuegos + Infantil)
# Actualizada automáticamente cada 24h
BLOCKLIST

# Script de actualización automática de listas gubernamentales
cat > ${NETADMIN_DIR}/configs/update-blocklists.sh << 'UPDATER'
#!/bin/bash
# ============================================================
# NetAdmin — Actualizador automático de listas de bloqueo
# Fuentes: MinTIC, Coljuegos, listas infantiles
# Se ejecuta cada 24 horas via cron
# ============================================================

LOG_DIR="/data/logs"
BLOCKLIST_DIR="/data/blocklists"
ADGUARD_URL="http://netadmin-adguard:3000"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
mkdir -p "$LOG_DIR" "$BLOCKLIST_DIR"

log() { echo "[$TIMESTAMP] $1" >> "$LOG_DIR/blocklist-updates.log"; echo "$1"; }

log "══ Iniciando actualización de listas ══"

# ── 1. FUENTES DE LISTAS ──
# MinTIC Colombia — resoluciones de bloqueo
# Coljuegos — sitios de apuestas ilegales  
# Listas de protección infantil
SOURCES=(
  "https://raw.githubusercontent.com/nickoppen/pihole-blocklists/master/gambling-co.txt|Coljuegos - Apuestas ilegales"
  "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-gambling-porn/hosts|Protección infantil + Gambling"
  "https://raw.githubusercontent.com/bigdargon/hostsVN/master/option/gambling.txt|Gambling internacional"
  "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/native.winoffice.txt|Telemetría Windows/Office"
  "https://adguardteam.github.io/HostlistsRegistry/assets/filter_44.txt|OISD Small (ads+tracking)"
)

TEMP_FILE=$(mktemp)
DOMAINS_ADDED=0
SOURCES_OK=0
SOURCES_FAIL=0

for SOURCE in "${SOURCES[@]}"; do
  URL="${SOURCE%%|*}"
  NAME="${SOURCE##*|}"
  
  log "  Descargando: $NAME"
  if wget -q -O "$TEMP_FILE" "$URL" 2>/dev/null; then
    # Limpiar y formatear: extraer dominios válidos
    COUNT=$(grep -v '^#' "$TEMP_FILE" | grep -v '^\s*$' | \
      sed 's/^0\.0\.0\.0\s*//' | sed 's/^127\.0\.0\.1\s*//' | \
      sed 's/\s*#.*//' | sed 's/\r//' | \
      grep -E '^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$' | \
      sort -u | tee -a "${BLOCKLIST_DIR}/all_domains.tmp" | wc -l)
    
    DOMAINS_ADDED=$((DOMAINS_ADDED + COUNT))
    SOURCES_OK=$((SOURCES_OK + 1))
    log "    ✓ $COUNT dominios extraídos"
  else
    SOURCES_FAIL=$((SOURCES_FAIL + 1))
    log "    ✗ Error descargando $NAME"
  fi
done
rm -f "$TEMP_FILE"

# ── 2. LIMPIAR Y DEDUPLICAR ──
if [ -f "${BLOCKLIST_DIR}/all_domains.tmp" ]; then
  # Leer lista personalizada (dominios manuales)
  CUSTOM_FILE="${BLOCKLIST_DIR}/colombia_custom.txt"
  [ ! -f "$CUSTOM_FILE" ] && touch "$CUSTOM_FILE"
  
  # Combinar todo, deduplicar, ordenar
  FINAL_FILE="${BLOCKLIST_DIR}/colombia_mintic.txt"
  {
    echo "# NetAdmin — Lista Colombia consolidada"
    echo "# Última actualización: $TIMESTAMP"
    echo "# Fuentes: MinTIC, Coljuegos, protección infantil"
    echo "# Total fuentes: $SOURCES_OK exitosas, $SOURCES_FAIL fallidas"
    echo "#"
    # Dominios de todas las fuentes + custom
    cat "${BLOCKLIST_DIR}/all_domains.tmp" "$CUSTOM_FILE" 2>/dev/null | \
      grep -v '^#' | grep -v '^\s*$' | \
      tr '[:upper:]' '[:lower:]' | \
      sort -u
  } > "$FINAL_FILE"
  
  TOTAL=$(grep -v '^#' "$FINAL_FILE" | grep -v '^\s*$' | wc -l)
  rm -f "${BLOCKLIST_DIR}/all_domains.tmp"
  
  log "  Total dominios únicos: $TOTAL"
  
  # Copiar a AdGuard
  cp "$FINAL_FILE" /data/adguard-blocklist/colombia_mintic.txt 2>/dev/null || true
fi

# ── 3. NOTIFICAR A ADGUARD PARA RECARGAR FILTROS ──
log "  Recargando filtros en AdGuard..."
COOKIE_JAR=$(mktemp)
LOGIN_PAYLOAD='{"name":"admin","password":"'"${PANEL_PASS}"'"}'
LOGIN_RESULT=$(wget -q -S --save-cookies "$COOKIE_JAR" --keep-session-cookies \
  --header='Content-Type: application/json' \
  --post-data="$LOGIN_PAYLOAD" \
  -O- "${ADGUARD_URL}/control/login" 2>&1) || true
RELOAD_RESULT=$(wget -q -S --load-cookies "$COOKIE_JAR" \
  --header='Content-Type: application/json' \
  --post-data='{}' -O- "${ADGUARD_URL}/control/filtering/refresh" 2>&1) || true
rm -f "$COOKIE_JAR"
log "  AdGuard login: ${LOGIN_RESULT:-OK}"
log "  AdGuard reload: ${RELOAD_RESULT:-OK}"

# ── 4. GUARDAR ESTADO ──
cat > "$LOG_DIR/last-update.json" << JSONSTATE
{
  "timestamp": "$TIMESTAMP",
  "sources_ok": $SOURCES_OK,
  "sources_fail": $SOURCES_FAIL,
  "domains_total": ${TOTAL:-0},
  "status": "$([ $SOURCES_FAIL -eq 0 ] && echo 'success' || echo 'partial')"
}
JSONSTATE

log "══ Actualización completada: $TOTAL dominios ══"
UPDATER
chmod +x ${NETADMIN_DIR}/configs/update-blocklists.sh

# Script wrapper para cron (ejecuta cada 24h)
cat > ${NETADMIN_DIR}/configs/cron-entry.sh << 'CRON_ENTRY'
#!/bin/bash
# Ejecutar actualización inmediata al iniciar
/update-blocklists.sh

# Luego cada 24 horas
while true; do
  sleep 86400
  /update-blocklists.sh
done
CRON_ENTRY
chmod +x ${NETADMIN_DIR}/configs/cron-entry.sh
sed -i 's/\r$//' ${NETADMIN_DIR}/configs/update-blocklists.sh
sed -i 's/\r$//' ${NETADMIN_DIR}/configs/cron-entry.sh

# ============================================================
# 10. DOCKER COMPOSE — TODOS LOS SERVICIOS
# ============================================================
log "Generando docker-compose.yml..."

cat > ${NETADMIN_DIR}/docker-compose.yml << COMPOSE
services:
  # ── DNS Recursivo ──
  unbound:
    image: mvance/unbound:latest
    container_name: netadmin-unbound
    volumes:
      - ./configs/unbound.conf:/etc/unbound/unbound.conf:ro
      - ./configs/root.hints:/etc/unbound/root.hints:ro
      - ./configs/forward-records.conf:/etc/unbound/forward-records.conf:rw
      - ./data/unbound:/var/lib/unbound
    networks:
      netadmin:
        ipv4_address: 172.20.0.10
    restart: unless-stopped

  # ── Filtrado DNS ──
  adguard:
    image: adguard/adguardhome:latest
    container_name: netadmin-adguard
    volumes:
      - ./data/adguard/work:/opt/adguardhome/work
      - ./data/adguard/conf:/opt/adguardhome/conf
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "3000:3000/tcp"
    environment:
      - UPSTREAM_DNS=172.20.0.10
    depends_on:
      - unbound
    networks:
      netadmin:
        ipv4_address: 172.20.0.11
    restart: unless-stopped

  # ── Proxy Caché SSL Bump ──
  squid:
    build:
      context: .
      dockerfile: Dockerfile.squid
    container_name: netadmin-squid
    volumes:
      - ./data/squid-cache:/var/cache/squid
      - ./data/squid-logs:/var/log/squid
      - ./certs/netadmin-ca.pem:/etc/squid/ssl_cert/netadmin-ca.pem:ro
    ports:
      - "3128:3128"
      - "3129:3129"
      - "3130:3130"
    networks:
      netadmin:
        ipv4_address: 172.20.0.12
    restart: unless-stopped

  # ── Caché Repos Linux ──
  apt-cacher:
    image: sameersbn/apt-cacher-ng:latest
    container_name: netadmin-apt-cacher
    volumes:
      - ./data/apt-cache:/var/cache/apt-cacher-ng
    ports:
      - "3142:3142"
    networks:
      netadmin:
        ipv4_address: 172.20.0.13
    restart: unless-stopped

  # ── Caché Gaming/Windows ──
  lancache-dns:
    image: lancachenet/lancache-dns:latest
    container_name: netadmin-lancache-dns
    environment:
      - USE_GENERIC_CACHE=true
      - LANCACHE_IP=172.20.0.15
      - UPSTREAM_DNS=172.20.0.10
    networks:
      netadmin:
        ipv4_address: 172.20.0.14
    depends_on:
      - unbound
    restart: unless-stopped

  lancache:
    image: lancachenet/monolithic:latest
    container_name: netadmin-lancache
    environment:
      - CACHE_MEM_SIZE=${LANCACHE_CACHE_MEM}m
      - CACHE_DISK_SIZE=${LANCACHE_CACHE_GB}g
      - CACHE_MAX_AGE=30d
      - NGINX_WORKER_PROCESSES=auto
    volumes:
      - ./data/lancache/data:/data/cache
      - ./data/lancache/logs:/data/logs
    ports:
      - "8880:80"
    networks:
      netadmin:
        ipv4_address: 172.20.0.15
    restart: unless-stopped

  # ── Monitoreo ──
  kuma:
    image: louislam/uptime-kuma:1
    container_name: netadmin-kuma
    volumes:
      - ./data/kuma:/app/data
    ports:
      - "3001:3001"
    networks:
      netadmin:
        ipv4_address: 172.20.0.16
    restart: unless-stopped

  # ── Monitor de Ping ──
  ping:
    image: alpine:latest
    container_name: netadmin-ping
    volumes:
      - ./configs/ping-monitor.sh:/ping-monitor.sh:ro
      - ./data/ping-logs:/data
    command: ["/bin/sh", "/ping-monitor.sh"]
    networks:
      netadmin:
        ipv4_address: 172.20.0.17
    restart: unless-stopped

  # ── Cron: Actualización automática de listas ──
  blocklist-updater:
    image: alpine:latest
    container_name: netadmin-blocklist-updater
    volumes:
      - ./configs/update-blocklists.sh:/update-blocklists.sh:ro
      - ./configs/cron-entry.sh:/cron-entry.sh:ro
      - ./data/adguard/conf/blocklists:/data/blocklists
      - ./data/adguard/conf/blocklists:/data/adguard-blocklist
      - ./data/cron-logs:/data/logs
    command: ["/bin/sh", "-c", "apk add --no-cache wget bash && /bin/bash /cron-entry.sh"]
    depends_on:
      - adguard
    networks:
      netadmin:
        ipv4_address: 172.20.0.21
    restart: unless-stopped

  # ── API Backend ──
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: netadmin-api
    cap_add:
      - NET_ADMIN
      - NET_RAW
    environment:
      - API_PORT=4000
      - PANEL_PASS=${PANEL_PASS}
      - ADGUARD_URL=http://netadmin-adguard:3000
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /proc:/host-proc:ro
      - /sbin/iptables:/sbin/iptables:ro
      - /sbin/iptables-save:/sbin/iptables-save:ro
      - /lib/x86_64-linux-gnu:/host-lib:ro
      - ./data/squid-cache:/data/squid-cache:ro
      - ./data/lancache/data:/data/lancache-data:ro
      - ./data/apt-cache:/data/apt-cache:ro
      - ./data/nginx-cache:/data/nginx-cache:ro
      - ./data/ping-logs:/data/ping-logs
      - ./data/adguard/conf:/data/adguard/conf
      - ./data/squid-logs:/data/squid-logs:ro
      - ./data/cron-logs:/data/cron-logs:ro
      - ./data:/data/tunnel:rw
      - ./configs:/app/configs:rw
      - ${NETADMIN_DIR}:/host-data:ro
    depends_on:
      - adguard
    networks:
      netadmin:
        ipv4_address: 172.20.0.18
    restart: unless-stopped

  # ── Web Server ──
  nginx:
    image: nginx:alpine
    container_name: netadmin-nginx
    volumes:
      - ./configs/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./web:/var/www/netadmin:ro
      - ./data/nginx-cache:/var/cache/nginx/cdn
      - ./data/adguard/conf/blocklists:/var/blocklists:ro
    ports:
      - "${PANEL_PORT}:80"
      - "8888:8888"
    depends_on:
      - api
      - kuma
    networks:
      netadmin:
        ipv4_address: 172.20.0.19
    restart: unless-stopped

  # ── Cloudflare Tunnel (detenido por defecto) ──
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: netadmin-cloudflared
    command: tunnel --no-autoupdate --url http://netadmin-nginx:80
    networks:
      netadmin:
        ipv4_address: 172.20.0.20
    restart: "no"
    profiles: ["manual"]

networks:
  netadmin:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/24
COMPOSE

# Si hay token de CF, cambiar el command
if [ -n "$CF_TUNNEL_TOKEN" ]; then
  sed -i "s|command: tunnel --no-autoupdate --url http://netadmin-nginx:80|command: tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}|" ${NETADMIN_DIR}/docker-compose.yml
  # Auto-start con token
  sed -i 's/restart: "no"/restart: unless-stopped/' ${NETADMIN_DIR}/docker-compose.yml
fi

# ============================================================
# 11. COMPILAR PANEL WEB
# ============================================================
log "Instalando Node.js para compilar el panel web..."
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
success "Node.js $(node -v) instalado"

log "Clonando y compilando panel web..."
REPO_DIR="/tmp/netadmin-panel-build"
# Forzar cwd válido (el del shell padre puede estar roto si /opt/netadmin se borró antes)
cd /tmp || cd /
rm -rf ${REPO_DIR}
git -C /tmp clone --depth 1 https://github.com/drab10688-dot/cloud-cache-gateway.git netadmin-panel-build
cd ${REPO_DIR}
npm install --silent
npm run build

log "Desplegando panel web..."
cp -r ${REPO_DIR}/dist/* ${NETADMIN_DIR}/web/
rm -rf ${REPO_DIR}
success "Panel web compilado y desplegado"

# ============================================================
# 11b. SAVE PASSWORD FILE
# ============================================================
log "Guardando contraseña del panel..."
# IMPORTANTE: el backend Node.js lee desde /data/tunnel/panel-pass.txt (dentro del contenedor),
# que en el host es /opt/netadmin/data/tunnel/panel-pass.txt. Si guardamos en otra ruta,
# el backend usa el default 'admin123' y la API devuelve 401 "No autorizado".
mkdir -p ${NETADMIN_DIR}/data/tunnel
echo "${PANEL_PASS}" > ${NETADMIN_DIR}/data/tunnel/panel-pass.txt
chmod 600 ${NETADMIN_DIR}/data/tunnel/panel-pass.txt
# Compat: dejar también una copia en la ruta vieja por si scripts legacy la usan
echo "${PANEL_PASS}" > ${NETADMIN_DIR}/data/panel-pass.txt
chmod 600 ${NETADMIN_DIR}/data/panel-pass.txt
success "Contraseña guardada en ${NETADMIN_DIR}/data/tunnel/panel-pass.txt"

# ============================================================
# 12. LEVANTAR TODO
# ============================================================
log "Construyendo imágenes y levantando servicios..."
cd ${NETADMIN_DIR}

# Clean any orphan containers from previous installs
docker ps -a --filter "name=netadmin-" -q | xargs -r docker rm -f 2>/dev/null || true

# ── FIX RED: limpiar bridges Docker huérfanos (causa de "Connection reset" en reinstalaciones) ──
log "Limpiando bridges Docker huérfanos..."
docker network rm netadmin_netadmin 2>/dev/null || true
docker network prune -f >/dev/null 2>&1 || true
for br in $(ip link show type bridge 2>/dev/null | grep -oE "br-[a-f0-9]+" | sort -u); do
  if ! docker network ls --format '{{.ID}}' 2>/dev/null | grep -q "${br#br-}"; then
    ip link set "$br" down 2>/dev/null || true
    ip link delete "$br" type bridge 2>/dev/null || true
  fi
done
systemctl restart docker
sleep 5

docker compose build --quiet
docker compose up -d --remove-orphans
docker compose stop cloudflared 2>/dev/null || true

# Wait for containers to stabilize
log "Esperando que los contenedores se estabilicen..."
sleep 10

# Check for failed containers
FAILED=$(docker compose ps --status exited -q 2>/dev/null | wc -l)
if [ "$FAILED" -gt 0 ]; then
  warn "Algunos contenedores no arrancaron. Reintentando..."
  docker compose up -d --remove-orphans
  sleep 5
fi

success "¡Todos los contenedores levantados!"

# ============================================================
# 12. CLI TOOLS
# ============================================================
log "Instalando comandos CLI..."

cat > /usr/local/bin/netadmin-status << 'STATUS'
#!/bin/bash
G='\033[0;32m';R='\033[0;31m';C='\033[0;36m';Y='\033[1;33m';N='\033[0m'
echo -e "${C}══════════════════════════════════════════${N}"
echo -e "${C}   NetAdmin v4.0 — Estado (Docker)${N}"
echo -e "${C}══════════════════════════════════════════${N}"
echo ""
for c in netadmin-unbound netadmin-adguard netadmin-squid netadmin-apt-cacher \
         netadmin-lancache netadmin-lancache-dns netadmin-kuma netadmin-ping \
         netadmin-api netadmin-nginx netadmin-cloudflared; do
  STATE=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)
  NAME=$(echo "$c" | sed 's/netadmin-//')
  if [ "$STATE" = "running" ]; then
    echo -e "  ${G}●${N} ${NAME}"
  elif [ -n "$STATE" ]; then
    echo -e "  ${Y}●${N} ${NAME} (${STATE})"
  else
    echo -e "  ${R}●${N} ${NAME} (no existe)"
  fi
done
echo ""
P=$(ping -c 1 -W 2 8.8.8.8 2>/dev/null | grep 'time=' | sed 's/.*time=\([0-9.]*\).*/\1/')
[ -n "$P" ] && echo -e "  Latencia: ${G}${P}ms${N}" || echo -e "  Latencia: ${R}Sin conexión${N}"
echo ""
for d in /opt/netadmin/data/squid-cache /opt/netadmin/data/lancache/data /opt/netadmin/data/nginx-cache /opt/netadmin/data/apt-cache; do
  [ -d "$d" ] && echo -e "  Cache $(basename $(dirname $d))/$(basename $d): ${C}$(du -sh $d 2>/dev/null | cut -f1)${N}"
done
echo ""
STATUS
chmod +x /usr/local/bin/netadmin-status

cat > /usr/local/bin/netadmin-tunnel << 'TUNNEL'
#!/bin/bash
case "$1" in
  start)
    docker compose -f /opt/netadmin/docker-compose.yml up -d cloudflared >/dev/null 2>&1 || docker start netadmin-cloudflared 2>/dev/null
    sleep 6
    URL=$(docker logs netadmin-cloudflared 2>&1 | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)
    [ -n "$URL" ] && echo "$URL" > /opt/netadmin/data/tunnel-url.txt
    echo "Túnel activo: ${URL:-esperando URL...}"
    ;;
  stop)
    docker stop netadmin-cloudflared 2>/dev/null
    rm -f /opt/netadmin/data/tunnel-url.txt
    echo "Túnel detenido"
    ;;
  status)
    STATE=$(docker inspect -f '{{.State.Status}}' netadmin-cloudflared 2>/dev/null)
    [ "$STATE" = "running" ] && echo "ACTIVE" || echo "INACTIVE"
    ;;
  url)
    cat /opt/netadmin/data/tunnel-url.txt 2>/dev/null || echo ""
    ;;
  logs)
    docker logs --tail 50 netadmin-cloudflared 2>&1
    ;;
  *)
    echo "Uso: netadmin-tunnel {start|stop|status|url|logs}"
    ;;
esac
TUNNEL
chmod +x /usr/local/bin/netadmin-tunnel

# Alias de gestión
cat > /usr/local/bin/netadmin << 'MGMT'
#!/bin/bash
CD="/opt/netadmin"
case "$1" in
  up)      cd $CD && docker compose up -d ;;
  down)    cd $CD && docker compose down ;;
  restart) cd $CD && docker compose restart ${2:-} ;;
  logs)    cd $CD && docker compose logs -f --tail=50 ${2:-} ;;
  update)  cd $CD && docker compose pull && docker compose up -d && echo "Actualizando panel web..." && REPO="/tmp/netadmin-panel-build" && rm -rf $REPO && git clone --depth 1 https://github.com/drab10688-dot/cloud-cache-gateway.git $REPO && cd $REPO && npm install --silent && npm run build && cp -r dist/* $CD/web/ && rm -rf $REPO && docker restart netadmin-nginx && echo "✓ Panel web actualizado" ;;
  ps)      cd $CD && docker compose ps ;;
  status)  netadmin-status ;;
  *)
    echo "NetAdmin v4.0 — Gestión Docker"
    echo ""
    echo "  netadmin up        — Levantar todo"
    echo "  netadmin down      — Detener todo"
    echo "  netadmin restart   — Reiniciar (o un servicio)"
    echo "  netadmin logs      — Ver logs (o de un servicio)"
    echo "  netadmin update    — Actualizar imágenes"
    echo "  netadmin ps        — Estado de contenedores"
    echo "  netadmin status    — Estado completo"
    ;;
esac
MGMT
chmod +x /usr/local/bin/netadmin

# ============================================================
# 13. TCP BBR + KERNEL OPTIMIZATION
# ============================================================
log "Optimizando kernel TCP (BBR + FastOpen + buffers)..."

# Activar TCP BBR (mejor throughput y menor latencia)
cat >> /etc/sysctl.conf << 'SYSCTL_TCP'

# === NetAdmin: TCP Optimization ===
# TCP BBR congestion control (Google)
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr

# TCP FastOpen (reduce latencia en conexiones nuevas)
net.ipv4.tcp_fastopen=3

# Buffer optimization
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.ipv4.tcp_rmem=4096 87380 16777216
net.ipv4.tcp_wmem=4096 65536 16777216
net.core.netdev_max_backlog=5000

# Connection tracking optimization
net.ipv4.tcp_max_syn_backlog=8192
net.ipv4.tcp_tw_reuse=1
net.ipv4.tcp_fin_timeout=15
net.ipv4.tcp_keepalive_time=300
net.ipv4.tcp_keepalive_intvl=15
net.ipv4.tcp_keepalive_probes=5

# Enable window scaling
net.ipv4.tcp_window_scaling=1
net.ipv4.tcp_timestamps=1
net.ipv4.tcp_sack=1
SYSCTL_TCP

sysctl -p > /dev/null 2>&1
success "TCP BBR + optimizaciones de kernel aplicadas"

# ============================================================
# 14. FIREWALL
# ============================================================
log "Configurando firewall..."
apt-get install -y -qq ufw
ufw default deny incoming && ufw default allow outgoing
ufw allow ssh
# DNS solo desde red interna (ajusta la subred según tu red)
INTERNAL_NET="${INTERNAL_NET:-192.168.0.0/16}"
ufw allow from ${INTERNAL_NET} to any port 53 proto tcp
ufw allow from ${INTERNAL_NET} to any port 53 proto udp
# También permitir desde 10.0.0.0/8 y 172.16.0.0/12
ufw allow from 10.0.0.0/8 to any port 53 proto tcp
ufw allow from 10.0.0.0/8 to any port 53 proto udp
ufw allow from 172.16.0.0/12 to any port 53 proto tcp
ufw allow from 172.16.0.0/12 to any port 53 proto udp
ufw allow ${PANEL_PORT}/tcp
ufw allow 3000/tcp
ufw allow 3001/tcp
ufw allow 3128/tcp
ufw allow 3142/tcp
ufw allow 8880/tcp
ufw allow 8888/tcp
echo "y" | ufw enable
success "Firewall configurado"

# ============================================================
# RESUMEN FINAL
# ============================================================
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   ¡INSTALACIÓN COMPLETADA — NetAdmin v4.0 Docker!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Todo corre en:${NC} /opt/netadmin/docker-compose.yml"
echo ""
echo -e "  ${CYAN}Panel Web:${NC}        http://${IP_ADDR}:${PANEL_PORT}"
echo -e "  ${CYAN}AdGuard Home:${NC}     http://${IP_ADDR}:3000"
echo -e "  ${CYAN}Uptime Kuma:${NC}      http://${IP_ADDR}:3001"
echo -e "  ${CYAN}Speed Test:${NC}       http://${IP_ADDR}:${PANEL_PORT}/speedtest"
echo -e "  ${CYAN}Contraseña:${NC}       ${YELLOW}${PANEL_PASS}${NC}"
echo ""
echo -e "  ${CYAN}Caché configurada:${NC}"
echo -e "    Squid (Video):     ${GREEN}${SQUID_CACHE_GB} GB${NC} (RAM: ${SQUID_CACHE_MEM} MB)"
echo -e "    Lancache:          ${GREEN}${LANCACHE_CACHE_GB} GB${NC} (RAM: ${LANCACHE_CACHE_MEM} MB)"
echo -e "    Nginx CDN:         ${GREEN}${NGINX_CACHE_GB} GB${NC}"
echo -e "    Total:             ${GREEN}$((SQUID_CACHE_GB + LANCACHE_CACHE_GB + NGINX_CACHE_GB)) GB${NC}"
echo ""
echo -e "  ${CYAN}TCP Optimización:${NC}"
echo -e "    Congestión:        ${GREEN}BBR (Google)${NC}"
echo -e "    FastOpen:          ${GREEN}Activo${NC}"
echo -e "    Buffers TCP:       ${GREEN}16 MB${NC}"
echo ""
echo -e "${CYAN}  ┌──────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}  │  CONFIGURACIÓN DNS PARA TUS CLIENTES             │${NC}"
echo -e "${CYAN}  ├──────────────────────────────────────────────────┤${NC}"
echo -e "${CYAN}  │                                                  │${NC}"
echo -e "${CYAN}  │  DNS Primario:   ${GREEN}${IP_ADDR}${CYAN}                      │${NC}"
echo -e "${CYAN}  │  DNS Secundario: ${NC}8.8.8.8 (respaldo)${CYAN}              │${NC}"
echo -e "${CYAN}  │                                                  │${NC}"
echo -e "${CYAN}  │  ${NC}Router/MikroTik: DHCP → DNS = ${GREEN}${IP_ADDR}${CYAN}       │${NC}"
echo -e "${CYAN}  │  ${NC}Windows: Adaptador → IPv4 → DNS = ${GREEN}${IP_ADDR}${CYAN}  │${NC}"
echo -e "${CYAN}  │  ${NC}Android/iOS: WiFi → DNS = ${GREEN}${IP_ADDR}${CYAN}          │${NC}"
echo -e "${CYAN}  │                                                  │${NC}"
echo -e "${CYAN}  │  ${YELLOW}Con solo el DNS ya funciona:${CYAN}                    │${NC}"
echo -e "${CYAN}  │  ${NC}✓ Bloqueo de ads y trackers${CYAN}                    │${NC}"
echo -e "${CYAN}  │  ${NC}✓ Filtros MinTIC / Coljuegos${CYAN}                   │${NC}"
echo -e "${CYAN}  │  ${NC}✓ Caché de juegos (Steam, Windows Update)${CYAN}      │${NC}"
echo -e "${CYAN}  │  ${NC}✓ Caché de repos Linux (apt-cacher-ng)${CYAN}         │${NC}"
echo -e "${CYAN}  │                                                  │${NC}"
echo -e "${CYAN}  │  ${YELLOW}Opcional (proxy explícito + certificado):${CYAN}       │${NC}"
echo -e "${CYAN}  │  ${NC}Proxy: ${GREEN}${IP_ADDR}:3128${CYAN}                         │${NC}"
echo -e "${CYAN}  │  ${NC}Cert:  /opt/netadmin/certs/netadmin-ca.pem${CYAN}     │${NC}"
echo -e "${CYAN}  │  ${NC}Cachea: YouTube, Netflix, HTTPS en general${CYAN}     │${NC}"
echo -e "${CYAN}  └──────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${CYAN}Gestión:${NC}"
echo -e "    ${YELLOW}netadmin status${NC}      — Estado de todo"
echo -e "    ${YELLOW}netadmin up/down${NC}     — Levantar/detener"
echo -e "    ${YELLOW}netadmin update${NC}      — Actualizar imágenes"
echo -e "    ${YELLOW}netadmin logs [svc]${NC}  — Ver logs"
echo -e "    ${YELLOW}netadmin restart${NC}     — Reiniciar todo"
echo -e "    ${YELLOW}netadmin-tunnel start${NC}— Túnel Cloudflare"
echo -e "    ${YELLOW}netadmin update${NC}      — Actualizar todo + panel web"
echo ""

# Mostrar estado
netadmin-status
