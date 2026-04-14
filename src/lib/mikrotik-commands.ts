// MikroTik REST API command definitions for each configuration step
// These are translated from CLI commands to REST API calls

export interface MikroTikCommand {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  body?: Record<string, unknown>;
}

export function getStepCommands(step: number, serverIp: string, totalBw: number = 100): MikroTikCommand[] {
  const dnsBw = Math.max(1, Math.round(totalBw * 0.05));
  const voipBw = Math.max(1, Math.round(totalBw * 0.10));
  const clientBw = Math.max(1, totalBw - dnsBw - voipBw);
  switch (step) {
    case 1: // DNS
      return [
        { method: 'POST', endpoint: '/rest/ip/dns/set', body: { servers: serverIp, 'allow-remote-requests': 'yes' } },
        { method: 'PUT', endpoint: '/rest/ip/firewall/nat', body: { chain: 'dstnat', protocol: 'tcp', 'dst-port': '53', action: 'dst-nat', 'to-addresses': serverIp, 'to-ports': '53', comment: 'NetAdmin: Forzar DNS TCP' } },
        { method: 'PUT', endpoint: '/rest/ip/firewall/nat', body: { chain: 'dstnat', protocol: 'udp', 'dst-port': '53', action: 'dst-nat', 'to-addresses': serverIp, 'to-ports': '53', comment: 'NetAdmin: Forzar DNS UDP' } },
      ];
    case 2: // DHCP + PPPoE DNS
      return [
        { method: 'POST', endpoint: '/rest/ip/dhcp-server/network/set', body: { numbers: '*0', 'dns-server': serverIp } },
        { method: 'POST', endpoint: '/rest/ppp/profile/set', body: { numbers: 'default', 'dns-server': serverIp } },
      ];
    case 3: // Block QUIC
      return [
        { method: 'PUT', endpoint: '/rest/ip/firewall/filter', body: { chain: 'forward', protocol: 'udp', 'dst-port': '443', action: 'drop', comment: 'NetAdmin: Bloquear QUIC → forzar TCP BBR' } },
        { method: 'PUT', endpoint: '/rest/ip/firewall/filter', body: { chain: 'forward', protocol: 'udp', 'dst-port': '80', action: 'drop', comment: 'NetAdmin: Bloquear HTTP/3 alt' } },
      ];
    case 4: // Mangle
      return [
        { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', 'connection-mark': 'no-mark', action: 'mark-connection', 'new-connection-mark': 'client-traffic', passthrough: 'yes', comment: 'NetAdmin: Marcar tráfico clientes' } },
        { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', 'connection-mark': 'client-traffic', action: 'mark-packet', 'new-packet-mark': 'client-packets', passthrough: 'no', comment: 'NetAdmin: Paquetes clientes' } },
        { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', protocol: 'udp', 'dst-port': '53', action: 'mark-packet', 'new-packet-mark': 'dns-priority', passthrough: 'no', comment: 'NetAdmin: DNS prioridad alta' } },
        { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', protocol: 'udp', 'dst-port': '5060-5061', action: 'mark-packet', 'new-packet-mark': 'voip-priority', passthrough: 'no', comment: 'NetAdmin: VoIP prioridad alta' } },
      ];
    case 5: // Queue Tree
      return [
        { method: 'PUT', endpoint: '/rest/queue/tree', body: { name: 'Total-Download', parent: 'global', 'max-limit': `${totalBw}M`, comment: 'NetAdmin: BW total download' } },
        { method: 'PUT', endpoint: '/rest/queue/tree', body: { name: 'DNS-Priority', parent: 'Total-Download', 'packet-mark': 'dns-priority', priority: '1', 'max-limit': `${dnsBw}M`, comment: 'NetAdmin: DNS alta prioridad' } },
        { method: 'PUT', endpoint: '/rest/queue/tree', body: { name: 'VoIP-Priority', parent: 'Total-Download', 'packet-mark': 'voip-priority', priority: '2', 'max-limit': `${voipBw}M`, comment: 'NetAdmin: VoIP alta prioridad' } },
        { method: 'PUT', endpoint: '/rest/queue/tree', body: { name: 'Client-Traffic', parent: 'Total-Download', 'packet-mark': 'client-packets', priority: '5', 'max-limit': `${clientBw}M`, comment: 'NetAdmin: Tráfico general clientes' } },
      ];
    case 6: // Simple Queues (example)
      return [
        { method: 'PUT', endpoint: '/rest/ppp/profile', body: { name: 'plan-10mbps', 'rate-limit': '10M/10M', 'dns-server': serverIp, comment: 'NetAdmin: Plan 10Mbps' } },
      ];
    case 7: // MSS Clamping
      return [
        { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', protocol: 'tcp', 'tcp-flags': 'syn', action: 'change-mss', 'new-mss': 'clamp-to-pmtu', passthrough: 'yes', comment: 'NetAdmin: MSS Clamp forward' } },
        { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'postrouting', protocol: 'tcp', 'tcp-flags': 'syn', action: 'change-mss', 'new-mss': 'clamp-to-pmtu', passthrough: 'yes', comment: 'NetAdmin: MSS Clamp postrouting' } },
      ];
    case 8: // Connection Tracking Tuning
      return [
        { method: 'POST', endpoint: '/rest/ip/firewall/connection/tracking/set', body: { 'udp-timeout': '30s', 'udp-stream-timeout': '120s', 'icmp-timeout': '10s', 'generic-timeout': '120s', 'tcp-close-timeout': '10s', 'tcp-close-wait-timeout': '10s', 'tcp-fin-wait-timeout': '10s', 'tcp-last-ack-timeout': '10s', 'tcp-time-wait-timeout': '10s', 'tcp-syn-sent-timeout': '30s', 'tcp-syn-received-timeout': '10s', 'tcp-established-timeout': '7200s' } },
      ];
    case 9: // Stealth Mode - TTL Normalization
      return [
        // Normalize all outgoing TTL to 64
        { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'postrouting', action: 'change-ttl', 'new-ttl': 'set:64', passthrough: 'yes', comment: 'NetAdmin Stealth: TTL normalize to 64' } },
        // Normalize forwarded traffic TTL
        { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'forward', action: 'change-ttl', 'new-ttl': 'set:64', passthrough: 'yes', comment: 'NetAdmin Stealth: TTL forward normalize' } },
        // Limit simultaneous connections per client (prevent detection by high conn count)
        { method: 'PUT', endpoint: '/rest/ip/firewall/filter', body: { chain: 'forward', protocol: 'tcp', 'connection-limit': '200,32', action: 'drop', comment: 'NetAdmin Stealth: Limit TCP conn/client' } },
        { method: 'PUT', endpoint: '/rest/ip/firewall/filter', body: { chain: 'forward', protocol: 'udp', 'connection-limit': '100,32', action: 'drop', comment: 'NetAdmin Stealth: Limit UDP conn/client' } },
        // Force consistent MSS for uniform packet fingerprint
        { method: 'PUT', endpoint: '/rest/ip/firewall/mangle', body: { chain: 'postrouting', protocol: 'tcp', 'tcp-flags': 'syn', action: 'change-mss', 'new-mss': '1360', passthrough: 'yes', comment: 'NetAdmin Stealth: Uniform MSS 1360' } },
      ];
    default:
      return [];
  }
}

export const stepLabels: Record<number, string> = {
  1: 'Configurar DNS',
  2: 'Configurar DHCP/PPPoE',
  3: 'Bloquear QUIC',
  4: 'Crear reglas Mangle',
  5: 'Crear Queue Tree',
  6: 'Crear perfil PPPoE',
  7: 'MSS Clamping',
  8: 'Connection Tracking',
  9: 'Modo Stealth',
};
