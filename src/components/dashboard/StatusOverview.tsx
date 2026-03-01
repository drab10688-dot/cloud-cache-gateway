import { useCallback, useEffect, useState } from "react";
import { Activity, Database, Shield, Cloud, Wifi, Globe, MonitorSpeaker, Package, Gamepad2, Server } from "lucide-react";
import { api } from "@/lib/api";

interface Services {
  [key: string]: boolean;
}

interface SystemInfo {
  uptime: string;
  memory: string;
  disk: string;
  cpu: number;
}

const serviceConfig = [
  { key: "adguard", name: "AdGuard Home", icon: Shield },
  { key: "unbound", name: "Unbound DNS", icon: Globe },
  { key: "squid", name: "Squid Proxy (YouTube)", icon: MonitorSpeaker },
  { key: "lancache", name: "Lancache (Steam/Windows)", icon: Gamepad2 },
  { key: "apt-cacher-ng", name: "apt-cacher-ng", icon: Package },
  { key: "nginx", name: "Nginx CDN", icon: Database },
  { key: "cloudflared", name: "Cloudflare Tunnel", icon: Cloud },
  { key: "ping_monitor", name: "Monitor de Ping", icon: Activity },
];

export function StatusOverview() {
  const [services, setServices] = useState<Services>({});
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [pingStats, setPingStats] = useState({ current: 0, avg: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [svc, sys, ping] = await Promise.all([
        api.getServices(),
        api.getSystem(),
        api.getPing(),
      ]);
      setServices(svc);
      setSystem(sys);
      setPingStats(ping.stats);
    } catch {
      // Use fallback data if API unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [fetchData]);

  const onlineCount = Object.values(services).filter(Boolean).length;
  const totalCount = Object.keys(services).length;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Estado en tiempo real — {onlineCount}/{totalCount} servicios activos
        </p>
      </div>

      {/* System info */}
      {system && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Uptime", value: system.uptime.replace("up ", ""), color: "text-success" },
            { label: "RAM", value: system.memory, color: "text-primary" },
            { label: "Disco", value: system.disk, color: "text-warning" },
            { label: "CPU", value: `${system.cpu}%`, color: "text-primary" },
          ].map((s) => (
            <div key={s.label} className="card-glow rounded-lg p-4 text-center">
              <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Services grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {serviceConfig.map((svc) => {
          const isOnline = services[svc.key] ?? false;
          return (
            <div key={svc.key} className="card-glow rounded-lg p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-secondary">
                    <svc.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{svc.name}</h3>
                    <p className={`text-xs font-mono mt-0.5 ${isOnline ? "text-success" : "text-destructive"}`}>
                      {loading ? "Verificando..." : isOnline ? "Activo" : "Inactivo"}
                    </p>
                  </div>
                </div>
                <div className={loading ? "status-dot-warning animate-pulse-glow" : isOnline ? "status-dot-online" : "status-dot-offline"} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        {[
          { label: "Latencia DNS", value: `${pingStats.current || '—'}ms`, color: "text-primary" },
          { label: "Promedio", value: `${pingStats.avg || '—'}ms`, color: "text-success" },
          { label: "Servicios", value: `${onlineCount}/${totalCount}`, color: onlineCount === totalCount ? "text-success" : "text-warning" },
          { label: "Internet", value: pingStats.current > 0 ? "Online" : "Offline", color: pingStats.current > 0 ? "text-success" : "text-destructive" },
        ].map((stat) => (
          <div key={stat.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
