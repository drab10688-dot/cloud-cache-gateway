import { useState, useCallback } from "react";
import { Shield, Globe, Ban, Clock, Search, RefreshCw, Loader2, AlertTriangle, Info, ExternalLink, Copy, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";

export function AdGuardPanel() {
  const fetchStatus = useCallback(() => api.getAdGuardStatus(), []);
  const fetchStats = useCallback(() => api.getAdGuardStats(), []);
  const fetchQueryLog = useCallback(() => api.getAdGuardQueryLog(), []);
  const fetchFiltering = useCallback(() => api.getAdGuardFiltering(), []);

  const { data: status, loading: loadingStatus, error: errorStatus, refetch: refetchStatus } = useApi(fetchStatus, 30000);
  const { data: stats, loading: loadingStats, refetch: refetchStats } = useApi(fetchStats, 15000);
  const { data: queryLog, loading: loadingQueryLog, refetch: refetchQueryLog } = useApi(fetchQueryLog, 30000);
  const { data: filtering, loading: loadingFiltering, refetch: refetchFiltering } = useApi(fetchFiltering, 60000);

  const [refreshing, setRefreshing] = useState(false);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([refetchStatus(), refetchStats(), refetchQueryLog(), refetchFiltering()]);
    setRefreshing(false);
  };

  const isLoading = loadingStatus && loadingStats;

  // Extract stats data
  const totalQueries = stats?.num_dns_queries ?? stats?.dns_queries ?? "—";
  const blockedQueries = stats?.num_blocked_filtering ?? stats?.blocked_filtering ?? "—";
  const blockPercent = stats?.num_dns_queries
    ? ((stats.num_blocked_filtering / stats.num_dns_queries) * 100).toFixed(1) + "%"
    : "—";
  const avgTime = stats?.avg_processing_time
    ? (stats.avg_processing_time * 1000).toFixed(1) + "ms"
    : "—";

  // Extract top blocked domains
  const topBlocked: { domain: string; count: number }[] = (stats?.top_blocked_domains || [])
    .slice(0, 6)
    .map((entry: any) => {
      const key = Object.keys(entry)[0];
      return { domain: key, count: entry[key] };
    });

  // Extract top clients
  const topClients: { ip: string; queries: number }[] = (stats?.top_clients || [])
    .slice(0, 6)
    .map((entry: any) => {
      const key = Object.keys(entry)[0];
      return { ip: key, queries: entry[key] };
    });

  // Extract filter lists
  const filters: { name: string; rules_count: number; enabled: boolean }[] = filtering?.filters || [];

  // Protection status
  const protectionEnabled = status?.protection_enabled ?? null;

  if (errorStatus) {
    return (
      <div>
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">AdGuard Home + Unbound</h2>
          <p className="text-sm text-muted-foreground mt-1">Filtrado DNS con resolución recursiva — Ubuntu Server</p>
        </div>
        <div className="card-glow rounded-lg p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-warning mx-auto mb-3" />
          <p className="text-foreground font-medium mb-1">No se pudo conectar con AdGuard Home</p>
          <p className="text-sm text-muted-foreground mb-4">{errorStatus}</p>
          <Button onClick={refetchStatus} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AdGuard Home + Unbound</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Filtrado DNS con resolución recursiva — Ubuntu Server
            {protectionEnabled !== null && (
              <span className={`ml-2 inline-flex items-center gap-1 ${protectionEnabled ? "text-success" : "text-destructive"}`}>
                <span className={protectionEnabled ? "status-dot-online" : "status-dot-offline"} />
                {protectionEnabled ? "Protección activa" : "Protección desactivada"}
              </span>
            )}
          </p>
        </div>
        <Button onClick={refreshAll} variant="outline" size="sm" disabled={refreshing} className="gap-2">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Queries hoy", value: isLoading ? "..." : totalQueries.toLocaleString?.() ?? totalQueries, icon: Search, color: "text-primary" },
          { label: "Bloqueadas", value: isLoading ? "..." : blockedQueries.toLocaleString?.() ?? blockedQueries, icon: Ban, color: "text-destructive" },
          { label: "% Bloqueado", value: isLoading ? "..." : blockPercent, icon: Shield, color: "text-warning" },
          { label: "Tiempo promedio", value: isLoading ? "..." : avgTime, icon: Clock, color: "text-success" },
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
        {/* Top Blocked Domains */}
        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Top Dominios Bloqueados</h3>
          {loadingStats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : topBlocked.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Sin datos disponibles</p>
          ) : (
            <div className="space-y-2">
              {topBlocked.map((d, i) => (
                <div key={d.domain} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-mono w-4">{i + 1}</span>
                    <Ban className="h-3 w-3 text-destructive" />
                    <span className="text-xs font-mono text-foreground truncate max-w-[200px]">{d.domain}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{d.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Clients */}
        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Top Clientes</h3>
          {loadingStats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : topClients.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Sin datos disponibles</p>
          ) : (
            <div className="space-y-2">
              {topClients.map((c, i) => (
                <div key={c.ip} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-mono w-4">{i + 1}</span>
                    <Globe className="h-3 w-3 text-primary" />
                    <span className="text-xs font-mono text-foreground">{c.ip}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{c.queries.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Filter Lists */}
        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Listas de Filtros Activas</h3>
          {loadingFiltering ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filters.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Sin listas configuradas</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filters.map((f) => (
                <div key={f.name} className={`flex items-center justify-between px-3 py-2 rounded-md border ${f.enabled ? "border-border bg-secondary/30" : "border-border/30 opacity-50"}`}>
                  <div className="flex items-center gap-2">
                    <div className={f.enabled ? "status-dot-online" : "status-dot-offline"} />
                    <span className="text-xs text-foreground truncate max-w-[200px]">{f.name}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{f.rules_count?.toLocaleString() ?? "—"} reglas</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unbound Config */}
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
