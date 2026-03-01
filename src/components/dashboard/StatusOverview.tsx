import { Activity, Database, Shield, Cloud, Wifi, Globe, MonitorSpeaker, Package, Gamepad2 } from "lucide-react";

const services = [
  { name: "AdGuard Home", status: "online" as const, icon: Shield, detail: "DNS filtrado — 3,812 queries bloqueadas hoy" },
  { name: "Unbound DNS", status: "online" as const, icon: Globe, detail: "Recursivo con DNSSEC — 4.2ms promedio" },
  { name: "Squid Proxy (YouTube)", status: "online" as const, icon: MonitorSpeaker, detail: "SSL Bump activo — 156 videos cacheados" },
  { name: "Lancache", status: "online" as const, icon: Gamepad2, detail: "Windows Update + Steam + Epic — 38GB en caché" },
  { name: "apt-cacher-ng", status: "online" as const, icon: Package, detail: "Repos Linux — 12GB cacheados" },
  { name: "Nginx CDN", status: "online" as const, icon: Database, detail: "Hit rate: 87% — 24GB almacenados" },
  { name: "Cloudflare Tunnel", status: "online" as const, icon: Cloud, detail: "Túnel activo — acceso sin IP pública" },
  { name: "Ping Google", status: "online" as const, icon: Activity, detail: "12ms — estable" },
  { name: "Internet", status: "online" as const, icon: Wifi, detail: "Sin caídas en 48h" },
];

const statusColors = {
  online: "status-dot-online",
  offline: "status-dot-offline",
  warning: "status-dot-warning",
};

export function StatusOverview() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Estado general — Ubuntu Server VPS</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {services.map((svc) => (
          <div key={svc.name} className="card-glow rounded-lg p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-secondary">
                  <svc.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{svc.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{svc.detail}</p>
                </div>
              </div>
              <div className={statusColors[svc.status]} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        {[
          { label: "Latencia DNS", value: "4.2ms", color: "text-primary" },
          { label: "URLs bloqueadas", value: "3,812", color: "text-warning" },
          { label: "Caché total", value: "124GB", color: "text-success" },
          { label: "Uptime", value: "99.8%", color: "text-primary" },
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
