---
name: Out of scope features
description: Features explicitly rejected — belong to user's other system, not NetAdmin
type: constraint
---
NetAdmin scope: optimización de navegación únicamente (DNS, AdGuard, Unbound, Lancache, QoS MikroTik, bufferbloat, monitoreo VPS/MikroTik, BBR).

NO construir en NetAdmin:
- Gestión de clientes PPPoE / Secrets
- Servidor RADIUS / FreeRADIUS / User Manager UI
- Gestión de planes/perfiles de clientes finales
- DHCP server para clientes finales
- WireGuard (gestión de túneles/peers)
- Facturación / billing
- Hotspot / captive portal para clientes

**Why:** El usuario tiene otro sistema dedicado a administración de clientes (RADIUS + CHR centralizado + WireGuard). NetAdmin debe mantenerse enfocado en optimización de red, no en gestión de clientes finales.
