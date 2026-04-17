# Memory: index.md
Updated: today

# Project Memory

## Core
NetAdmin: ISP optimization platform (Bequant alternative). Focus: navegación, NO gestión de clientes.
100% Docker compose: Node.js API (port 4000), AdGuard, Unbound, Lancache.
Base path: `/opt/netadmin/` with `/web` and `/data`.
Auth: Bearer token via `/data/tunnel/panel-pass.txt` (except `/api/speedtest/*`).
Architecture: VPS handles DNS/Cache, MikroTik handles routing, BBR forcing (QUIC block), and QoS.
Security: Port 53 restricted to private subnets via UFW.
Client management (PPPoE/RADIUS/WireGuard/billing) lives in user's OTHER system — never build it here.

## Memories
- [Out of scope](mem://scope/out-of-scope) — Features rejected: clientes, RADIUS, WireGuard, billing, hotspot
- [Visual Direction](mem://style/visual-direction) — Professional light theme, cyan glow, split-screen login
- [DNS Security](mem://features/dns-security) — AdGuard (port 53) and Unbound (port 5335) in Docker network
- [Dashboard Auth](mem://auth/dashboard-access) — Bearer token auth via /data/tunnel/panel-pass.txt
- [Performance Tuning](mem://features/optimizacion-rendimiento) — TCP BBR, TCP FastOpen, and 16MB kernel buffers on VPS
- [Cloudflare Tunnel](mem://features/cloudflare-tunnel) — Support for trycloudflare ephemeral or fixed token
- [Speed Test](mem://features/speed-test) — Custom /speedtest UI with public API, 100MB DL / 50MB UL
- [Hotspot Architecture](mem://architecture/planned-hotspot-design) — Cloudflare tunnel + MikroTik REST API for captive portal
- [Firewall Policy](mem://security/dns-firewall-policy) — UFW restricts port 53 to private subnets
- [Caching Services](mem://features/caching-services) — Lancache and apt-cacher-ng with 5min cron cleanup
- [Optimization Strategy](mem://architecture/optimization-strategy) — MikroTik DNS redirect, QUIC block for BBR, Mangle QoS
- [Branding Customization](mem://features/branding-customization) — ISP name, logo (Base64), colors saved in localStorage
- [Server Resource Monitoring](mem://features/server-resource-monitoring) — CPU/RAM/Disk stats, 3s polling, 3min rolling window
- [Multi-WAN Load Balancing](mem://features/mikrotik-load-balancing) — PCC, NTH, Bonding on MikroTik with Netwatch failover
- [Telegram Alerts](mem://features/telegram-alerts) — WAN state and packet loss alerts via Telegram bot
- [Architecture Stack](mem://architecture/stack) — Dockerized Node.js API, AdGuard, Unbound, Lancache, Squid
- [MikroTik Active Control](mem://features/mikrotik-active-control) — RouterOS v6/v7 config, QoS, MSS clamping, Stealth Mode
