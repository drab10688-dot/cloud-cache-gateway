import { Shield, Globe, Ban, Clock, Search } from "lucide-react";

export function AdGuardPanel() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">AdGuard Home + Unbound</h2>
        <p className="text-sm text-muted-foreground mt-1">Filtrado DNS con resolución recursiva — Ubuntu Server</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Queries hoy", value: "28,431", icon: Search, color: "text-primary" },
          { label: "Bloqueadas", value: "3,812", icon: Ban, color: "text-destructive" },
          { label: "% Bloqueado", value: "13.4%", icon: Shield, color: "text-warning" },
          { label: "Tiempo promedio", value: "4.2ms", icon: Clock, color: "text-success" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Top Dominios Bloqueados</h3>
          <div className="space-y-2">
            {[
              { domain: "ads.google.com", count: 842 },
              { domain: "tracker.facebook.com", count: 631 },
              { domain: "analytics.tiktok.com", count: 418 },
              { domain: "telemetry.microsoft.com", count: 312 },
              { domain: "ads.doubleclick.net", count: 287 },
              { domain: "pixel.facebook.com", count: 203 },
            ].map((d, i) => (
              <div key={d.domain} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/30">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-mono w-4">{i + 1}</span>
                  <Ban className="h-3 w-3 text-destructive" />
                  <span className="text-xs font-mono text-foreground">{d.domain}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{d.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Top Clientes</h3>
          <div className="space-y-2">
            {[
              { ip: "192.168.1.10", name: "PC-Admin", queries: 8420 },
              { ip: "192.168.1.15", name: "Smart-TV", queries: 6231 },
              { ip: "192.168.1.22", name: "Laptop-Juan", queries: 4180 },
              { ip: "192.168.1.30", name: "Celular-Maria", queries: 3120 },
              { ip: "192.168.1.45", name: "Tablet-Kids", queries: 2870 },
              { ip: "192.168.1.1", name: "Router", queries: 1610 },
            ].map((c, i) => (
              <div key={c.ip} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/30">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-mono w-4">{i + 1}</span>
                  <Globe className="h-3 w-3 text-primary" />
                  <div>
                    <span className="text-xs font-medium text-foreground">{c.name}</span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">{c.ip}</span>
                  </div>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{c.queries.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Listas de Filtros Activas</h3>
          <div className="space-y-2">
            {[
              { name: "AdGuard DNS filter", rules: 48542, enabled: true },
              { name: "AdAway Default", rules: 6544, enabled: true },
              { name: "MinTIC Colombia", rules: 42, enabled: true },
              { name: "Coljuegos Blocklist", rules: 18, enabled: true },
              { name: "MalwareDomainList", rules: 1104, enabled: true },
              { name: "Steven Black's List", rules: 82410, enabled: false },
            ].map((f) => (
              <div key={f.name} className={`flex items-center justify-between px-3 py-2 rounded-md border ${f.enabled ? "border-border bg-secondary/30" : "border-border/30 opacity-50"}`}>
                <div className="flex items-center gap-2">
                  <div className={f.enabled ? "status-dot-online" : "status-dot-offline"} />
                  <span className="text-xs text-foreground">{f.name}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{f.rules.toLocaleString()} reglas</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Configuración Unbound</h3>
          <pre className="text-xs font-mono text-muted-foreground bg-secondary/50 p-4 rounded-md overflow-x-auto">
{`# /etc/unbound/unbound.conf
server:
  interface: 0.0.0.0
  port: 5335
  do-ip6: no
  
  # Rendimiento
  num-threads: 2
  msg-cache-size: 64m
  rrset-cache-size: 128m
  cache-min-ttl: 300
  cache-max-ttl: 86400
  prefetch: yes
  prefetch-key: yes
  
  # Privacidad
  hide-identity: yes
  hide-version: yes
  qname-minimisation: yes
  
  # Root hints
  root-hints: /var/lib/unbound/root.hints

# AdGuard upstream: 127.0.0.1:5335
# AdGuard → Unbound (recursivo + DNSSEC)`}
          </pre>
        </div>
      </div>
    </div>
  );
}
