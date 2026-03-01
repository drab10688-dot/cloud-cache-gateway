#!/bin/bash
# ============================================================
# NetAdmin v2.0 — Script de Instalación Completo
# Ubuntu Server VPS — Todo funcional con API y Panel Web
# ============================================================
# Instala y conecta:
#   - Unbound DNS (recursivo, DNSSEC, caché agresivo)
#   - AdGuard Home (filtrado DNS, bloqueo infantil, MinTIC)
#   - Squid (proxy caché SSL Bump para YouTube/HTTPS)
#   - apt-cacher-ng (caché repos Linux)
#   - Lancache (Docker: Windows Update, Steam, Epic)
#   - Cloudflare Tunnel (acceso sin IP pública)
#   - Monitor de Ping (detección de caídas)
#   - API Backend (Node.js — conecta panel con servicios)
#   - Panel Web NetAdmin (frontend React servido por Nginx)
# ============================================================

set -e

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${CYAN}[NetAdmin]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[ "$EUID" -ne 0 ] && error "Ejecuta como root: sudo bash install.sh"
grep -qi "ubuntu" /etc/os-release || error "Solo para Ubuntu Server"

IP_ADDR=$(hostname -I | awk '{print $1}')
UBUNTU_VERSION=$(lsb_release -rs)

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   NetAdmin v2.0 — Instalación Completa${NC}"
echo -e "${CYAN}   Ubuntu $UBUNTU_VERSION — $IP_ADDR${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""

read -p "Token de Cloudflare Tunnel (Enter para omitir): " CF_TUNNEL_TOKEN
read -p "Contraseña para el panel web [admin123]: " PANEL_PASS
PANEL_PASS=${PANEL_PASS:-admin123}
read -p "Puerto del panel web [80]: " PANEL_PORT
PANEL_PORT=${PANEL_PORT:-80}
ADGUARD_PORT=3000
API_PORT=4000

echo ""
log "Iniciando instalación de todos los servicios..."
echo ""

# ============================================================
# 1. DEPENDENCIAS BASE
# ============================================================
log "Instalando dependencias..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget gnupg lsb-release apt-transport-https \
  ca-certificates software-properties-common ufw jq openssl \
  docker.io docker-compose nginx

# Node.js 20 LTS
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

systemctl enable docker && systemctl start docker
success "Dependencias instaladas (Node.js $(node -v), Docker)"

# ============================================================
# 2. UNBOUND DNS
# ============================================================
log "Instalando Unbound DNS recursivo..."
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
    root-hints: /var/lib/unbound/root.hints
    verbosity: 1
    logfile: /var/log/unbound/unbound.log
EOF

mkdir -p /var/log/unbound && chown unbound:unbound /var/log/unbound
if systemctl is-active --quiet systemd-resolved; then
  systemctl stop systemd-resolved && systemctl disable systemd-resolved
  rm -f /etc/resolv.conf && echo "nameserver 127.0.0.1" > /etc/resolv.conf
fi
systemctl restart unbound && systemctl enable unbound
success "Unbound DNS → 127.0.0.1:5353"

# ============================================================
# 3. ADGUARD HOME
# ============================================================
log "Instalando AdGuard Home..."
curl -s -S -L https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v
sleep 3

mkdir -p /opt/AdGuardHome/blocklists
cat > /opt/AdGuardHome/blocklists/colombia_mintic.txt << 'BLOCKLIST'
# NetAdmin — Lista Colombia (MinTIC + Coljuegos + Infantil)
# Agrega dominios según resoluciones vigentes
BLOCKLIST

ADGUARD_CONFIG="/opt/AdGuardHome/AdGuardHome.yaml"
[ -f "$ADGUARD_CONFIG" ] && sed -i "s/address: 0.0.0.0:3000/address: 0.0.0.0:${ADGUARD_PORT}/" "$ADGUARD_CONFIG"
systemctl restart AdGuardHome 2>/dev/null || true
success "AdGuard Home → puerto $ADGUARD_PORT"

