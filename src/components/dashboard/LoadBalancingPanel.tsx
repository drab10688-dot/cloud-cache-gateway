import { useState, useEffect, useCallback, useRef } from "react";
import {
  Router, Loader2, CheckCircle, XCircle, Play,
  Network, Shuffle, Link2, GitBranch, AlertTriangle, Info,
  Activity, ArrowDown, ArrowUp, RefreshCw, ShieldCheck,
  Clock, History, Send, Bell, BellOff, MessageCircle,
  Wifi, Shield, Copy, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { mikrotikDeviceApi, getDevice, type MikroTikDevice } from "@/lib/mikrotik-api";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

type BalanceMethod = "pcc" | "nth" | "bonding" | "routing";
type ClientType = "pppoe" | "dhcp";
type WanMode = "static" | "dhcp";

interface MkInterface {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  comment?: string;
}

interface WanConfig {
  mode: WanMode;
  ip: string;        // e.g. 192.168.1.10
  cidr: number;      // e.g. 24
  gateway: string;   // e.g. 192.168.1.1
}

interface TrafficPoint {
  time: string;
  [key: string]: string | number;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const methodInfo: Record<BalanceMethod, { label: string; icon: React.ElementType; description: string; color: string }> = {
  pcc: {
    label: "PCC (Per Connection Classifier)",
    icon: Shuffle,
    description: "Distribuye conexiones por hash origen/destino. Cada conexión se mantiene en la misma WAN. Ideal para WANs con diferente velocidad.",
    color: "text-primary",
  },
  nth: {
    label: "NTH (Round Robin)",
    icon: GitBranch,
    description: "Distribuye paquetes secuencialmente entre WANs. Simple y efectivo con WANs de igual velocidad.",
    color: "text-success",
  },
  bonding: {
    label: "Bonding",
    icon: Link2,
    description: "Combina interfaces en una sola lógica. Máximo throughput agregado. Requiere WANs del mismo tipo.",
    color: "text-warning",
  },
  routing: {
    label: "Balanceo por Ruteo (División de clientes)",
    icon: Network,
    description: "Asigna grupos de clientes PPPoE/DHCP a diferentes WANs equitativamente.",
    color: "text-chart-2",
  },
};

// ─── Robust clipboard helper ──────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallthrough
  }
  // Fallback for non-secure contexts (HTTP, older browsers)
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ─── WAN Setup script ─────────────────────────────────────

function generateWanSetupBlock(wans: string[], wanConfigs: Record<string, WanConfig>): string {
  const lines: string[] = [
    "# ═══════════════════════════════════════════",
    "# CONFIGURACIÓN WAN (IP estática / DHCP)",
    "# ═══════════════════════════════════════════",
    "",
  ];

  wans.forEach((wan) => {
    const cfg = wanConfigs[wan];
    if (!cfg) return;
    lines.push(`# --- ${wan} (${cfg.mode.toUpperCase()}) ---`);
    if (cfg.mode === "static") {
      if (cfg.ip && cfg.cidr) {
        lines.push(
          `/ip address add address=${cfg.ip}/${cfg.cidr} interface=${wan} comment="NetAdmin WAN: IP estática ${wan}"`
        );
      }
      if (cfg.gateway) {
        lines.push(
          `/ip route add dst-address=0.0.0.0/0 gateway=${cfg.gateway} distance=1 check-gateway=ping comment="NetAdmin WAN: Gateway ${wan}"`
        );
      }
    } else {
      lines.push(
        `/ip dhcp-client add interface=${wan} disabled=no add-default-route=yes default-route-distance=1 comment="NetAdmin WAN: DHCP ${wan}"`
      );
    }
    lines.push("");
  });

  return lines.join("\n");
}

// ─── Failover script block (shared) ──────────────────────

function generateFailoverBlock(wans: string[]): string {
  const lines: string[] = [
    "",
    "# ═══════════════════════════════════════════",
    "# FAILOVER AUTOMÁTICO — Netwatch",
    "# ═══════════════════════════════════════════",
    "",
  ];

  const pingTargets = ["8.8.8.8", "1.1.1.1", "8.8.4.4", "9.9.9.9", "208.67.222.222"];

  wans.forEach((wan, i) => {
    const pingIp = pingTargets[i % pingTargets.length];
    const upScript = `:log warning \\"NetAdmin: ${wan} UP - restaurando rutas\\"; /ip route set [find comment~\\"NetAdmin.*${wan}\\"] disabled=no; /ip firewall mangle set [find comment~\\"NetAdmin.*${wan}\\"] disabled=no`;
    const downScript = `:log error \\"NetAdmin: ${wan} DOWN - activando failover\\"; /ip route set [find comment~\\"NetAdmin.*${wan}\\"] disabled=yes; /ip firewall mangle set [find comment~\\"NetAdmin.*${wan}\\"] disabled=yes`;
    lines.push(
      `# --- Failover: ${wan} (ping ${pingIp}) ---`,
      `/ip route add dst-address=${pingIp}/32 gateway=${wan} scope=10 comment="NetAdmin Failover: Ping target ${wan}"`,
      `/tool netwatch add host=${pingIp} interval=10s timeout=3s up-script="${upScript}" down-script="${downScript}" comment="NetAdmin Failover: Monitor ${wan}"`,
      "",
    );
  });

  return lines.join("\n");
}

// ─── Hotspot script generator ────────────────────────────

function generateHotspotScript(opts: {
  bridge: string;
  hotspotName: string;
  network: string;     // e.g. 10.5.50.0
  gatewayIp: string;   // e.g. 10.5.50.1
  cidr: number;        // e.g. 24
  poolStart: string;   // e.g. 10.5.50.10
  poolEnd: string;     // e.g. 10.5.50.250
  dnsServer: string;   // e.g. 8.8.8.8
  htmlDir: string;     // e.g. hotspot
}): string {
  const { bridge, hotspotName, network, gatewayIp, cidr, poolStart, poolEnd, dnsServer, htmlDir } = opts;
  return [
    `# === NetAdmin: HOTSPOT (compatible con balanceo) ===`,
    `# Hotspot sobre bridge "${bridge}". Red ${network}/${cidr}, gateway ${gatewayIp}.`,
    `# IMPORTANTE: el bridge LAN debe existir antes (creado por el script de balanceo).`,
    "",
    "# 1. Asignar IP al bridge (gateway del hotspot)",
    `/ip address add address=${gatewayIp}/${cidr} interface=${bridge} comment="NetAdmin Hotspot: Gateway"`,
    "",
    "# 2. Pool de IPs para clientes",
    `/ip pool add name=hs-pool-${hotspotName} ranges=${poolStart}-${poolEnd} comment="NetAdmin Hotspot: Pool clientes"`,
    "",
    "# 3. Profile DHCP",
    `/ip dhcp-server add name=dhcp-${hotspotName} interface=${bridge} address-pool=hs-pool-${hotspotName} disabled=no comment="NetAdmin Hotspot: DHCP server"`,
    `/ip dhcp-server network add address=${network}/${cidr} gateway=${gatewayIp} dns-server=${dnsServer} comment="NetAdmin Hotspot: DHCP network"`,
    "",
    "# 4. Profile Hotspot",
    `/ip hotspot profile add name=hsprof-${hotspotName} hotspot-address=${gatewayIp} dns-name=hotspot.local html-directory=${htmlDir} login-by=http-chap,http-pap,cookie http-cookie-lifetime=1d comment="NetAdmin Hotspot: Profile"`,
    "",
    "# 5. User profile (limites por defecto, edita rate-limit a tu gusto)",
    `/ip hotspot user profile add name=default-${hotspotName} rate-limit="5M/5M" shared-users=1 session-timeout=12h idle-timeout=10m comment="NetAdmin Hotspot: User profile default"`,
    "",
    "# 6. Servidor Hotspot sobre el bridge",
    `/ip hotspot add name=${hotspotName} interface=${bridge} address-pool=hs-pool-${hotspotName} profile=hsprof-${hotspotName} disabled=no comment="NetAdmin Hotspot: Server"`,
    "",
    "# 7. Walled-garden mínimo (DNS público y captive portal helpers)",
    `/ip hotspot walled-garden add dst-host=*.gstatic.com comment="NetAdmin Hotspot: WG Google captive"`,
    `/ip hotspot walled-garden add dst-host=*.apple.com comment="NetAdmin Hotspot: WG Apple captive"`,
    `/ip hotspot walled-garden add dst-host=*.msftconnecttest.com comment="NetAdmin Hotspot: WG MS captive"`,
    "",
    "# 8. Usuario de ejemplo (cámbialo / créalos desde MikroTik)",
    `/ip hotspot user add name=demo password=demo profile=default-${hotspotName} comment="NetAdmin Hotspot: Usuario demo"`,
    "",
    "# 9. NAT para clientes hotspot (usa la WAN según el balanceo configurado)",
    `/ip firewall nat add chain=srcnat src-address=${network}/${cidr} action=masquerade comment="NetAdmin Hotspot: NAT clientes"`,
    "",
    "# Listo. El captive portal se mostrará al conectarse a la red.",
  ].join("\n");
}

// ─── Firewall protection script generator ───────────────

function generateFirewallScript(wans: string[], lanSubnet: string): string {
  const wanList = wans.length > 0 ? wans.join(",") : "ether1";
  return [
    "# === NetAdmin: FIREWALL DE PROTECCIÓN MikroTik ===",
    "# Reglas recomendadas para proteger el router de ataques externos.",
    `# WANs protegidas: ${wanList}`,
    `# LAN confiada: ${lanSubnet}`,
    "# REVISA ANTES DE APLICAR: si gestionas el router por IP pública, ajusta acceso admin.",
    "",
    "# 1. Address-lists base",
    `/ip firewall address-list add list=NetAdmin-LAN address=${lanSubnet} comment="NetAdmin FW: Red LAN confiada"`,
    `/ip firewall address-list add list=NetAdmin-Bogons address=0.0.0.0/8 comment="NetAdmin FW: Bogon"`,
    `/ip firewall address-list add list=NetAdmin-Bogons address=10.0.0.0/8 comment="NetAdmin FW: Bogon RFC1918"`,
    `/ip firewall address-list add list=NetAdmin-Bogons address=127.0.0.0/8 comment="NetAdmin FW: Loopback"`,
    `/ip firewall address-list add list=NetAdmin-Bogons address=169.254.0.0/16 comment="NetAdmin FW: Link local"`,
    `/ip firewall address-list add list=NetAdmin-Bogons address=172.16.0.0/12 comment="NetAdmin FW: Bogon RFC1918"`,
    `/ip firewall address-list add list=NetAdmin-Bogons address=192.168.0.0/16 comment="NetAdmin FW: Bogon RFC1918"`,
    `/ip firewall address-list add list=NetAdmin-Bogons address=224.0.0.0/3 comment="NetAdmin FW: Multicast/Reservado"`,
    "",
    "# 2. INPUT chain — proteger al router",
    `/ip firewall filter add chain=input action=accept connection-state=established,related comment="NetAdmin FW: Input established/related"`,
    `/ip firewall filter add chain=input action=drop connection-state=invalid comment="NetAdmin FW: Drop invalid"`,
    `/ip firewall filter add chain=input action=accept protocol=icmp limit=50/5s,2 comment="NetAdmin FW: ICMP rate-limit"`,
    `/ip firewall filter add chain=input action=accept src-address-list=NetAdmin-LAN comment="NetAdmin FW: Permitir LAN al router"`,
    `/ip firewall filter add chain=input action=accept in-interface=lo comment="NetAdmin FW: Permitir loopback"`,
    "",
    "# 3. Bruteforce SSH/Winbox/API → blacklist progresiva (24h)",
    `/ip firewall filter add chain=input protocol=tcp dst-port=22,8291,8728,8729 src-address-list=NetAdmin-Blacklist action=drop comment="NetAdmin FW: Drop blacklisted attackers"`,
    `/ip firewall filter add chain=input protocol=tcp dst-port=22,8291,8728,8729 connection-state=new src-address-list=NetAdmin-Stage3 action=add-src-to-address-list address-list=NetAdmin-Blacklist address-list-timeout=1d comment="NetAdmin FW: Stage3 → Blacklist 24h"`,
    `/ip firewall filter add chain=input protocol=tcp dst-port=22,8291,8728,8729 connection-state=new src-address-list=NetAdmin-Stage2 action=add-src-to-address-list address-list=NetAdmin-Stage3 address-list-timeout=1m comment="NetAdmin FW: Stage2 → Stage3"`,
    `/ip firewall filter add chain=input protocol=tcp dst-port=22,8291,8728,8729 connection-state=new src-address-list=NetAdmin-Stage1 action=add-src-to-address-list address-list=NetAdmin-Stage2 address-list-timeout=1m comment="NetAdmin FW: Stage1 → Stage2"`,
    `/ip firewall filter add chain=input protocol=tcp dst-port=22,8291,8728,8729 connection-state=new action=add-src-to-address-list address-list=NetAdmin-Stage1 address-list-timeout=1m comment="NetAdmin FW: New → Stage1"`,
    "",
    "# 4. Bloquear bogons/scan en INPUT desde WAN",
    ...wans.map(w =>
      `/ip firewall filter add chain=input in-interface=${w} src-address-list=NetAdmin-Bogons action=drop comment="NetAdmin FW: Drop bogons WAN ${w}"`
    ),
    `/ip firewall filter add chain=input action=drop comment="NetAdmin FW: Drop all otros INPUT"`,
    "",
    "# 5. FORWARD chain — proteger clientes",
    `/ip firewall filter add chain=forward action=fasttrack-connection connection-state=established,related comment="NetAdmin FW: FastTrack established"`,
    `/ip firewall filter add chain=forward action=accept connection-state=established,related comment="NetAdmin FW: Forward established/related"`,
    `/ip firewall filter add chain=forward action=drop connection-state=invalid comment="NetAdmin FW: Forward drop invalid"`,
    ...wans.map(w =>
      `/ip firewall filter add chain=forward in-interface=${w} connection-state=new connection-nat-state=!dstnat action=drop comment="NetAdmin FW: Drop entrada no-NAT ${w}"`
    ),
    "",
    "# 6. Anti-flood SYN/UDP",
    `/ip firewall filter add chain=forward protocol=tcp tcp-flags=syn connection-limit=200,32 action=drop comment="NetAdmin FW: SYN flood limit"`,
    `/ip firewall filter add chain=forward protocol=udp connection-limit=300,32 action=drop comment="NetAdmin FW: UDP flood limit"`,
    "",
    "# 7. Desactivar servicios MikroTik no necesarios (recomendado)",
    `/ip service disable telnet comment="NetAdmin FW: Disable telnet"`,
    `/ip service disable ftp comment="NetAdmin FW: Disable ftp"`,
    `/ip service disable www comment="NetAdmin FW: Disable HTTP admin"`,
    `/ip service disable api comment="NetAdmin FW: Disable API legacy"`,
    `/ip service set winbox address=${lanSubnet} comment="NetAdmin FW: Winbox solo desde LAN"`,
    `/ip service set ssh address=${lanSubnet} comment="NetAdmin FW: SSH solo desde LAN"`,
    `/ip service set api-ssl address=${lanSubnet} comment="NetAdmin FW: API-SSL solo desde LAN"`,
    "",
    "# 8. Neighbor discovery solo en LAN (oculta el router en WAN)",
    `/ip neighbor discovery-settings set discover-interface-list=!WAN comment="NetAdmin FW: Hide neighbor on WAN"`,
    "",
    "# 9. MAC server solo en LAN",
    `/tool mac-server set allowed-interface-list=LAN comment="NetAdmin FW: MAC server LAN only"`,
    `/tool mac-server mac-winbox set allowed-interface-list=LAN comment="NetAdmin FW: MAC winbox LAN only"`,
    "",
    "# Listo. Revisa /log print para ver bloqueos.",
  ].join("\n");
}

// ─── Script generators (balanceo) ───────────────────────

function generatePCCScript(wans: string[], bridge: string, lans: string[], failover: boolean, wanConfigs: Record<string, WanConfig>): string {
  const lines: string[] = [
    `# === NetAdmin: Balanceo PCC con ${wans.length} WANs + ${failover ? "Failover" : "Sin Failover"} ===`,
    `# Bridge LAN: ${bridge} (${lans.join(", ")})`,
    "",
    generateWanSetupBlock(wans, wanConfigs),
    "# 1. Crear bridge LAN",
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN balanceo"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l} comment="NetAdmin: LAN port"`),
    "",
    "# 2. Crear routing-tables (RouterOS v7 — REQUERIDO antes de mark-routing)",
    ...wans.map((_, i) => `/routing table add name=to_WAN${i + 1} fib disabled=no comment="NetAdmin PCC: Tabla WAN${i + 1}"`),
    "",
    "# 3. Mangle: Marcar conexiones por PCC",
  ];

  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting in-interface=${bridge} dst-address-type=!local per-connection-classifier=both-addresses-and-ports:${wans.length}/${i} action=mark-connection new-connection-mark=WAN${i + 1}_conn passthrough=yes comment="NetAdmin PCC: Conexiones → ${wan}"`
    );
  });

  lines.push("");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting connection-mark=WAN${i + 1}_conn action=mark-routing new-routing-mark=to_WAN${i + 1} passthrough=yes comment="NetAdmin PCC: Ruteo → ${wan}"`
    );
  });

  lines.push("", "# 4. NAT por cada WAN");
  wans.forEach((wan) => {
    lines.push(`/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade comment="NetAdmin PCC: NAT ${wan}"`);
  });

  lines.push("", "# 5. Rutas por tabla (v7: routing-table=, NO routing-mark=)");
  wans.forEach((wan, i) => {
    const cfg = wanConfigs[wan];
    const gw = cfg?.mode === "static" && cfg.gateway ? cfg.gateway : wan;
    lines.push(
      `/ip route add dst-address=0.0.0.0/0 gateway=${gw} routing-table=to_WAN${i + 1} check-gateway=ping comment="NetAdmin PCC: Ruta ${wan}"`
    );
  });

  if (failover) lines.push(generateFailoverBlock(wans));

  return lines.join("\n");
}

