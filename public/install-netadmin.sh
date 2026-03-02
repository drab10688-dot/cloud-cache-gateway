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

set -e

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${CYAN}[NetAdmin]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[ "$EUID" -ne 0 ] && error "Ejecuta como root: sudo bash install.sh"

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
    cd /opt/netadmin && docker compose down --rmi all --volumes --remove-orphans 2>/dev/null || true
    rm -rf /opt/netadmin
  else
    echo "Cancelado."
    exit 0
  fi
fi

# ── Modo desinstalar por flag ──
if [ "$1" = "--uninstall" ] || [ "$1" = "uninstall" ]; then
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
apt-get install -y -qq curl wget jq openssl ca-certificates gnupg lsb-release

if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker && systemctl start docker

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
    do-ip6: no
    access-control: 0.0.0.0/0 allow
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
    hide-identity: yes
    hide-version: yes
    harden-glue: yes
    harden-dnssec-stripped: yes
    qname-minimisation: yes
    auto-trust-anchor-file: "/var/lib/unbound/root.key"
    root-hints: /etc/unbound/root.hints
    verbosity: 1
    logfile: ""
    log-queries: no
EOF

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
    "dockerode": "^4.0.0"
  }
}
PKG

cat > ${NETADMIN_DIR}/api/server.js << 'API_JS'
import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import fs from 'fs';
import Docker from 'dockerode';

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

// Auth middleware
// Parse raw body for speed test upload
app.use('/api/speedtest/upload', express.raw({ type: 'application/octet-stream', limit: '50mb' }));

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
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (method === 'POST') opts.body = JSON.stringify(req.body);
    const r = await fetch(`${ADGUARD_URL}${path}`, opts);
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
};

app.get('/api/adguard/status', proxyAdGuard('/control/status'));
app.get('/api/adguard/stats', proxyAdGuard('/control/stats'));
app.get('/api/adguard/querylog', proxyAdGuard('/control/querylog?limit=100'));
app.get('/api/adguard/filtering', proxyAdGuard('/control/filtering/status'));
app.post('/api/adguard/filtering/add', proxyAdGuard('/control/filtering/add_url', 'POST'));
app.post('/api/adguard/filtering/remove', proxyAdGuard('/control/filtering/remove_url', 'POST'));

// === BLOCKLIST LOCAL ===
const BLOCKLIST_FILE = '/data/adguard/conf/blocklists/colombia_mintic.txt';

app.get('/api/blocklist', (req, res) => {
  try {
    const content = fs.readFileSync(BLOCKLIST_FILE, 'utf8');
    res.json(content.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(d => d.trim()));
  } catch { res.json([]); }
});

