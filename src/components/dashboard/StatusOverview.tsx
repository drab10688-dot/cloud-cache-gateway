import { Activity, Database, Lock, Cloud, Wifi, Shield } from "lucide-react";

const services = [
  { name: "Cloudflare Tunnel", status: "online" as const, icon: Cloud, detail: "Túnel activo — link público habilitado" },
  { name: "WireGuard VPN", status: "online" as const, icon: Lock, detail: "3 peers conectados" },
  { name: "Unbound DNS", status: "online" as const, icon: Shield, detail: "42 dominios bloqueados" },
  { name: "Caché CDN", status: "online" as const, icon: Database, detail: "Hit rate: 87%" },
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
        <p className="text-sm text-muted-foreground mt-1">Estado general de los servicios de red</p>
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

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        {[
          { label: "Latencia promedio", value: "12ms", color: "text-primary" },
          { label: "URLs bloqueadas", value: "42", color: "text-warning" },
          { label: "Cache hit rate", value: "87%", color: "text-success" },
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