function generateNTHScript(wans: string[], bridge: string, lans: string[], failover: boolean, wanConfigs: Record<string, WanConfig>): string {
  const lines: string[] = [
    `# === NetAdmin: Balanceo NTH con ${wans.length} WANs + ${failover ? "Failover" : "Sin Failover"} ===`,
    "",
    generateWanSetupBlock(wans, wanConfigs),
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN balanceo"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l}`),
    "",
    "# Crear routing-tables (RouterOS v7 — REQUERIDO)",
    ...wans.map((_, i) => `/routing table add name=to_WAN${i + 1} fib disabled=no comment="NetAdmin NTH: Tabla WAN${i + 1}"`),
    "",
    "# Mangle NTH",
  ];

  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting in-interface=${bridge} dst-address-type=!local connection-state=new nth=${wans.length},${i + 1} action=mark-connection new-connection-mark=WAN${i + 1}_conn passthrough=yes comment="NetAdmin NTH: ${wan}"`
    );
  });

  lines.push("");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting connection-mark=WAN${i + 1}_conn action=mark-routing new-routing-mark=to_WAN${i + 1} passthrough=yes comment="NetAdmin NTH: Ruteo ${wan}"`
    );
  });

  lines.push("", "# NAT y Rutas (v7: routing-table=, NO routing-mark=)");
  wans.forEach((wan, i) => {
    const cfg = wanConfigs[wan];
    const gw = cfg?.mode === "static" && cfg.gateway ? cfg.gateway : wan;
    lines.push(
      `/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade comment="NetAdmin NTH: NAT ${wan}"`,
      `/ip route add dst-address=0.0.0.0/0 gateway=${gw} routing-table=to_WAN${i + 1} check-gateway=ping comment="NetAdmin NTH: Ruta ${wan}"`
    );
  });

  if (failover) lines.push(generateFailoverBlock(wans));

  return lines.join("\n");
}