# ============================================================
# 4. SQUID SSL BUMP
# ============================================================
log "Instalando Squid con SSL Bump..."
apt-get install -y -qq squid-openssl
mkdir -p /etc/squid/ssl_cert && cd /etc/squid/ssl_cert
openssl req -new -newkey rsa:2048 -sha256 -days 3650 -nodes -x509 \
  -keyout netadmin-ca.pem -out netadmin-ca.pem \
  -subj "/C=CO/ST=Colombia/O=NetAdmin/CN=NetAdmin CA" 2>/dev/null
/usr/lib/squid/security_file_certgen -c -s /var/spool/squid/ssl_db -M 64MB 2>/dev/null || true
chown -R proxy:proxy /var/spool/squid/ssl_db 2>/dev/null || true
mkdir -p /var/cache/squid && chown proxy:proxy /var/cache/squid

cat > /etc/squid/squid.conf << 'SQUID_CONF'
http_port 3128
http_port 3129 intercept
https_port 3130 intercept ssl-bump cert=/etc/squid/ssl_cert/netadmin-ca.pem generate-host-certificates=on dynamic_cert_mem_cache_size=16MB
acl step1 at_step SslBump1
acl youtube_ssl ssl::server_name .youtube.com .googlevideo.com .ytimg.com
acl windows_ssl ssl::server_name .windowsupdate.com .microsoft.com .download.microsoft.com
acl cacheable_ssl ssl::server_name .youtube.com .googlevideo.com .ytimg.com .windowsupdate.com .microsoft.com
ssl_bump peek step1
ssl_bump bump cacheable_ssl
ssl_bump splice all
sslcrtd_program /usr/lib/squid/security_file_certgen -s /var/spool/squid/ssl_db -M 64MB
cache_dir ufs /var/cache/squid 50000 16 256
maximum_object_size 4 GB
cache_mem 512 MB
maximum_object_size_in_memory 128 MB
refresh_pattern -i \.googlevideo\.com\/videoplayback 43200 90% 86400 override-expire override-lastmod reload-into-ims ignore-reload ignore-no-store ignore-private
refresh_pattern -i ytimg\.com 43200 90% 86400 override-expire
refresh_pattern -i windowsupdate\.com/.*\.(cab|exe|ms[i|u|f|p]|[ap]sf|wm[v|a]|dat|zip|msu) 43200 80% 129600 reload-into-ims
refresh_pattern -i download\.microsoft\.com 43200 80% 129600
refresh_pattern ^ftp: 1440 20% 10080
refresh_pattern -i (/cgi-bin/|\?) 0 0% 0
refresh_pattern . 0 20% 4320
acl localnet src 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
acl Safe_ports port 80 443 21 70 210 280 488 591 777 1025-65535
http_access allow localnet
http_access allow localhost
http_access deny all
access_log /var/log/squid/access.log squid
cache_log /var/log/squid/cache.log
cache_store_log /var/log/squid/store.log
visible_hostname netadmin-proxy
SQUID_CONF

squid -z 2>/dev/null || true
systemctl restart squid && systemctl enable squid
success "Squid → puerto 3128 (SSL Bump: YouTube + Windows)"

# ============================================================
# 5. APT-CACHER-NG
# ============================================================
log "Instalando apt-cacher-ng..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq apt-cacher-ng
systemctl restart apt-cacher-ng && systemctl enable apt-cacher-ng
echo 'Acquire::http::Proxy "http://127.0.0.1:3142";' > /etc/apt/apt.conf.d/01proxy
success "apt-cacher-ng → puerto 3142"

# ============================================================
# 6. LANCACHE (Docker)
# ============================================================
log "Instalando Lancache..."
mkdir -p /opt/lancache /var/cache/lancache/{data,logs}
cat > /opt/lancache/docker-compose.yml << LANCACHE_YML
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
LANCACHE_YML
cd /opt/lancache && docker-compose up -d
success "Lancache → puerto 8880 (Windows Update, Steam, Epic)"

