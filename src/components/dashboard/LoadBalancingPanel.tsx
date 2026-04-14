import { useState, useEffect, useCallback, useRef } from "react";
import {
  Router, Loader2, CheckCircle, XCircle, ArrowRight, Play,
  Network, Shuffle, Link2, GitBranch, AlertTriangle, Info,
  Activity, ArrowDown, ArrowUp, RefreshCw, ShieldCheck,
  Clock, History, Send, Bell, BellOff, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { mikrotikDeviceApi, getDevice, type MikroTikDevice } from "@/lib/mikrotik-api";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

type BalanceMethod = "pcc" | "nth" | "bonding" | "routing";
type ClientType = "pppoe" | "dhcp";

interface MkInterface {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  comment?: string;
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

// ─── Failover script block (shared) ──────────────────────

function generateFailoverBlock(wans: string[]): string {
  const lines: string[] = [
    "",
    "# ═══════════════════════════════════════════",
    "# FAILOVER AUTOMÁTICO — Netwatch",
    "# ═══════════════════════════════════════════",
    "# Monitorea cada WAN con ping a DNS público.",
    "# Si una WAN cae, desactiva sus rutas/mangle.",
    "# Al recuperarse, las reactiva automáticamente.",
    "",
  ];

  const pingTargets = ["8.8.8.8", "1.1.1.1", "8.8.4.4", "9.9.9.9", "208.67.222.222"];

  wans.forEach((wan, i) => {
    const pingIp = pingTargets[i % pingTargets.length];
    // Add a static route for the ping target via this WAN so it always goes out the right interface
    lines.push(
      `# --- Failover: ${wan} (ping ${pingIp}) ---`,
      `/ip route add dst-address=${pingIp}/32 gateway=${wan} scope=10 comment="NetAdmin Failover: Ping target ${wan}"`,
      "",
      `/tool netwatch add host=${pingIp} interval=10s timeout=3s \\`,
      `  up-script="\\`,
      `/log warning \\"NetAdmin: ${wan} UP - restaurando rutas\\";\\`,
      `/ip route set [find comment~\\"NetAdmin.*${wan}\\"] disabled=no;\\`,
      `/ip firewall mangle set [find comment~\\"NetAdmin.*${wan}\\"] disabled=no;\\`,
      `" \\`,
      `  down-script="\\`,
      `/log error \\"NetAdmin: ${wan} DOWN - activando failover\\";\\`,
      `/ip route set [find comment~\\"NetAdmin.*${wan}\\"] disabled=yes;\\`,
      `/ip firewall mangle set [find comment~\\"NetAdmin.*${wan}\\"] disabled=yes;\\`,
      `" \\`,
      `  comment="NetAdmin Failover: Monitor ${wan}"`,
      "",
    );
  });

  lines.push(
    "# Ruta de respaldo global (último recurso)",
    ...wans.map((wan, i) =>
      `/ip route add dst-address=0.0.0.0/0 gateway=${wan} distance=${i + 10} check-gateway=ping \\`,
    ),
    `  comment="NetAdmin Failover: Ruta backup"`,
  );

  return lines.join("\n");
}

// ─── Script generators ──────────────────────────────────

function generatePCCScript(wans: string[], bridge: string, lans: string[], failover: boolean): string {
  const lines: string[] = [
    `# === NetAdmin: Balanceo PCC con ${wans.length} WANs + ${failover ? "Failover" : "Sin Failover"} ===`,
    `# Bridge LAN: ${bridge} (${lans.join(", ")})`,
    "",
    "# 1. Crear bridge LAN",
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN balanceo"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l} comment="NetAdmin: LAN port"`),
    "",
    "# 2. Mangle: Marcar conexiones por PCC",
  ];

  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting in-interface=${bridge} dst-address-type=!local \\`,
      `  per-connection-classifier=both-addresses-and-ports:${wans.length}/${i} \\`,
      `  action=mark-connection new-connection-mark=WAN${i + 1}_conn passthrough=yes \\`,
      `  comment="NetAdmin PCC: Conexiones → ${wan}"`
    );
  });

  lines.push("");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting connection-mark=WAN${i + 1}_conn \\`,
      `  action=mark-routing new-routing-mark=to_WAN${i + 1} passthrough=yes \\`,
      `  comment="NetAdmin PCC: Ruteo → ${wan}"`
    );
  });

  lines.push("", "# 3. NAT por cada WAN");
  wans.forEach((wan) => {
    lines.push(
      `/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade \\`,
      `  comment="NetAdmin PCC: NAT ${wan}"`
    );
  });

  lines.push("", "# 4. Rutas por marca de ruteo");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip route add dst-address=0.0.0.0/0 gateway=${wan} routing-mark=to_WAN${i + 1} \\`,
      `  check-gateway=ping comment="NetAdmin PCC: Ruta ${wan}"`
    );
  });

  if (failover) lines.push(generateFailoverBlock(wans));

  return lines.join("\n");
}

function generateNTHScript(wans: string[], bridge: string, lans: string[], failover: boolean): string {
  const lines: string[] = [
    `# === NetAdmin: Balanceo NTH con ${wans.length} WANs + ${failover ? "Failover" : "Sin Failover"} ===`,
    "",
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN balanceo"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l}`),
    "",
    "# Mangle NTH",
  ];

  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting in-interface=${bridge} dst-address-type=!local \\`,
      `  connection-state=new nth=${wans.length},${i + 1} \\`,
      `  action=mark-connection new-connection-mark=WAN${i + 1}_conn passthrough=yes \\`,
      `  comment="NetAdmin NTH: ${wan}"`
    );
  });

  lines.push("");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting connection-mark=WAN${i + 1}_conn \\`,
      `  action=mark-routing new-routing-mark=to_WAN${i + 1} passthrough=yes`
    );
  });

  lines.push("", "# NAT y Rutas");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade`,
      `/ip route add dst-address=0.0.0.0/0 gateway=${wan} routing-mark=to_WAN${i + 1} check-gateway=ping`
    );
  });

  if (failover) lines.push(generateFailoverBlock(wans));

  return lines.join("\n");
}

function generateBondingScript(wans: string[], bridge: string, lans: string[], failover: boolean): string {
  const lines: string[] = [
    `# === NetAdmin: Bonding con ${wans.length} interfaces + ${failover ? "Failover" : "Sin Failover"} ===`,
    "",
    `# Modo active-backup: si una interfaz cae, el bonding conmuta automáticamente`,
    `/interface bonding add name=bond-wan mode=${failover ? "active-backup" : "balance-rr"} \\`,
    `  slaves=${wans.join(",")} primary=${wans[0]} \\`,
    `  comment="NetAdmin: Bonding WAN ${failover ? "(active-backup failover)" : "(round-robin)"}"`,
    "",
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l}`),
    "",
    `/ip firewall nat add chain=srcnat out-interface=bond-wan action=masquerade \\`,
    `  comment="NetAdmin: NAT Bonding"`,
    `/ip route add dst-address=0.0.0.0/0 gateway=bond-wan check-gateway=ping \\`,
    `  comment="NetAdmin: Ruta Bonding"`,
  ];

  if (failover) {
    lines.push(
      "",
      "# ═══ Failover Bonding ═══",
      "# El modo active-backup ya incluye failover nativo.",
      "# Adicionalmente, Netwatch monitorea conectividad externa:",
      "",
      `/tool netwatch add host=8.8.8.8 interval=10s timeout=3s \\`,
      `  down-script="\\`,
      `/log error \\"NetAdmin: Bonding sin conectividad externa\\";\\`,
      `" \\`,
      `  up-script="\\`,
      `/log warning \\"NetAdmin: Bonding conectividad restaurada\\";\\`,
      `" \\`,
      `  comment="NetAdmin Failover: Monitor Bonding"`,
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
  failover: boolean
): string {
  const perWan = Math.floor(totalClients / wans.length);
  const remainder = totalClients % wans.length;

  const lines: string[] = [
    `# === NetAdmin: Balanceo por Ruteo — ${totalClients} clientes ${clientType.toUpperCase()} ÷ ${wans.length} WANs ===`,
    `# ${failover ? "CON" : "SIN"} Failover automático`,
    `# Distribución: ${wans.map((w, i) => `${w} → ${perWan + (i < remainder ? 1 : 0)} clientes`).join(", ")}`,
    "",
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l}`),
    "",
  ];

  if (clientType === "pppoe") {
    lines.push("# Crear perfiles PPPoE por WAN");
    wans.forEach((wan, i) => {
      const count = perWan + (i < remainder ? 1 : 0);
      lines.push(
        `/ppp profile add name=plan-${wan} local-address=10.${i + 1}.0.1 \\`,
        `  remote-address=pool-${wan} dns-server=8.8.8.8 \\`,
        `  comment="NetAdmin Routing: ${count} clientes → ${wan}"`,
        `/ip pool add name=pool-${wan} ranges=10.${i + 1}.0.2-10.${i + 1}.${Math.min(255, Math.ceil(count / 254))}.${Math.min(254, count)} \\`,
        `  comment="NetAdmin: Pool ${wan}"`,
      );
    });

    lines.push("", "# Marcar tráfico de cada pool y rutear por WAN");
    wans.forEach((wan, i) => {
      lines.push(
        `/ip firewall mangle add chain=prerouting src-address=10.${i + 1}.0.0/16 \\`,
        `  action=mark-routing new-routing-mark=to_${wan} passthrough=yes \\`,
        `  comment="NetAdmin Routing: Pool ${wan}"`,
      );
    });
  } else {
    lines.push("# Crear pools DHCP por WAN");
    wans.forEach((wan, i) => {
      const count = perWan + (i < remainder ? 1 : 0);
      lines.push(
        `/ip pool add name=pool-${wan} ranges=192.168.${10 + i}.2-192.168.${10 + i}.${Math.min(254, count + 1)} \\`,
        `  comment="NetAdmin: Pool DHCP ${wan} (${count} clientes)"`,
        `/ip address add address=192.168.${10 + i}.1/24 interface=${bridge} \\`,
        `  comment="NetAdmin: Gateway pool ${wan}"`,
      );
    });

    lines.push("", "# Mangle por subred → WAN");
    wans.forEach((wan, i) => {
      lines.push(
        `/ip firewall mangle add chain=prerouting src-address=192.168.${10 + i}.0/24 \\`,
        `  action=mark-routing new-routing-mark=to_${wan} passthrough=yes \\`,
        `  comment="NetAdmin Routing: Subnet → ${wan}"`,
      );
    });
  }

  lines.push("", "# NAT y Rutas por WAN");
  wans.forEach((wan) => {
    lines.push(
      `/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade`,
      `/ip route add dst-address=0.0.0.0/0 gateway=${wan} routing-mark=to_${wan} check-gateway=ping`,
    );
  });

  if (failover) {
    lines.push(
      "",
      "# ═══ Failover por Ruteo ═══",
      "# Si una WAN cae, redistribuir clientes a las WANs activas",
    );

    const pingTargets = ["8.8.8.8", "1.1.1.1", "8.8.4.4", "9.9.9.9", "208.67.222.222"];

    wans.forEach((wan, i) => {
      const pingIp = pingTargets[i % pingTargets.length];
      const otherWans = wans.filter((_, j) => j !== i);
      const fallbackWan = otherWans[0];

      lines.push(
        "",
        `# Failover: ${wan}`,
        `/ip route add dst-address=${pingIp}/32 gateway=${wan} scope=10 comment="NetAdmin Failover: Ping ${wan}"`,
        `/tool netwatch add host=${pingIp} interval=10s timeout=3s \\`,
        `  up-script="\\`,
        `/log warning \\"NetAdmin: ${wan} UP\\";\\`,
        `/ip route set [find comment~\\"NetAdmin.*${wan}\\"] disabled=no;\\`,
        `/ip firewall mangle set [find comment~\\"NetAdmin Routing.*${wan}\\"] disabled=no;\\`,
        `" \\`,
        `  down-script="\\`,
        `/log error \\"NetAdmin: ${wan} DOWN - failover a ${fallbackWan}\\";\\`,
        `/ip route set [find comment~\\"NetAdmin.*Ruta.*${wan}\\"] disabled=yes;\\`,
        `# Redirigir tráfico de ${wan} a ${fallbackWan}\\`,
        `/ip firewall mangle set [find comment~\\"NetAdmin Routing.*${wan}\\"] disabled=yes;\\`,
        `" \\`,
        `  comment="NetAdmin Failover: Monitor ${wan}"`,
      );
    });
  }

  return lines.join("\n");
}