function generateBondingScript(wans: string[], bridge: string, lans: string[], failover: boolean, wanConfigs: Record<string, WanConfig>): string {
  const mode = failover ? "active-backup" : "balance-rr";
  const lines: string[] = [
    `# === NetAdmin: Bonding con ${wans.length} interfaces (${mode}) ===`,
    `# IMPORTANTE: los slaves del bonding NO deben tener IP ni pertenecer a otro bridge.`,
    "",
    generateWanSetupBlock(wans, wanConfigs),
    `# 1. Crear bonding sobre las WANs`,
    `/interface bonding add name=bond-wan mode=${mode} slaves=${wans.join(",")} primary=${wans[0]} comment="NetAdmin: Bonding WAN (${mode})"`,
    "",
    `# 2. Crear bridge LAN`,
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l} comment="NetAdmin: LAN port"`),
    "",
    `# 3. NAT y ruta default sobre el bonding`,
    `/ip firewall nat add chain=srcnat out-interface=bond-wan action=masquerade comment="NetAdmin: NAT Bonding"`,
    `/ip route add dst-address=0.0.0.0/0 gateway=bond-wan check-gateway=ping comment="NetAdmin: Ruta Bonding"`,
  ];

  if (failover) {
    lines.push(
      "",
      "# ═══ Failover Bonding ═══",
      `/tool netwatch add host=8.8.8.8 interval=10s timeout=3s up-script=":log warning \\"NetAdmin: Bonding conectividad restaurada\\"" down-script=":log error \\"NetAdmin: Bonding sin conectividad externa\\"" comment="NetAdmin Failover: Monitor Bonding"`,
    );
  }

  return lines.join("\n");
}