# ============================================================
# 7. CLOUDFLARE TUNNEL
# ============================================================
log "Instalando cloudflared..."
ARCH=$(dpkg --print-architecture)
curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb && rm -f /tmp/cloudflared.deb

cat > /usr/local/bin/netadmin-tunnel << TUNNEL_SCRIPT
#!/bin/bash
TUNNEL_LOG="/var/log/netadmin/tunnel.log"
TUNNEL_PID="/tmp/cloudflared.pid"
mkdir -p /var/log/netadmin

case "\$1" in
  start)
    if [ -n "\$2" ]; then
      cloudflared service install "\$2"
      systemctl start cloudflared
      echo "Túnel iniciado con token"
    else
      nohup cloudflared tunnel --url http://localhost:${PANEL_PORT} > "\$TUNNEL_LOG" 2>&1 &
      echo \$! > "\$TUNNEL_PID"
      sleep 5
      URL=\$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "\$TUNNEL_LOG" | head -1)
      echo "\$URL" > /var/log/netadmin/tunnel-url.txt
      echo "Túnel activo: \$URL"
    fi
    ;;
  stop)
    [ -f "\$TUNNEL_PID" ] && kill \$(cat "\$TUNNEL_PID") 2>/dev/null && rm "\$TUNNEL_PID"
    systemctl stop cloudflared 2>/dev/null
    rm -f /var/log/netadmin/tunnel-url.txt
    echo "Túnel detenido"
    ;;
  status)
    if [ -f "\$TUNNEL_PID" ] && kill -0 \$(cat "\$TUNNEL_PID") 2>/dev/null; then echo "ACTIVE"
    elif systemctl is-active --quiet cloudflared 2>/dev/null; then echo "ACTIVE"
    else echo "INACTIVE"; fi
    ;;
  url)
    cat /var/log/netadmin/tunnel-url.txt 2>/dev/null || echo ""
    ;;
  *) echo "Uso: netadmin-tunnel {start [token]|stop|status|url}" ;;
esac
TUNNEL_SCRIPT
chmod +x /usr/local/bin/netadmin-tunnel

[ -n "$CF_TUNNEL_TOKEN" ] && cloudflared service install "$CF_TUNNEL_TOKEN"
success "cloudflared instalado"

# ============================================================
# 8. MONITOR DE PING
# ============================================================
log "Configurando monitor de ping..."
mkdir -p /var/log/netadmin

cat > /opt/netadmin-ping-monitor.sh << 'PING_SCRIPT'
#!/bin/bash
LOG_DIR="/var/log/netadmin"
mkdir -p "$LOG_DIR"
WAS_DOWN=false
while true; do
  TS=$(date '+%Y-%m-%d %H:%M:%S')
  LOG_FILE="$LOG_DIR/ping-$(date +%Y-%m-%d).log"
  RESULT=$(ping -c 1 -W 3 8.8.8.8 2>/dev/null)
  if [ $? -eq 0 ]; then
    LAT=$(echo "$RESULT" | grep 'time=' | sed 's/.*time=\([0-9.]*\).*/\1/')
    echo "$TS|OK|${LAT}" >> "$LOG_FILE"
    [ "$WAS_DOWN" = true ] && echo "$TS|RECOVERED" >> "$LOG_DIR/downtime.log" && WAS_DOWN=false
  else
    echo "$TS|FAIL|0" >> "$LOG_FILE"
    [ "$WAS_DOWN" = false ] && echo "$TS|DOWN" >> "$LOG_DIR/downtime.log" && WAS_DOWN=true
  fi
  sleep 5
done
PING_SCRIPT
chmod +x /opt/netadmin-ping-monitor.sh

