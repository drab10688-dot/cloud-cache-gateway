import { useState, useEffect, useCallback } from "react";
import { Cpu, MemoryStick, HardDrive, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart,
} from "recharts";

interface ServerStats {
  cpu: number;
  memory: { used: number; total: number; percent: number };
  disk: { used: string; total: string; percent: number };
  network: { rx_bytes: number; tx_bytes: number; rx_speed: number; tx_speed: number };
  uptime: string;
}

interface HistoryPoint {
  time: string;
  cpu: number;
  mem: number;
  rx: number;
  tx: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function ServerMonitorPanel() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getServerMonitor();
      setStats(data);
      setHistory((prev) => {
        const now = new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const point: HistoryPoint = {
          time: now,
          cpu: data.cpu,
          mem: data.memory.percent,
          rx: data.network.rx_speed,
          tx: data.network.tx_speed,
        };
        const next = [...prev, point];
        return next.length > 60 ? next.slice(-60) : next;
      });
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 3000);
    return () => clearInterval(id);
  }, [fetchStats]);

  const gaugeColor = (pct: number) =>
    pct > 90 ? "text-destructive" : pct > 70 ? "text-warning" : "text-success";

  const progressColor = (pct: number) =>
    pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success";

  // Format network history for chart (convert to KB/s for readability)
  const chartData = history.map((h) => ({
    ...h,
    rxKB: +(h.rx / 1024).toFixed(1),
    txKB: +(h.tx / 1024).toFixed(1),
  }));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Monitor del Servidor</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Consumo en tiempo real — CPU, Memoria, Disco y Red
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="p-2 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Main gauges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* CPU */}
        <div className="card-glow rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">CPU</span>
          </div>
          <p className={`text-3xl font-bold font-mono ${gaugeColor(stats?.cpu ?? 0)}`}>
            {stats?.cpu ?? "—"}%
          </p>
          <div className="mt-3">
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressColor(stats?.cpu ?? 0)}`}
                style={{ width: `${stats?.cpu ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* RAM */}
        <div className="card-glow rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <MemoryStick className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Memoria RAM</span>
          </div>
          <p className={`text-3xl font-bold font-mono ${gaugeColor(stats?.memory.percent ?? 0)}`}>
            {stats?.memory.percent ?? "—"}%
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {stats ? `${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)}` : "—"}
          </p>
          <div className="mt-2">
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressColor(stats?.memory.percent ?? 0)}`}
                style={{ width: `${stats?.memory.percent ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Disco */}
        <div className="card-glow rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Disco</span>
          </div>
          <p className={`text-3xl font-bold font-mono ${gaugeColor(stats?.disk.percent ?? 0)}`}>
            {stats?.disk.percent ?? "—"}%
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {stats ? `${stats.disk.used} / ${stats.disk.total}` : "—"}
          </p>
          <div className="mt-2">
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressColor(stats?.disk.percent ?? 0)}`}
                style={{ width: `${stats?.disk.percent ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Network Speed */}
        <div className="card-glow rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowDown className="h-4 w-4 text-success" />
            <ArrowUp className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Red</span>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex items-center gap-1.5">
                <ArrowDown className="h-3 w-3 text-success" />
                <span className="text-lg font-bold font-mono text-success">
                  {stats ? formatSpeed(stats.network.rx_speed) : "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground ml-4.5">Bajada</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <ArrowUp className="h-3 w-3 text-primary" />
                <span className="text-lg font-bold font-mono text-primary">
                  {stats ? formatSpeed(stats.network.tx_speed) : "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground ml-4.5">Subida</p>
            </div>
          </div>
        </div>
      </div>

      {/* CPU + Memory Chart */}
      <div className="card-glow rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">CPU y Memoria — Últimos 3 minutos</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" unit="%" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="cpu" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="CPU %" />
              <Line type="monotone" dataKey="mem" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} name="RAM %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Network Chart */}
      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Tráfico de Red — Últimos 3 minutos</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" unit=" KB/s" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
                formatter={(val: number, name: string) => [`${val} KB/s`, name]}
              />
              <Area type="monotone" dataKey="rxKB" stroke="hsl(var(--success))" fill="hsl(var(--success) / 0.15)" strokeWidth={2} name="↓ Bajada" />
              <Area type="monotone" dataKey="txKB" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} name="↑ Subida" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Total transferred */}
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Recibido</p>
              <p className="text-lg font-bold font-mono text-success">{formatBytes(stats.network.rx_bytes)}</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Enviado</p>
              <p className="text-lg font-bold font-mono text-primary">{formatBytes(stats.network.tx_bytes)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Uptime */}
      {stats?.uptime && (
        <div className="card-glow rounded-lg p-4 mt-6 text-center">
          <p className="text-xs text-muted-foreground">Uptime del Servidor</p>
          <p className="text-lg font-bold font-mono text-success mt-1">{stats.uptime}</p>
        </div>
      )}
    </div>
  );
}