function generateRoutingScript(
  wans: string[],
  bridge: string,
  lans: string[],
  clientType: ClientType,
  totalClients: number,
  failover: boolean,
  wanConfigs: Record<string, WanConfig>
): string {
  const perWan = Math.floor(totalClients / wans.length);
  const remainder = totalClients % wans.length;

  const lines: string[] = [
    `# === NetAdmin: Balanceo por Ruteo — ${totalClients} clientes ${clientType.toUpperCase()} ÷ ${wans.length} WANs ===`,
    `# ${failover ? "CON" : "SIN"} Failover automático`,
    `# Distribución: ${wans.map((w, i) => `${w} → ${perWan + (i < remainder ? 1 : 0)} clientes`).join(", ")}`,
    "",
    generateWanSetupBlock(wans, wanConfigs),
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l}`),
    "",
  ];

  lines.push("# Crear routing-tables (RouterOS v7)");
  wans.forEach((wan) => {
    lines.push(`/routing table add name=to_${wan} fib disabled=no comment="NetAdmin Routing: Tabla ${wan}"`);
  });
  lines.push("");

  if (clientType === "pppoe") {
    lines.push("# Crear pools PPPoE");
    wans.forEach((wan, i) => {
      const count = perWan + (i < remainder ? 1 : 0);
      const lastOctet = Math.min(254, ((count + 1) % 254) || 254);
      const thirdOctet = Math.max(0, Math.ceil((count + 1) / 254) - 1);
      lines.push(
        `/ip pool add name=pool-${wan} ranges=10.${i + 1}.0.2-10.${i + 1}.${thirdOctet}.${lastOctet} comment="NetAdmin: Pool ${wan} (${count} clientes)"`
      );
    });

    lines.push("", "# Crear perfiles PPPoE por WAN");
    wans.forEach((wan, i) => {
      const count = perWan + (i < remainder ? 1 : 0);
      lines.push(
        `/ppp profile add name=plan-${wan} local-address=10.${i + 1}.0.1 remote-address=pool-${wan} dns-server=8.8.8.8 comment="NetAdmin Routing: ${count} clientes → ${wan}"`
      );
    });

    lines.push("", "# Marcar tráfico de cada pool y rutear por WAN");
    wans.forEach((wan, i) => {
      lines.push(
        `/ip firewall mangle add chain=prerouting src-address=10.${i + 1}.0.0/16 action=mark-routing new-routing-mark=to_${wan} passthrough=yes comment="NetAdmin Routing: Pool ${wan}"`
      );
    });
  } else {
    lines.push("# Crear pools DHCP por WAN");
    wans.forEach((wan, i) => {
      const count = perWan + (i < remainder ? 1 : 0);
      lines.push(
        `/ip pool add name=pool-${wan} ranges=192.168.${10 + i}.2-192.168.${10 + i}.${Math.min(254, count + 1)} comment="NetAdmin: Pool DHCP ${wan} (${count} clientes)"`,
        `/ip address add address=192.168.${10 + i}.1/24 interface=${bridge} comment="NetAdmin: Gateway pool ${wan}"`
      );
    });

    lines.push("", "# Mangle por subred → WAN");
    wans.forEach((wan, i) => {
      lines.push(
        `/ip firewall mangle add chain=prerouting src-address=192.168.${10 + i}.0/24 action=mark-routing new-routing-mark=to_${wan} passthrough=yes comment="NetAdmin Routing: Subnet → ${wan}"`
      );
    });
  }

  lines.push("", "# NAT y Rutas por WAN (v7: usa routing-table=, no routing-mark=)");
  wans.forEach((wan) => {
    const cfg = wanConfigs[wan];
    const gw = cfg?.mode === "static" && cfg.gateway ? cfg.gateway : wan;
    lines.push(
      `/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade comment="NetAdmin Routing: NAT ${wan}"`,
      `/ip route add dst-address=0.0.0.0/0 gateway=${gw} routing-table=to_${wan} check-gateway=ping comment="NetAdmin Routing: Ruta ${wan}"`
    );
  });

  if (failover) lines.push(generateFailoverBlock(wans));

  return lines.join("\n");
}

// ─── Telegram Config + Failover Event Log Component ─────

interface FailoverEvent {
  time: string;
  wan: string;
  status: "UP" | "DOWN";
  message: string;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

function FailoverLog({ wans }: { wans: string[] }) {
  const [events, setEvents] = useState<FailoverEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Telegram state
  const [tgConfig, setTgConfig] = useState<TelegramConfig>({ botToken: "", chatId: "", enabled: false });
  const [tgSaving, setTgSaving] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgMsg, setTgMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showTgConfig, setShowTgConfig] = useState(false);
  const [pingLossThreshold] = useState(15);

  const alertedRef = useRef<Set<string>>(new Set());
  const pingFailCountRef = useRef<Record<string, number>>({});

  useEffect(() => {
    api.getTelegramConfig().then((res: any) => {
      if (res.botToken || res.chatId) {
        setTgConfig({ botToken: res.botToken || "", chatId: res.chatId || "", enabled: res.enabled ?? false });
      }
    }).catch(() => {});
  }, []);

  const saveTelegramConfig = async () => {
    setTgSaving(true);
    setTgMsg(null);
    try {
      const res = await api.setTelegramConfig(tgConfig.botToken, tgConfig.chatId, tgConfig.enabled);
      if (res.success) setTgMsg({ type: "success", text: "Configuración de Telegram guardada" });
      else setTgMsg({ type: "error", text: res.error || "Error al guardar" });
    } catch {
      setTgMsg({ type: "error", text: "Error de conexión" });
    } finally {
      setTgSaving(false);
    }
  };

  const testTelegram = async () => {
    setTgTesting(true);
    setTgMsg(null);
    try {
      const res = await api.sendTelegramTest();
      if (res.success) setTgMsg({ type: "success", text: "✅ Mensaje de prueba enviado." });
      else setTgMsg({ type: "error", text: res.error || "Error al enviar prueba" });
    } catch {
      setTgMsg({ type: "error", text: "Error de conexión" });
    } finally {
      setTgTesting(false);
    }
  };

  const sendAlert = useCallback(async (event: FailoverEvent) => {
    const key = `${event.time}-${event.wan}-${event.status}`;
    if (alertedRef.current.has(key)) return;
    alertedRef.current.add(key);
    const emoji = event.status === "DOWN" ? "🔴" : "🟢";
    const statusText = event.status === "DOWN" ? "CAÍDA" : "RECUPERADA";
    const msg = `${emoji} *WAN ${statusText}*\n\n📡 Interfaz: \`${event.wan}\`\n🕐 Hora: \`${event.time}\`\n📝 ${event.message}`;
    try { await api.sendTelegramAlert(msg); } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await mikrotikDeviceApi.execute([`/log/print where message~"NetAdmin"`]);
      if (result.results && Array.isArray(result.results)) {
        const parsed: FailoverEvent[] = result.results
          .filter((r: any) => {
            const msg = (r.message || "").toLowerCase();
            return msg.includes("up") || msg.includes("down");
          })
          .map((r: any) => {
            const msg: string = r.message || "";
            const isDown = msg.toLowerCase().includes("down");
            const matchedWan = wans.find(w => msg.includes(w)) || "unknown";
            return {
              time: r.time || r[".time"] || "—",
              wan: matchedWan,
              status: isDown ? "DOWN" as const : "UP" as const,
              message: msg,
            };
          })
          .reverse()
          .slice(0, 100);
        setEvents(parsed);
        if (tgConfig.enabled && tgConfig.botToken && tgConfig.chatId) {
          parsed.forEach(ev => sendAlert(ev));
        }
      }
    } catch (e: any) {
      setError(e.message || "Error al leer logs");
    } finally {
      setLoading(false);
    }
  }, [wans, tgConfig.enabled, tgConfig.botToken, tgConfig.chatId, sendAlert]);

  useEffect(() => {
    if (!tgConfig.enabled || wans.length === 0) return;
    const checkPingLoss = async () => {
      for (const wan of wans) {
        try {
          const result = await mikrotikDeviceApi.execute([`/ping 8.8.8.8 interface=${wan} count=1`]);
          const hasResponse = result.results?.[0]?.["received"] !== "0" && result.results?.[0]?.["received"] !== undefined;
          if (!hasResponse) {
            pingFailCountRef.current[wan] = (pingFailCountRef.current[wan] || 0) + 1;
            if (pingFailCountRef.current[wan] === pingLossThreshold) {
              const msg = `⚠️ *ALERTA: Pérdida de ping crítica*\n\n📡 Interfaz: \`${wan}\`\n❌ ${pingLossThreshold} pings consecutivos fallidos\n🕐 ${new Date().toLocaleTimeString("es")}`;
              try { await api.sendTelegramAlert(msg); } catch {}
            }
          } else {
            if (pingFailCountRef.current[wan] >= pingLossThreshold) {
              const msg = `✅ *Ping restaurado*\n\n📡 Interfaz: \`${wan}\`\n🔄 Conectividad recuperada después de ${pingFailCountRef.current[wan]} fallos\n🕐 ${new Date().toLocaleTimeString("es")}`;
              try { await api.sendTelegramAlert(msg); } catch {}
            }
            pingFailCountRef.current[wan] = 0;
          }
        } catch {}
      }
    };
    const id = setInterval(checkPingLoss, 10000);
    return () => clearInterval(id);
  }, [tgConfig.enabled, wans, pingLossThreshold]);

  useEffect(() => { if (wans.length > 0) fetchLogs(); }, [wans, fetchLogs]);
  useEffect(() => {
    if (wans.length === 0) return;
    const id = setInterval(fetchLogs, 30000);
    return () => clearInterval(id);
  }, [wans, fetchLogs]);

  if (wans.length === 0) return null;

  const downEvents = events.filter(e => e.status === "DOWN");
  const upEvents = events.filter(e => e.status === "UP");

  return (
    <div className="card-glow rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Historial de Eventos Failover
        </h3>
        <div className="flex gap-2">
          <Button variant={showTgConfig ? "default" : "outline"} size="sm" onClick={() => setShowTgConfig(!showTgConfig)} className="gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" />
            Telegram
          </Button>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Actualizar
          </Button>
        </div>
      </div>

      {showTgConfig && (
        <div className="bg-secondary/50 rounded-lg p-4 space-y-4 border border-border">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-chart-2" />
              Alertas por Telegram
            </h4>
            <button
              onClick={async () => {
                const newEnabled = !tgConfig.enabled;
                setTgConfig({ ...tgConfig, enabled: newEnabled });
                if (tgConfig.botToken && tgConfig.chatId) {
                  try {
                    await api.setTelegramConfig(tgConfig.botToken, tgConfig.chatId, newEnabled);
                    setTgMsg({ type: "success", text: newEnabled ? "✅ Bot activado" : "Bot desactivado" });
                  } catch {
                    setTgMsg({ type: "error", text: "Error al cambiar estado del bot" });
                    setTgConfig(prev => ({ ...prev, enabled: !newEnabled }));
                  }
                }
              }}
              disabled={!tgConfig.botToken || !tgConfig.chatId}
              className={`relative w-12 h-6 rounded-full transition-all ${tgConfig.enabled ? "bg-success" : "bg-muted"} ${!tgConfig.botToken || !tgConfig.chatId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${tgConfig.enabled ? "left-6" : "left-0.5"}`} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Bot Token (de @BotFather)</label>
              <Input type="password" value={tgConfig.botToken} onChange={e => setTgConfig(prev => ({ ...prev, botToken: e.target.value }))} className="bg-background border-border font-mono text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Chat ID (de @userinfobot)</label>
              <Input value={tgConfig.chatId} onChange={e => setTgConfig(prev => ({ ...prev, chatId: e.target.value }))} className="bg-background border-border font-mono text-xs" />
            </div>
          </div>
          {tgMsg && (
            <div className={`flex items-center gap-2 text-xs font-mono p-3 rounded-md ${tgMsg.type === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {tgMsg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {tgMsg.text}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={saveTelegramConfig} disabled={tgSaving} size="sm" className="gap-1.5">
              {tgSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              Guardar
            </Button>
            <Button variant="outline" size="sm" onClick={testTelegram} disabled={tgTesting || !tgConfig.botToken || !tgConfig.chatId} className="gap-1.5">
              {tgTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar Prueba
            </Button>
          </div>
          {tgConfig.enabled && (
            <div className="bg-success/10 border border-success/30 rounded-md p-3">
              <p className="text-xs text-foreground flex items-center gap-2">
                <Bell className="h-3.5 w-3.5 text-success" />
                <strong>Alertas activas</strong>
              </p>
            </div>
          )}
          {!tgConfig.enabled && tgConfig.botToken && tgConfig.chatId && (
            <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
              <p className="text-xs text-foreground flex items-center gap-2">
                <BellOff className="h-3.5 w-3.5 text-warning" />
                Configurado pero <strong>desactivado</strong>
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <p className="text-lg font-bold font-mono text-foreground">{events.length}</p>
          <p className="text-xs text-muted-foreground">Total eventos</p>
        </div>
        <div className="bg-destructive/10 rounded-lg p-3 text-center">
          <p className="text-lg font-bold font-mono text-destructive">{downEvents.length}</p>
          <p className="text-xs text-muted-foreground">Caídas (DOWN)</p>
        </div>
        <div className="bg-success/10 rounded-lg p-3 text-center">
          <p className="text-lg font-bold font-mono text-success">{upEvents.length}</p>
          <p className="text-xs text-muted-foreground">Recuperaciones (UP)</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {wans.map(wan => {
          const wanEvents = events.filter(e => e.wan === wan);
          const lastEvent = wanEvents[0];
          const isUp = !lastEvent || lastEvent.status === "UP";
          return (
            <div key={wan} className={`rounded-lg p-3 border-2 ${isUp ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono font-semibold text-foreground">{wan}</span>
                {isUp ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
              </div>
              <p className={`text-xs font-bold ${isUp ? "text-success" : "text-destructive"}`}>{isUp ? "ACTIVO" : "CAÍDO"}</p>
              {lastEvent && <p className="text-xs text-muted-foreground font-mono mt-1">{lastEvent.time}</p>}
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {events.length > 0 ? (
        <div className="max-h-72 overflow-y-auto space-y-1">
          {events.map((event, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs ${event.status === "DOWN" ? "bg-destructive/10 border-l-2 border-l-destructive" : "bg-success/10 border-l-2 border-l-success"}`}>
              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-mono text-muted-foreground w-28 shrink-0">{event.time}</span>
              <span className={`font-mono font-bold w-20 shrink-0 ${event.status === "DOWN" ? "text-destructive" : "text-success"}`}>
                {event.status === "DOWN" ? "⬇ DOWN" : "⬆ UP"}
              </span>
              <span className="font-mono text-primary font-semibold w-16 shrink-0">{event.wan}</span>
              <span className="text-muted-foreground truncate">{event.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <ShieldCheck className="h-8 w-8 mx-auto text-success mb-2" />
          <p className="text-xs text-muted-foreground">Sin eventos de failover registrados.</p>
        </div>
      )}
    </div>
  );
}

// ─── Traffic Monitor Component (unchanged) ──────────────

function TrafficMonitor({ monitorInterfaces }: { monitorInterfaces: string[] }) {
  const [trafficHistory, setTrafficHistory] = useState<TrafficPoint[]>([]);
  const [currentTraffic, setCurrentTraffic] = useState<Record<string, { rx: number; tx: number }>>({});
  const [monitoring, setMonitoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTraffic = useCallback(async () => {
    try {
      const result = await mikrotikDeviceApi.execute([`/interface/monitor-traffic ${monitorInterfaces.join(",")} once`]);
      if (result.results && Array.isArray(result.results)) {
        const now = new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const point: TrafficPoint = { time: now };
        const current: Record<string, { rx: number; tx: number }> = {};
        result.results.forEach((r: any, idx: number) => {
          const name = monitorInterfaces[idx] || r.name || `iface-${idx}`;
          const rxBps = parseInt(r["rx-bits-per-second"] || r["rx-byte"] || "0");
          const txBps = parseInt(r["tx-bits-per-second"] || r["tx-byte"] || "0");
          const rxMbps = Math.round((rxBps / 1_000_000) * 100) / 100;
          const txMbps = Math.round((txBps / 1_000_000) * 100) / 100;
          point[`${name}_rx`] = rxMbps;
          point[`${name}_tx`] = txMbps;
          current[name] = { rx: rxMbps, tx: txMbps };
        });
        setCurrentTraffic(current);
        setTrafficHistory(prev => [...prev, point].slice(-60));
        setError(null);
      }
    } catch (e: any) {
      setError(e.message || "Error al leer tráfico");
    }
  }, [monitorInterfaces]);

  useEffect(() => {
    if (!monitoring || monitorInterfaces.length === 0) return;
    fetchTraffic();
    const id = setInterval(fetchTraffic, 5000);
    return () => clearInterval(id);
  }, [monitoring, fetchTraffic, monitorInterfaces]);

  if (monitorInterfaces.length === 0) return null;

  return (
    <div className="card-glow rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Monitor de Tráfico en Tiempo Real
        </h3>
        <Button variant={monitoring ? "destructive" : "default"} size="sm" onClick={() => setMonitoring(!monitoring)} className="gap-1.5">
          {monitoring ? (<><XCircle className="h-3.5 w-3.5" />Detener</>) : (<><Activity className="h-3.5 w-3.5" />Iniciar Monitor</>)}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {Object.keys(currentTraffic).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(currentTraffic).map(([name, data]) => (
            <div key={name} className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs font-semibold text-foreground font-mono mb-2">{name}</p>
              <div className="flex items-center gap-2 mb-1">
                <ArrowDown className="h-3 w-3 text-success" />
                <span className="text-sm font-mono text-success font-bold">{data.rx} Mbps</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowUp className="h-3 w-3 text-primary" />
                <span className="text-sm font-mono text-primary font-bold">{data.tx} Mbps</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {trafficHistory.length > 1 && (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trafficHistory}>
              <defs>
                {monitorInterfaces.map((name, i) => (
                  <linearGradient key={`grad-${name}`} id={`grad-${name}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit=" Mbps" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {monitorInterfaces.map((name, i) => (
                <Area key={`${name}_rx`} type="monotone" dataKey={`${name}_rx`} name={`${name} ↓`} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={`url(#grad-${name})`} strokeWidth={2} />
              ))}
              {monitorInterfaces.map((name, i) => (
                <Area key={`${name}_tx`} type="monotone" dataKey={`${name}_tx`} name={`${name} ↑`} stroke={CHART_COLORS[(i + 4) % CHART_COLORS.length]} fill="none" strokeWidth={1.5} strokeDasharray="5 3" />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {!monitoring && trafficHistory.length === 0 && (
        <div className="text-center py-8">
          <Activity className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground">Haz clic en "Iniciar Monitor" para ver tráfico en tiempo real</p>
        </div>
      )}
    </div>
  );
}

// ─── Script Output Card (with robust copy) ──────────────

function ScriptOutput({ title, script, badge }: { title: string; script: string | null; badge?: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const handleCopy = async () => {
    if (!script) return;
    const ok = await copyToClipboard(script);
    if (ok) {
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2500);
    } else {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };

  if (!script) {
    return (
      <div className="card-glow rounded-lg p-6 text-center">
        <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Configura los parámetros y pulsa <strong>Generar Script</strong>.</p>
      </div>
    );
  }

  return (
    <div className="card-glow rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          {title}
          {badge && <span className="text-xs font-normal text-muted-foreground">— {badge}</span>}
        </h3>
        <Button
          size="sm"
          onClick={handleCopy}
          variant={copied ? "default" : "outline"}
          className="gap-1.5"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "¡Copiado!" : copyError ? "Error al copiar" : "Copiar script"}
        </Button>
      </div>
      <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
        <p className="text-xs text-foreground leading-relaxed">
          <strong>📋 Cómo usar:</strong> Copia el script y pégalo en el terminal de tu MikroTik (Winbox &gt; New Terminal, o SSH). Revisa cada bloque antes de aplicar — algunos comandos asumen una configuración limpia.
        </p>
      </div>
      <pre className="bg-background/80 border border-border rounded-md p-4 text-xs font-mono text-foreground overflow-x-auto max-h-[500px] leading-relaxed whitespace-pre-wrap">
        {script}
      </pre>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────

export function LoadBalancingPanel() {
  const [device, setDevice] = useState<MikroTikDevice | null>(null);
  const [interfaces, setInterfaces] = useState<MkInterface[]>([]);
  const [loadingIfaces, setLoadingIfaces] = useState(false);
  const [ifaceError, setIfaceError] = useState<string | null>(null);

  // Balance config
  const [method, setMethod] = useState<BalanceMethod>("pcc");
  const [selectedWans, setSelectedWans] = useState<string[]>([]);
  const [selectedLans, setSelectedLans] = useState<string[]>([]);
  const [bridgeName, setBridgeName] = useState("bridge-lan");
  const [clientType, setClientType] = useState<ClientType>("pppoe");
  const [totalClients, setTotalClients] = useState(300);
  const [failoverEnabled, setFailoverEnabled] = useState(true);
  const [wanConfigs, setWanConfigs] = useState<Record<string, WanConfig>>({});

  const [balanceScript, setBalanceScript] = useState<string | null>(null);

  // Hotspot config
  const [hsName, setHsName] = useState("hotspot-wifi");
  const [hsNetwork, setHsNetwork] = useState("10.5.50.0");
  const [hsGateway, setHsGateway] = useState("10.5.50.1");
  const [hsCidr, setHsCidr] = useState(24);
  const [hsPoolStart, setHsPoolStart] = useState("10.5.50.10");
  const [hsPoolEnd, setHsPoolEnd] = useState("10.5.50.250");
  const [hsDns, setHsDns] = useState("8.8.8.8");
  const [hsHtmlDir, setHsHtmlDir] = useState("hotspot");
  const [hotspotScript, setHotspotScript] = useState<string | null>(null);

  // Firewall config
  const [fwLanSubnet, setFwLanSubnet] = useState("192.168.88.0/24");
  const [firewallScript, setFirewallScript] = useState<string | null>(null);

  useEffect(() => {
    const saved = getDevice();
    if (saved) {
      setDevice(saved);
      fetchInterfaces();
    }
  }, []);

  const fetchInterfaces = useCallback(async () => {
    setLoadingIfaces(true);
    setIfaceError(null);
    try {
      const result = await mikrotikDeviceApi.execute(["interfaces:list"]);
      const payload = Array.isArray(result.results)
        ? result.results.find((entry: any) => entry.cmd === "interfaces:list")
        : null;
      if (!payload?.success) throw new Error(payload?.error || result.error || "No se pudieron obtener las interfaces");
      const rawInterfaces = Array.isArray(payload.result) ? payload.result : [];
      const ifaces: MkInterface[] = rawInterfaces.map((r: any) => ({
        name: r.name || r["default-name"] || r[".id"] || "unknown",
        type: r.type || (typeof r.name === "string" && r.name.startsWith("ether") ? "ethernet" : "unknown"),
        running: r.running === "true" || r.running === true || r.running === "yes",
        disabled: r.disabled === "true" || r.disabled === true || r.disabled === "yes",
        comment: r.comment,
      }));
      setInterfaces(ifaces);
    } catch (e: any) {
      setIfaceError(e.message || "No se pudieron obtener las interfaces");
    } finally {
      setLoadingIfaces(false);
    }
  }, []);

  const toggleWan = (name: string) => {
    setSelectedWans(prev => {
      const exists = prev.includes(name);
      const next = exists ? prev.filter(w => w !== name) : [...prev, name];
      // Initialize config if newly added
      if (!exists) {
        setWanConfigs(c => c[name] ? c : { ...c, [name]: { mode: "dhcp", ip: "", cidr: 24, gateway: "" } });
      }
      return next;
    });
    setBalanceScript(null);
  };

  const toggleLan = (name: string) => {
    setSelectedLans(prev => prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]);
    setBalanceScript(null);
  };

  const updateWanConfig = (wan: string, patch: Partial<WanConfig>) => {
    setWanConfigs(c => ({ ...c, [wan]: { ...(c[wan] || { mode: "dhcp", ip: "", cidr: 24, gateway: "" }), ...patch } }));
    setBalanceScript(null);
  };

  const generateBalanceScript = () => {
    if (selectedWans.length < 2 || selectedLans.length < 1) return;
    let script = "";
    switch (method) {
      case "pcc":
        script = generatePCCScript(selectedWans, bridgeName, selectedLans, failoverEnabled, wanConfigs); break;
      case "nth":
        script = generateNTHScript(selectedWans, bridgeName, selectedLans, failoverEnabled, wanConfigs); break;
      case "bonding":
        script = generateBondingScript(selectedWans, bridgeName, selectedLans, failoverEnabled, wanConfigs); break;
      case "routing":
        script = generateRoutingScript(selectedWans, bridgeName, selectedLans, clientType, totalClients, failoverEnabled, wanConfigs); break;
    }
    setBalanceScript(script);
  };

  const generateHotspot = () => {
    setHotspotScript(generateHotspotScript({
      bridge: bridgeName,
      hotspotName: hsName,
      network: hsNetwork,
      gatewayIp: hsGateway,
      cidr: hsCidr,
      poolStart: hsPoolStart,
      poolEnd: hsPoolEnd,
      dnsServer: hsDns,
      htmlDir: hsHtmlDir,
    }));
  };

  const generateFirewall = () => {
    setFirewallScript(generateFirewallScript(selectedWans, fwLanSubnet));
  };

  const ethernetIfaces = interfaces.filter(i => {
    if (i.disabled) return false;
    const t = (i.type || "").toLowerCase();
    const n = (i.name || "").toLowerCase();
    if (t === "bridge" || t === "bond" || t === "vlan" || t === "pppoe-out" || t === "pppoe-in" || t === "vpls") return false;
    if (t === "ethernet" || t === "ether" || t.startsWith("ether") || t === "sfp" || t === "wlan" || t === "wireless") return true;
    if (/^(ether|sfp|wlan|wan|combo)/i.test(n)) return true;
    return false;
  });

  const monitorInterfaces = [...selectedWans, ...(selectedLans.length > 0 ? [bridgeName] : [])];
  const notConnected = !device || !device.connected;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Network className="h-6 w-6 text-primary" />
          Balanceo + Hotspot + Firewall
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Genera scripts MikroTik (no se aplican automáticamente — copia y pega en Winbox/SSH).
        </p>
      </div>

      {notConnected ? (
        <div className="card-glow rounded-lg p-6 text-center">
          <Router className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-2">
            Primero conecta un MikroTik desde el panel <strong>MikroTik</strong>
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Device info bar */}
          <div className="card-glow rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-semibold text-foreground">{device.identity || device.host}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {device.host}:{device.port} • RouterOS {device.routeros_version || device.version}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchInterfaces} disabled={loadingIfaces} className="gap-1.5">
              {loadingIfaces ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Recargar interfaces
            </Button>
          </div>

          {ifaceError && (
            <div className="card-glow rounded-lg p-4 border-l-4 border-l-destructive">
              <p className="text-sm text-destructive">{ifaceError}</p>
            </div>
          )}

          <Tabs defaultValue="balance" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="balance" className="gap-1.5"><Network className="h-4 w-4" />Balanceo</TabsTrigger>
              <TabsTrigger value="hotspot" className="gap-1.5"><Wifi className="h-4 w-4" />Hotspot</TabsTrigger>
              <TabsTrigger value="firewall" className="gap-1.5"><Shield className="h-4 w-4" />Firewall</TabsTrigger>
            </TabsList>

            {/* ────── BALANCE TAB ────── */}
            <TabsContent value="balance" className="space-y-6 mt-6">
              {/* Step 1: Method */}
              <div className="card-glow rounded-lg p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                  Método de Balanceo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(Object.entries(methodInfo) as [BalanceMethod, typeof methodInfo.pcc][]).map(([key, info]) => {
                    const Icon = info.icon;
                    const isSelected = method === key;
                    return (
                      <button
                        key={key}
                        onClick={() => { setMethod(key); setBalanceScript(null); }}
                        className={`text-left p-4 rounded-lg border-2 transition-all ${isSelected ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:border-primary/50"}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`h-5 w-5 ${info.color}`} />
                          <span className="text-sm font-semibold text-foreground">{info.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{info.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: WANs */}
              <div className="card-glow rounded-lg p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                  Seleccionar interfaces WAN
                  <span className="text-xs text-muted-foreground ml-2">({selectedWans.length} seleccionadas)</span>
                </h3>
                {ethernetIfaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{loadingIfaces ? "Cargando..." : "No se encontraron interfaces. Recarga."}</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {ethernetIfaces.map(iface => {
                      const isWan = selectedWans.includes(iface.name);
                      const isLan = selectedLans.includes(iface.name);
                      return (
                        <button
                          key={`wan-${iface.name}`}
                          onClick={() => !isLan && toggleWan(iface.name)}
                          disabled={isLan}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${isWan ? "border-primary bg-primary/10" : isLan ? "border-border bg-secondary/20 opacity-50 cursor-not-allowed" : "border-border hover:border-primary/50"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono font-semibold text-foreground">{iface.name}</span>
                            <div className={`w-2.5 h-2.5 rounded-full ${iface.running ? "bg-success" : "bg-destructive"}`} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{iface.type}</p>
                          {iface.comment && <p className="text-xs text-muted-foreground truncate">{iface.comment}</p>}
                          {isWan && <span className="text-xs text-primary font-bold mt-1 block">WAN ✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2.5: Per-WAN config (Static / DHCP) */}
              {selectedWans.length > 0 && (
                <div className="card-glow rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2.5</span>
                    Configuración de cada WAN (IP estática o DHCP)
                  </h3>
                  <div className="space-y-4">
                    {selectedWans.map(wan => {
                      const cfg = wanConfigs[wan] || { mode: "dhcp" as WanMode, ip: "", cidr: 24, gateway: "" };
                      return (
                        <div key={`cfg-${wan}`} className="p-4 bg-secondary/30 border border-border rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-mono font-semibold text-foreground">{wan}</span>
                            <div className="flex gap-1">
                              {(["static", "dhcp"] as WanMode[]).map(m => (
                                <button
                                  key={m}
                                  onClick={() => updateWanConfig(wan, { mode: m })}
                                  className={`px-3 py-1 rounded-md text-xs font-medium border-2 transition-all ${cfg.mode === m ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}
                                >
                                  {m === "static" ? "IP Estática" : "DHCP"}
                                </button>
                              ))}
                            </div>
                          </div>
                          {cfg.mode === "static" ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">IP WAN</label>
                                <Input
                                  value={cfg.ip}
                                  onChange={e => updateWanConfig(wan, { ip: e.target.value })}
                                  placeholder="200.10.20.30"
                                  className="font-mono text-sm h-9"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Máscara (CIDR)</label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={32}
                                  value={cfg.cidr}
                                  onChange={e => updateWanConfig(wan, { cidr: Math.max(1, Math.min(32, parseInt(e.target.value) || 24)) })}
                                  className="font-mono text-sm h-9"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Gateway ISP</label>
                                <Input
                                  value={cfg.gateway}
                                  onChange={e => updateWanConfig(wan, { gateway: e.target.value })}
                                  placeholder="200.10.20.1"
                                  className="font-mono text-sm h-9"
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              ✓ DHCP automático — el router obtendrá IP, gateway y DNS de tu ISP.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 3: LANs */}
              <div className="card-glow rounded-lg p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                  Seleccionar interfaces LAN (Bridge)
                  <span className="text-xs text-muted-foreground ml-2">({selectedLans.length} seleccionadas)</span>
                </h3>
                <div className="flex items-center gap-3 mb-4">
                  <label className="text-xs text-muted-foreground">Nombre del Bridge:</label>
                  <Input value={bridgeName} onChange={e => setBridgeName(e.target.value)} className="w-48 h-8 text-sm font-mono" />
                </div>
                {ethernetIfaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay interfaces.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {ethernetIfaces.map(iface => {
                      const isLan = selectedLans.includes(iface.name);
                      const isWan = selectedWans.includes(iface.name);
                      return (
                        <button
                          key={`lan-${iface.name}`}
                          onClick={() => !isWan && toggleLan(iface.name)}
                          disabled={isWan}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${isLan ? "border-chart-2 bg-chart-2/10" : isWan ? "border-border bg-secondary/20 opacity-50 cursor-not-allowed" : "border-border hover:border-chart-2/50"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono font-semibold text-foreground">{iface.name}</span>
                            <div className={`w-2.5 h-2.5 rounded-full ${iface.running ? "bg-success" : "bg-destructive"}`} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{iface.type}</p>
                          {isLan && <span className="text-xs text-chart-2 font-bold mt-1 block">LAN ✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 4: Failover + routing */}
              <div className="card-glow rounded-lg p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</span>
                  Opciones Avanzadas
                </h3>
                <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg mb-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className={`h-5 w-5 ${failoverEnabled ? "text-success" : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Failover Automático (Netwatch)</p>
                      <p className="text-xs text-muted-foreground">
                        Monitorea cada WAN con ping. Si una cae, desactiva sus rutas/mangle automáticamente.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setFailoverEnabled(!failoverEnabled); setBalanceScript(null); }}
                    className={`relative w-12 h-6 rounded-full transition-all ${failoverEnabled ? "bg-success" : "bg-muted"}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${failoverEnabled ? "left-6" : "left-0.5"}`} />
                  </button>
                </div>

                {method === "routing" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-2">Tipo de clientes</label>
                      <div className="flex gap-2">
                        {(["pppoe", "dhcp"] as ClientType[]).map(ct => (
                          <button
                            key={ct}
                            onClick={() => setClientType(ct)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${clientType === ct ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}
                          >
                            {ct.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-2">Total de clientes</label>
                      <Input
                        type="number"
                        value={totalClients}
                        onChange={e => setTotalClients(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-32 h-9 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Generate button */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={generateBalanceScript} disabled={selectedWans.length < 2 || selectedLans.length < 1} className="gap-2">
                  <Play className="h-4 w-4" />
                  Generar Script Balanceo {failoverEnabled && "+ Failover"}
                </Button>
                {selectedWans.length < 2 && (
                  <p className="text-xs text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Selecciona al menos 2 WANs
                  </p>
                )}
                {selectedWans.length >= 2 && selectedLans.length < 1 && (
                  <p className="text-xs text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Selecciona al menos 1 LAN
                  </p>
                )}
              </div>

              <ScriptOutput
                title={`Script Balanceo — ${methodInfo[method].label}`}
                badge={failoverEnabled ? "Con Failover" : undefined}
                script={balanceScript}
              />

              <TrafficMonitor monitorInterfaces={monitorInterfaces} />
              {failoverEnabled && <FailoverLog wans={selectedWans} />}
            </TabsContent>

            {/* ────── HOTSPOT TAB ────── */}
            <TabsContent value="hotspot" className="space-y-6 mt-6">
              <div className="card-glow rounded-lg p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-primary" />
                  Configuración de Hotspot (compatible con balanceo)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Crea un Hotspot sobre el bridge LAN. Los clientes obtendrán IP por DHCP y verán un captive portal.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Nombre Hotspot</label>
                    <Input value={hsName} onChange={e => setHsName(e.target.value)} className="font-mono text-sm h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Bridge LAN (de balanceo)</label>
                    <Input value={bridgeName} onChange={e => setBridgeName(e.target.value)} className="font-mono text-sm h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Red (network)</label>
                    <Input value={hsNetwork} onChange={e => setHsNetwork(e.target.value)} placeholder="10.5.50.0" className="font-mono text-sm h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">CIDR</label>
                    <Input type="number" min={8} max={30} value={hsCidr} onChange={e => setHsCidr(parseInt(e.target.value) || 24)} className="font-mono text-sm h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Gateway hotspot</label>
                    <Input value={hsGateway} onChange={e => setHsGateway(e.target.value)} placeholder="10.5.50.1" className="font-mono text-sm h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">DNS</label>
                    <Input value={hsDns} onChange={e => setHsDns(e.target.value)} placeholder="8.8.8.8" className="font-mono text-sm h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Pool inicio</label>
                    <Input value={hsPoolStart} onChange={e => setHsPoolStart(e.target.value)} className="font-mono text-sm h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Pool fin</label>
                    <Input value={hsPoolEnd} onChange={e => setHsPoolEnd(e.target.value)} className="font-mono text-sm h-9" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground block mb-1">Carpeta HTML del portal</label>
                    <Input value={hsHtmlDir} onChange={e => setHsHtmlDir(e.target.value)} placeholder="hotspot" className="font-mono text-sm h-9" />
                  </div>
                </div>
                <Button onClick={generateHotspot} className="gap-2">
                  <Play className="h-4 w-4" />
                  Generar Script Hotspot
                </Button>
              </div>
              <ScriptOutput title="Script Hotspot" script={hotspotScript} />
            </TabsContent>

            {/* ────── FIREWALL TAB ────── */}
            <TabsContent value="firewall" className="space-y-6 mt-6">
              <div className="card-glow rounded-lg p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Firewall de Protección MikroTik
                </h3>
                <p className="text-xs text-muted-foreground">
                  Reglas recomendadas: anti-bruteforce SSH/Winbox, anti-flood, drop bogons en WAN, deshabilitar servicios inseguros, neighbor discovery solo LAN.
                </p>
                <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
                  <p className="text-xs text-foreground leading-relaxed">
                    <strong>⚠️ Antes de aplicar:</strong> si administras el router por IP pública, ajusta los servicios SSH/Winbox para no perder acceso. Lee cada regla.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Subred LAN confiada</label>
                    <Input value={fwLanSubnet} onChange={e => setFwLanSubnet(e.target.value)} placeholder="192.168.88.0/24" className="font-mono text-sm h-9" />
                    <p className="text-xs text-muted-foreground mt-1">Solo desde aquí podrá administrarse el router (Winbox/SSH).</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">WANs a proteger</label>
                    <p className="text-xs text-foreground font-mono p-2 bg-background/60 rounded border border-border">
                      {selectedWans.length > 0 ? selectedWans.join(", ") : "Selecciona WANs en la pestaña Balanceo"}
                    </p>
                  </div>
                </div>
                <Button onClick={generateFirewall} className="gap-2">
                  <Play className="h-4 w-4" />
                  Generar Script Firewall
                </Button>
              </div>
              <ScriptOutput title="Script Firewall MikroTik" script={firewallScript} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