// ─── Failover Event Log Component ───────────────────────

interface FailoverEvent {
  time: string;
  wan: string;
  status: "UP" | "DOWN";
  message: string;
}

function FailoverLog({ wans }: { wans: string[] }) {
  const [events, setEvents] = useState<FailoverEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await mikrotikDeviceApi.execute([
        `/log/print where message~"NetAdmin"`
      ]);

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
      }
    } catch (e: any) {
      setError(e.message || "Error al leer logs");
    } finally {
      setLoading(false);
    }
  }, [wans]);

  useEffect(() => {
    if (wans.length > 0) fetchLogs();
  }, [wans, fetchLogs]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (wans.length === 0) return;
    const id = setInterval(fetchLogs, 30000);
    return () => clearInterval(id);
  }, [wans, fetchLogs]);

  if (wans.length === 0) return null;

  // Calculate uptime stats
  const downEvents = events.filter(e => e.status === "DOWN");
  const upEvents = events.filter(e => e.status === "UP");

  return (
    <div className="card-glow rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Historial de Eventos Failover
        </h3>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Actualizar
        </Button>
      </div>

      {/* Summary cards */}
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

      {/* Per-WAN status */}
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
              <p className={`text-xs font-bold ${isUp ? "text-success" : "text-destructive"}`}>
                {isUp ? "ACTIVO" : "CAÍDO"}
              </p>
              {lastEvent && (
                <p className="text-xs text-muted-foreground font-mono mt-1">{lastEvent.time}</p>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Event timeline */}
      {events.length > 0 ? (
        <div className="max-h-72 overflow-y-auto space-y-1">
          {events.map((event, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs ${
                event.status === "DOWN"
                  ? "bg-destructive/10 border-l-2 border-l-destructive"
                  : "bg-success/10 border-l-2 border-l-success"
              }`}
            >
              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-mono text-muted-foreground w-28 shrink-0">{event.time}</span>
              <span className={`font-mono font-bold w-20 shrink-0 ${
                event.status === "DOWN" ? "text-destructive" : "text-success"
              }`}>
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
          <p className="text-xs text-muted-foreground">
            Sin eventos de failover registrados. Todas las WANs operando normalmente.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        💡 Los eventos se leen del log del MikroTik (entradas con "NetAdmin"). Se actualiza cada 30 segundos.
      </p>
    </div>
  );
}

// ─── Traffic Monitor Component ──────────────────────────

function TrafficMonitor({ monitorInterfaces }: { monitorInterfaces: string[] }) {
  const [trafficHistory, setTrafficHistory] = useState<TrafficPoint[]>([]);
  const [currentTraffic, setCurrentTraffic] = useState<Record<string, { rx: number; tx: number }>>({});
  const [monitoring, setMonitoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTraffic = useCallback(async () => {
    try {
      const result = await mikrotikDeviceApi.execute([
        `/interface/monitor-traffic ${monitorInterfaces.join(",")} once`
      ]);

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
        setTrafficHistory(prev => {
          const updated = [...prev, point];
          return updated.slice(-60); // Keep 60 points (5 min at 5s interval)
        });
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
        <Button
          variant={monitoring ? "destructive" : "default"}
          size="sm"
          onClick={() => setMonitoring(!monitoring)}
          className="gap-1.5"
        >
          {monitoring ? (
            <>
              <XCircle className="h-3.5 w-3.5" />
              Detener
            </>
          ) : (
            <>
              <Activity className="h-3.5 w-3.5" />
              Iniciar Monitor
            </>
          )}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Current traffic cards */}
      {Object.keys(currentTraffic).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(currentTraffic).map(([name, data], i) => (
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

      {/* Traffic chart */}
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
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {monitorInterfaces.map((name, i) => (
                <Area
                  key={`${name}_rx`}
                  type="monotone"
                  dataKey={`${name}_rx`}
                  name={`${name} ↓`}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={`url(#grad-${name})`}
                  strokeWidth={2}
                />
              ))}
              {monitorInterfaces.map((name, i) => (
                <Area
                  key={`${name}_tx`}
                  type="monotone"
                  dataKey={`${name}_tx`}
                  name={`${name} ↑`}
                  stroke={CHART_COLORS[(i + 4) % CHART_COLORS.length]}
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {!monitoring && trafficHistory.length === 0 && (
        <div className="text-center py-8">
          <Activity className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground">
            Haz clic en "Iniciar Monitor" para ver tráfico en tiempo real de cada WAN y Bridge
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────

export function LoadBalancingPanel() {
  const [device, setDevice] = useState<MikroTikDevice | null>(null);
  const [interfaces, setInterfaces] = useState<MkInterface[]>([]);
  const [loadingIfaces, setLoadingIfaces] = useState(false);
  const [ifaceError, setIfaceError] = useState<string | null>(null);

  // Config
  const [method, setMethod] = useState<BalanceMethod>("pcc");
  const [selectedWans, setSelectedWans] = useState<string[]>([]);
  const [selectedLans, setSelectedLans] = useState<string[]>([]);
  const [bridgeName, setBridgeName] = useState("bridge-lan");
  const [clientType, setClientType] = useState<ClientType>("pppoe");
  const [totalClients, setTotalClients] = useState(300);
  const [failoverEnabled, setFailoverEnabled] = useState(true);

  // Script & execution
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
      const result = await mikrotikDeviceApi.execute(["/interface/print"]);
      if (result.results && Array.isArray(result.results)) {
        const ifaces: MkInterface[] = result.results.map((r: any) => ({
          name: r.name || r[".id"] || "unknown",
          type: r.type || "ethernet",
          running: r.running === "true" || r.running === true,
          disabled: r.disabled === "true" || r.disabled === true,
          comment: r.comment,
        }));
        setInterfaces(ifaces);
      }
    } catch (e: any) {
      setIfaceError(e.message || "No se pudieron obtener las interfaces");
    } finally {
      setLoadingIfaces(false);
    }
  }, []);

  const toggleWan = (name: string) => {
    setSelectedWans(prev =>
      prev.includes(name) ? prev.filter(w => w !== name) : [...prev, name]
    );
    setGeneratedScript(null);
    setExecResult(null);
  };

  const toggleLan = (name: string) => {
    setSelectedLans(prev =>
      prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]
    );
    setGeneratedScript(null);
    setExecResult(null);
  };

  const generateScript = () => {
    if (selectedWans.length < 2 || selectedLans.length < 1) return;
    let script = "";
    switch (method) {
      case "pcc":
        script = generatePCCScript(selectedWans, bridgeName, selectedLans, failoverEnabled);
        break;
      case "nth":
        script = generateNTHScript(selectedWans, bridgeName, selectedLans, failoverEnabled);
        break;
      case "bonding":
        script = generateBondingScript(selectedWans, bridgeName, selectedLans, failoverEnabled);
        break;
      case "routing":
        script = generateRoutingScript(selectedWans, bridgeName, selectedLans, clientType, totalClients, failoverEnabled);
        break;
    }
    setGeneratedScript(script);
    setExecResult(null);
  };

  const executeScript = async () => {
    if (!generatedScript) return;
    setExecuting(true);
    setExecResult(null);
    try {
      const commands = generatedScript
        .split("\n")
        .filter(l => l.trim() && !l.startsWith("#"))
        .map(l => l.replace(/\\\s*$/, "").trim())
        .reduce<string[]>((acc, line) => {
          if (acc.length > 0 && !line.startsWith("/")) {
            acc[acc.length - 1] += " " + line;
          } else {
            acc.push(line);
          }
          return acc;
        }, []);

      const result = await mikrotikDeviceApi.execute(commands);
      setExecResult({ success: result.success, message: result.message || "Script aplicado correctamente" });
    } catch (e: any) {
      setExecResult({ success: false, message: e.message || "Error al ejecutar" });
    } finally {
      setExecuting(false);
    }
  };

  const handleCopy = () => {
    if (generatedScript) {
      navigator.clipboard.writeText(generatedScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const ethernetIfaces = interfaces.filter(i =>
    (i.type === "ethernet" || i.type === "ether") && !i.disabled
  );

  const monitorInterfaces = [...selectedWans, ...(selectedLans.length > 0 ? [bridgeName] : [])];
  const notConnected = !device || !device.connected;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Network className="h-6 w-6 text-primary" />
          Balanceo de Carga
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          PCC, NTH, Bonding o Ruteo con Failover automático y monitor de tráfico
        </p>
      </div>

      {notConnected ? (
        <div className="card-glow rounded-lg p-6 text-center">
          <Router className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-2">
            Primero conecta un MikroTik desde el panel <strong>MikroTik</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            El balanceo necesita leer las interfaces del equipo para configurarse automáticamente.
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
              Recargar
            </Button>
          </div>

          {ifaceError && (
            <div className="card-glow rounded-lg p-4 border-l-4 border-l-destructive">
              <p className="text-sm text-destructive">{ifaceError}</p>
            </div>
          )}

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
                    onClick={() => { setMethod(key); setGeneratedScript(null); setExecResult(null); }}
                    className={`text-left p-4 rounded-lg border-2 transition-all ${
                      isSelected ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:border-primary/50"
                    }`}
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
              <p className="text-xs text-muted-foreground">
                {loadingIfaces ? "Cargando..." : "No se encontraron interfaces ethernet. Recarga las interfaces."}
              </p>
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
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        isWan ? "border-primary bg-primary/10"
                          : isLan ? "border-border bg-secondary/20 opacity-50 cursor-not-allowed"
                          : "border-border hover:border-primary/50"
                      }`}
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
              <p className="text-xs text-muted-foreground">No hay interfaces disponibles.</p>
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
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        isLan ? "border-chart-2 bg-chart-2/10"
                          : isWan ? "border-border bg-secondary/20 opacity-50 cursor-not-allowed"
                          : "border-border hover:border-chart-2/50"
                      }`}
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

          {/* Step 4: Failover toggle + routing options */}
          <div className="card-glow rounded-lg p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</span>
              Opciones Avanzadas
            </h3>

            {/* Failover toggle */}
            <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg mb-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className={`h-5 w-5 ${failoverEnabled ? "text-success" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-sm font-semibold text-foreground">Failover Automático</p>
                  <p className="text-xs text-muted-foreground">
                    {method === "bonding"
                      ? "Usa modo active-backup + Netwatch para detección de caída"
                      : "Netwatch monitorea cada WAN con ping. Si una cae, desactiva sus rutas y mangle automáticamente"
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setFailoverEnabled(!failoverEnabled); setGeneratedScript(null); }}
                className={`relative w-12 h-6 rounded-full transition-all ${
                  failoverEnabled ? "bg-success" : "bg-muted"
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  failoverEnabled ? "left-6" : "left-0.5"
                }`} />
              </button>
            </div>

            {failoverEnabled && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 mb-4">
                <p className="text-xs text-foreground leading-relaxed">
                  <strong>🛡️ Failover activo:</strong>{" "}
                  {method === "pcc" && "Cada WAN será monitoreada con Netwatch (ping cada 10s). Si una WAN deja de responder, sus rutas y reglas mangle se desactivarán y el tráfico se redistribuirá entre las WANs activas."}
                  {method === "nth" && "Netwatch verificará cada WAN. Al detectar caída, desactivará las reglas NTH correspondientes. Al recuperarse, las reactivará automáticamente."}
                  {method === "bonding" && "El bonding se creará en modo active-backup (en vez de round-robin). Si la interfaz primaria falla, el bonding conmutará automáticamente al slave activo."}
                  {method === "routing" && `Si una WAN cae, sus reglas de mangle se desactivarán y el tráfico de sus clientes será redirigido a la siguiente WAN disponible.`}
                </p>
              </div>
            )}

            {/* Routing-specific options */}
            {method === "routing" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-2">Tipo de clientes</label>
                  <div className="flex gap-2">
                    {(["pppoe", "dhcp"] as ClientType[]).map(ct => (
                      <button
                        key={ct}
                        onClick={() => setClientType(ct)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                          clientType === ct ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
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
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ {Math.floor(totalClients / Math.max(1, selectedWans.length))} clientes por WAN
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Generate */}
          <div className="flex items-center gap-3">
            <Button onClick={generateScript} disabled={selectedWans.length < 2 || selectedLans.length < 1} className="gap-2">
              <Play className="h-4 w-4" />
              Generar Script {failoverEnabled && "+ Failover"}
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

          {/* Generated script */}
          {generatedScript && (
            <div className="card-glow rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  Script — {methodInfo[method].label} {failoverEnabled && "+ Failover"}
                </h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                    {copied ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                  <Button size="sm" onClick={executeScript} disabled={executing} className="gap-1.5 bg-success hover:bg-success/80 text-success-foreground">
                    {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Aplicar en MikroTik
                  </Button>
                </div>
              </div>

              <pre className="bg-background/80 border border-border rounded-md p-4 text-xs font-mono text-foreground overflow-x-auto max-h-96 leading-relaxed whitespace-pre-wrap">
                {generatedScript}
              </pre>

              {method === "routing" && (
                <div className="bg-secondary/50 rounded-md p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">📊 Distribución de clientes:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {selectedWans.map((wan, i) => {
                      const perWan = Math.floor(totalClients / selectedWans.length);
                      const extra = i < (totalClients % selectedWans.length) ? 1 : 0;
                      return (
                        <div key={wan} className="flex items-center gap-2 text-xs">
                          <div className="w-3 h-3 rounded-full bg-primary" />
                          <span className="font-mono text-foreground">{wan}</span>
                          <span className="text-muted-foreground">→ {perWan + extra} clientes</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {execResult && (
                <div className={`rounded-md p-3 border-l-4 ${execResult.success ? "border-l-success bg-success/10" : "border-l-destructive bg-destructive/10"}`}>
                  <div className="flex items-center gap-2">
                    {execResult.success ? <CheckCircle className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    <span className="text-sm text-foreground">{execResult.message}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Traffic Monitor */}
          <TrafficMonitor monitorInterfaces={monitorInterfaces} />

          {/* Failover Event Log */}
          {failoverEnabled && <FailoverLog wans={selectedWans} />}

          {/* Info */}
          <div className="card-glow rounded-lg p-4 border-l-4 border-l-primary">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">💡 Recomendación:</strong>{" "}
              {method === "pcc" && "PCC es ideal con WANs de distinta velocidad. Con failover, si una WAN cae el tráfico se redistribuye automáticamente."}
              {method === "nth" && "NTH funciona mejor con WANs de igual velocidad. El failover desactiva las reglas NTH de la WAN caída."}
              {method === "bonding" && "Con failover, el bonding usa active-backup: la interfaz principal maneja todo el tráfico y al caer conmuta al slave."}
              {method === "routing" && `Con ${selectedWans.length || "N"} WANs y ${totalClients} clientes, el failover redirige clientes a WANs activas automáticamente.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