app.post('/api/blocklist/add', (req, res) => {
  try { fs.appendFileSync(BLOCKLIST_FILE, `\n${req.body.domain}`); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/blocklist/remove', (req, res) => {
  try {
    const content = fs.readFileSync(BLOCKLIST_FILE, 'utf8');
    fs.writeFileSync(BLOCKLIST_FILE, content.split('\n').filter(l => l.trim() !== req.body.domain).join('\n'));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

function getTunnelUrl() {
  // Try file first
  try { 
    const url = fs.readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
    if (url) return url;
  } catch {}
  // Try from docker logs
  try {
    const logs = execSync('docker logs netadmin-cloudflared 2>&1').toString();
    const match = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    if (match && match.length > 0) {
      const url = match[match.length - 1];
      try { fs.writeFileSync(TUNNEL_URL_FILE, url); } catch {}
      return url;
    }
  } catch {}
  return '';
}

app.get('/api/tunnel/status', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const cf = containers.find(c => c.Names.some(n => n === '/netadmin-cloudflared'));
    const active = cf ? cf.State === 'running' : false;
    const url = active ? getTunnelUrl() : '';
    res.json({ active, url });
  } catch { res.json({ active: false, url: '' }); }
});

app.post('/api/tunnel/start', async (req, res) => {
  try {
    execSync('docker start netadmin-cloudflared 2>/dev/null || true');
    // Wait for tunnel to establish
    await new Promise(r => setTimeout(r, 8000));
    const url = getTunnelUrl();
    res.json({ success: true, url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tunnel/stop', async (req, res) => {
  try {
    execSync('docker stop netadmin-cloudflared 2>/dev/null || true');
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
    // Save config
    fs.writeFileSync(DNS_CONFIG_FILE, JSON.stringify({ primary, secondary, updated: new Date().toISOString() }));
    // Update Unbound forward zone
    const fwdConf = `forward-zone:\n  name: "."\n  forward-addr: ${primary}\n  forward-addr: ${secondary}\n`;
    fs.writeFileSync('/data/unbound/forward.conf', fwdConf);
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
app.post('/api/system/update-docker', (req, res) => {
  try {
    execSync('docker compose -f /host-data/docker-compose.yml pull 2>&1', { timeout: 300000 });
    execSync('docker compose -f /host-data/docker-compose.yml up -d 2>&1', { timeout: 120000 });
    res.json({ success: true, message: 'Imágenes actualizadas y contenedores reiniciados' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/system/update-panel', (req, res) => {
  try {
    const cmds = [
      'rm -rf /tmp/netadmin-panel-build',
      'git clone --depth 1 https://github.com/drab10688-dot/cloud-cache-gateway.git /tmp/netadmin-panel-build',
      'cd /tmp/netadmin-panel-build && npm install --silent && npm run build',
      'cp -r /tmp/netadmin-panel-build/dist/* /host-data/web/',
      'rm -rf /tmp/netadmin-panel-build',
    ];
    // Run via docker to have access to host filesystem and node
    execSync(`docker run --rm -v /opt/netadmin:/host-data -v /tmp:/tmp node:20-alpine sh -c "${cmds.join(' && ')}"`, { timeout: 300000 });
    execSync('docker restart netadmin-nginx 2>/dev/null || true');
    res.json({ success: true, message: 'Panel web actualizado' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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

app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`NetAdmin API v4.0 → http://0.0.0.0:${API_PORT}`);
});
API_JS

cat > ${NETADMIN_DIR}/api/Dockerfile << 'DOCKERFILE'
FROM node:20-alpine
WORKDIR /app
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
# Fix line endings (remove Windows CRLF)
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

        # Speed test API (public, no auth, higher timeout + body size)
        location /api/speedtest/ {
            proxy_pass http://netadmin-api:4000;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_read_timeout 120s;
            proxy_send_timeout 120s;
            client_max_body_size 50m;
        }

        location /api/ {
            proxy_pass http://netadmin-api:4000;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_read_timeout 30s;
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
RELOAD_RESULT=$(wget -q -O- --post-data='{}' \
  --header='Content-Type: application/json' \
  "${ADGUARD_URL}/control/filtering/refresh" 2>&1) || true
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
      - UPSTREAM_DNS=172.20.0.10:53
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
      - /var/run/docker.sock:/var/run/docker.sock:ro
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
rm -rf ${REPO_DIR}
git clone --depth 1 https://github.com/drab10688-dot/cloud-cache-gateway.git ${REPO_DIR}
cd ${REPO_DIR}
npm install --silent
npm run build

log "Desplegando panel web..."
cp -r ${REPO_DIR}/dist/* ${NETADMIN_DIR}/web/
rm -rf ${REPO_DIR}
success "Panel web compilado y desplegado"

# ============================================================
# 12. LEVANTAR TODO
# ============================================================
log "Construyendo imágenes y levantando servicios..."
cd ${NETADMIN_DIR}
docker compose build --quiet
docker compose up -d

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
    docker start netadmin-cloudflared 2>/dev/null
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
ufw allow 53/tcp && ufw allow 53/udp
ufw allow ${PANEL_PORT}/tcp
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
echo -e "    Lancache:          ${GREEN}${LANCACHE_CACHE_GB} GB${NC} (RAM: ${LANCACHE_CACHE_MEM} GB)"
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