cat > /etc/systemd/system/netadmin-ping.service << 'EOF'
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
EOF
systemctl daemon-reload && systemctl enable netadmin-ping && systemctl start netadmin-ping
success "Monitor de ping activo"

# ============================================================
# 9. API BACKEND (Node.js Express)
# ============================================================
log "Instalando API Backend..."
mkdir -p /opt/netadmin-api

cat > /opt/netadmin-api/package.json << 'PKG_JSON'
{
  "name": "netadmin-api",
  "version": "2.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  }
}
PKG_JSON

cat > /opt/netadmin-api/server.js << 'API_SERVER'
import express from 'express';
import cors from 'cors';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import http from 'http';

const app = express();
app.use(cors());
app.use(express.json());

const API_PORT = process.env.API_PORT || 4000;
const ADGUARD_URL = 'http://127.0.0.1:3000';
const PANEL_PASS = process.env.PANEL_PASS || 'admin123';

// Simple auth middleware
app.use((req, res, next) => {
  if (req.path === '/api/auth/login') return next();
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

// === SERVICIOS STATUS ===
app.get('/api/services', (req, res) => {
  const checkService = (name) => {
    try {
      const result = execSync(`systemctl is-active ${name} 2>/dev/null`).toString().trim();
      return result === 'active';
    } catch { return false; }
  };
  const checkDocker = (name) => {
    try {
      const result = execSync(`docker ps --format '{{.Names}}' 2>/dev/null`).toString();
      return result.includes(name);
    } catch { return false; }
  };

  res.json({
    unbound: checkService('unbound'),
    adguard: checkService('AdGuardHome'),
    squid: checkService('squid'),
    'apt-cacher-ng': checkService('apt-cacher-ng'),
    nginx: checkService('nginx'),
    ping_monitor: checkService('netadmin-ping'),
    lancache: checkDocker('lancache'),
    'lancache-dns': checkDocker('lancache-dns'),
    cloudflared: checkService('cloudflared') ||
      (fs.existsSync('/tmp/cloudflared.pid') && (() => {
        try { process.kill(parseInt(fs.readFileSync('/tmp/cloudflared.pid', 'utf8')), 0); return true; } catch { return false; }
      })()),
  });
});

// === PING DATA ===
app.get('/api/ping', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const logFile = `/var/log/netadmin/ping-${today}.log`;
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

// === PING DOWNTIME LOG ===
app.get('/api/ping/downtime', (req, res) => {
  try {
    const log = fs.readFileSync('/var/log/netadmin/downtime.log', 'utf8').trim().split('\n').slice(-50);
    res.json(log.map(l => { const [time, event] = l.split('|'); return { time: time.trim(), event: event.trim() }; }));
  } catch { res.json([]); }
});

// === ADGUARD PROXY ===
app.get('/api/adguard/status', async (req, res) => {
  try {
    const r = await fetch(`${ADGUARD_URL}/control/status`);
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adguard/stats', async (req, res) => {
  try {
    const r = await fetch(`${ADGUARD_URL}/control/stats`);
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adguard/querylog', async (req, res) => {
  try {
    const r = await fetch(`${ADGUARD_URL}/control/querylog?limit=100`);
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adguard/filtering', async (req, res) => {
  try {
    const r = await fetch(`${ADGUARD_URL}/control/filtering/status`);
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/adguard/filtering/add', async (req, res) => {
  try {
    const r = await fetch(`${ADGUARD_URL}/control/filtering/add_url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/adguard/filtering/remove', async (req, res) => {
  try {
    const r = await fetch(`${ADGUARD_URL}/control/filtering/remove_url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === BLOCKLIST LOCAL ===
app.get('/api/blocklist', (req, res) => {
  const file = '/opt/AdGuardHome/blocklists/colombia_mintic.txt';
  try {
    const content = fs.readFileSync(file, 'utf8');
    const domains = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(d => d.trim());
    res.json(domains);
  } catch { res.json([]); }
});

app.post('/api/blocklist/add', (req, res) => {
  const { domain } = req.body;
  const file = '/opt/AdGuardHome/blocklists/colombia_mintic.txt';
  try {
    fs.appendFileSync(file, `\n${domain}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/blocklist/remove', (req, res) => {
  const { domain } = req.body;
  const file = '/opt/AdGuardHome/blocklists/colombia_mintic.txt';
  try {
    const content = fs.readFileSync(file, 'utf8');
    const filtered = content.split('\n').filter(l => l.trim() !== domain).join('\n');
    fs.writeFileSync(file, filtered);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === SQUID CACHE STATS ===
app.get('/api/cache/squid', (req, res) => {
  try {
    const size = execSync("du -sh /var/cache/squid 2>/dev/null | cut -f1").toString().trim();
    const log = fs.readFileSync('/var/log/squid/access.log', 'utf8');
    const lines = log.trim().split('\n').slice(-1000);
    let hits = 0, misses = 0, youtube = 0;
    lines.forEach(l => {
      if (l.includes('HIT')) hits++;
      else misses++;
      if (l.includes('googlevideo') || l.includes('youtube')) youtube++;
    });
    res.json({ size, hits, misses, hitRate: hits + misses > 0 ? Math.round(hits / (hits + misses) * 100) : 0, youtube });
  } catch { res.json({ size: '0', hits: 0, misses: 0, hitRate: 0, youtube: 0 }); }
});

app.get('/api/cache/lancache', (req, res) => {
  try {
    const size = execSync("du -sh /var/cache/lancache/data 2>/dev/null | cut -f1").toString().trim();
    res.json({ size, status: 'active' });
  } catch { res.json({ size: '0', status: 'unknown' }); }
});

app.get('/api/cache/apt', (req, res) => {
  try {
    const size = execSync("du -sh /var/cache/apt-cacher-ng 2>/dev/null | cut -f1").toString().trim();
    res.json({ size });
  } catch { res.json({ size: '0' }); }
});

app.get('/api/cache/nginx', (req, res) => {
  try {
    const size = execSync("du -sh /var/cache/nginx/cdn 2>/dev/null | cut -f1").toString().trim();
    res.json({ size });
  } catch { res.json({ size: '0' }); }
});

// === CLOUDFLARE TUNNEL ===
app.get('/api/tunnel/status', (req, res) => {
  try {
    const status = execSync('netadmin-tunnel status 2>/dev/null').toString().trim();
    let url = '';
    try { url = fs.readFileSync('/var/log/netadmin/tunnel-url.txt', 'utf8').trim(); } catch {}
    res.json({ active: status === 'ACTIVE', url });
  } catch { res.json({ active: false, url: '' }); }
});

app.post('/api/tunnel/start', (req, res) => {
  const { token } = req.body || {};
  try {
    exec(`netadmin-tunnel start ${token || ''}`);
    setTimeout(() => {
      let url = '';
      try { url = fs.readFileSync('/var/log/netadmin/tunnel-url.txt', 'utf8').trim(); } catch {}
      res.json({ success: true, url });
    }, 6000);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tunnel/stop', (req, res) => {
  try {
    execSync('netadmin-tunnel stop');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === SYSTEM INFO ===
app.get('/api/system', (req, res) => {
  try {
    const uptime = execSync('uptime -p').toString().trim();
    const memory = execSync("free -h | awk '/^Mem:/ {print $3\"/\"$2}'").toString().trim();
    const disk = execSync("df -h / | awk 'NR==2 {print $3\"/\"$2}'").toString().trim();
    const cpu = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").toString().trim();
    res.json({ uptime, memory, disk, cpu: parseFloat(cpu) || 0 });
  } catch { res.json({ uptime: 'N/A', memory: 'N/A', disk: 'N/A', cpu: 0 }); }
});

app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`NetAdmin API → http://0.0.0.0:${API_PORT}`);
});
API_SERVER

cd /opt/netadmin-api && npm install --production --silent

# Crear variable de entorno para la contraseña
cat > /opt/netadmin-api/.env << ENV_FILE
API_PORT=$API_PORT
PANEL_PASS=$PANEL_PASS
ENV_FILE

# Servicio systemd para la API
cat > /etc/systemd/system/netadmin-api.service << API_SVC
[Unit]
Description=NetAdmin API Server
After=network.target
[Service]
Type=simple
WorkingDirectory=/opt/netadmin-api
EnvironmentFile=/opt/netadmin-api/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
API_SVC

systemctl daemon-reload && systemctl enable netadmin-api && systemctl start netadmin-api
success "API Backend → http://0.0.0.0:$API_PORT"

# ============================================================
# 10. NGINX — Servir Panel Web + Proxy API
# ============================================================
log "Configurando Nginx para panel web..."

# El panel se construirá con el frontend React
mkdir -p /var/www/netadmin

cat > /etc/nginx/sites-available/netadmin << NGINX_CONF
server {
    listen ${PANEL_PORT};
    server_name _;
    root /var/www/netadmin;
    index index.html;

    # Panel SPA
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy a la API
    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 30s;
    }
}

# CDN Cache (puerto 8888)
proxy_cache_path /var/cache/nginx/cdn levels=1:2 keys_zone=cdn_cache:200m max_size=50g inactive=30d use_temp_path=off;
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
    location /cache-status {
        stub_status on;
        allow 127.0.0.1;
        allow 192.168.0.0/16;
        deny all;
    }
}
NGINX_CONF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/netadmin /etc/nginx/sites-enabled/
mkdir -p /var/cache/nginx/cdn
nginx -t && systemctl restart nginx && systemctl enable nginx
success "Nginx → puerto $PANEL_PORT (panel) + 8888 (CDN cache)"

# Crear página de espera
cat > /var/www/netadmin/index.html << 'WAIT_HTML'
<!DOCTYPE html>
<html><head><title>NetAdmin</title>
<style>body{background:#0f1419;color:#14b8a6;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.c{text-align:center}h1{font-size:2rem}p{color:#64748b;margin-top:1rem}</style></head>
<body><div class="c"><h1>NetAdmin</h1><p>Panel instalado. Sube el build del frontend a /var/www/netadmin/</p>
<p>O usa: scp -r dist/* root@tu-vps:/var/www/netadmin/</p></div></body></html>
WAIT_HTML

# ============================================================
# 11. NETADMIN-STATUS
# ============================================================
cat > /usr/local/bin/netadmin-status << 'STATUS'
#!/bin/bash
G='\033[0;32m';R='\033[0;31m';C='\033[0;36m';Y='\033[1;33m';N='\033[0m'
echo -e "${C}══════════════════════════════════════════${N}"
echo -e "${C}   NetAdmin v2.0 — Estado de Servicios${N}"
echo -e "${C}══════════════════════════════════════════${N}"
echo ""
cs() { systemctl is-active --quiet "$1" 2>/dev/null && echo -e "  ${G}●${N} $2" || echo -e "  ${R}●${N} $2 ${R}(inactivo)${N}"; }
cs "unbound" "Unbound DNS"
cs "AdGuardHome" "AdGuard Home"
cs "squid" "Squid Proxy (SSL Bump)"
cs "apt-cacher-ng" "apt-cacher-ng"
cs "nginx" "Nginx (Panel + CDN)"
cs "netadmin-api" "API Backend"
cs "netadmin-ping" "Monitor de Ping"
echo ""
for c in lancache lancache-dns; do
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${c}$" && echo -e "  ${G}●${N} $c (Docker)" || echo -e "  ${R}●${N} $c ${R}(detenido)${N}"
done
echo ""
TS=$(netadmin-tunnel status 2>/dev/null)
if [ "$TS" = "ACTIVE" ]; then
  echo -e "  ${G}●${N} Cloudflare Tunnel"
  URL=$(cat /var/log/netadmin/tunnel-url.txt 2>/dev/null)
  [ -n "$URL" ] && echo -e "    URL: ${C}${URL}${N}"
else
  echo -e "  ${R}●${N} Cloudflare Tunnel ${Y}(netadmin-tunnel start)${N}"
fi
echo ""
P=$(ping -c 1 -W 2 8.8.8.8 2>/dev/null | grep 'time=' | sed 's/.*time=\([0-9.]*\).*/\1/')
[ -n "$P" ] && echo -e "  Latencia: ${G}${P}ms${N}" || echo -e "  Latencia: ${R}Sin conexión${N}"
echo ""
for d in /var/cache/squid /var/cache/nginx/cdn /var/cache/lancache/data /var/cache/apt-cacher-ng; do
  [ -d "$d" ] && echo -e "  Cache $(basename $d): ${C}$(du -sh $d 2>/dev/null | cut -f1)${N}"
done
echo ""
STATUS
chmod +x /usr/local/bin/netadmin-status

# ============================================================
# 12. FIREWALL
# ============================================================
log "Configurando firewall..."
ufw default deny incoming && ufw default allow outgoing
ufw allow ssh
ufw allow 53/tcp && ufw allow 53/udp  # DNS
ufw allow $PANEL_PORT/tcp              # Panel web
ufw allow $API_PORT/tcp                # API
ufw allow $ADGUARD_PORT/tcp            # AdGuard UI
ufw allow 3128/tcp                     # Squid
ufw allow 3142/tcp                     # apt-cacher-ng
ufw allow 8880/tcp                     # Lancache
ufw allow 8888/tcp                     # Nginx CDN
echo "y" | ufw enable
success "Firewall configurado"

# ============================================================
# RESUMEN FINAL
# ============================================================
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   ¡INSTALACIÓN COMPLETADA — NetAdmin v2.0!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Panel Web:${NC}        http://${IP_ADDR}:${PANEL_PORT}"
echo -e "  ${CYAN}API Backend:${NC}      http://${IP_ADDR}:${API_PORT}"
echo -e "  ${CYAN}AdGuard Home:${NC}     http://${IP_ADDR}:${ADGUARD_PORT}"
echo -e "  ${CYAN}Contraseña panel:${NC} ${YELLOW}${PANEL_PASS}${NC}"
echo ""
echo -e "  ${CYAN}Servicios de caché:${NC}"
echo -e "    Squid (YouTube):   ${IP_ADDR}:3128"
echo -e "    apt-cacher-ng:     ${IP_ADDR}:3142"
echo -e "    Lancache:          ${IP_ADDR}:8880"
echo -e "    Nginx CDN:         ${IP_ADDR}:8888"
echo ""
echo -e "  ${CYAN}Comandos:${NC}"
echo -e "    ${YELLOW}netadmin-status${NC}          — Estado de todo"
echo -e "    ${YELLOW}netadmin-tunnel start${NC}    — Activar túnel CF (genera URL)"
echo -e "    ${YELLOW}netadmin-tunnel stop${NC}     — Desactivar túnel"
echo ""
echo -e "  ${CYAN}Desplegar panel web:${NC}"
echo -e "    ${YELLOW}scp -r dist/* root@${IP_ADDR}:/var/www/netadmin/${NC}"
echo ""
echo -e "  ${CYAN}DNS para tus dispositivos:${NC} ${GREEN}${IP_ADDR}${NC}"
echo -e "  ${CYAN}Proxy HTTP:${NC}               ${GREEN}${IP_ADDR}:3128${NC}"
echo ""
echo -e "  ${YELLOW}⚠ Certificado SSL Bump:${NC} /etc/squid/ssl_cert/netadmin-ca.pem"
echo ""
