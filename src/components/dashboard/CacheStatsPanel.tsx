import { useState, useEffect, useCallback } from "react";
import { Database, HardDrive, Download, TrendingUp, RefreshCw, Loader2, Server, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface CacheStats {
  totalCached: string;
  totalServed: string;
  totalSaved: string;
  hitRate: number;
  uptime: string;
  services: {
    name: string;
    cached: string;
    served: string;
    hitRate: number;
  }[];
  disk: {
    used: string;
    total: string;
    percent: number;
  };
  recentActivity: {
    time: string;
    domain: string;
    size: string;
    status: "HIT" | "MISS";
  }[];
}

const defaultStats: CacheStats = {
  totalCached: "0 GB",
  totalServed: "0 GB",
  totalSaved: "0 GB",
  hitRate: 0,
  uptime: "—",
  services: [],
  disk: { used: "0 GB", total: "0 GB", percent: 0 },
  recentActivity: [],
};

function progressColor(percent: number) {
  if (percent < 50) return "bg-success";
  if (percent < 80) return "bg-warning";
  return "bg-destructive";
}

export function CacheStatsPanel() {
  const [stats, setStats] = useState<CacheStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getCacheStats();
      setStats(data);
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 10000);
    return () => clearInterval(id);
  }, [fetchStats]);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Estadísticas de Caché
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Lancache · apt-cacher-ng · Nginx CDN — Ahorro de ancho de banda en tiempo real
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="card-glow rounded-lg p-8 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Cargando estadísticas...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Datos en Caché", value: stats.totalCached, icon: HardDrive, color: "text-primary" },
              { label: "Datos Servidos", value: stats.totalServed, icon: Download, color: "text-success" },
              { label: "BW Ahorrado", value: stats.totalSaved, icon: TrendingUp, color: "text-chart-2" },
              { label: "Tasa de Acierto", value: `${stats.hitRate}%`, icon: Server, color: "text-warning" },
            ].map((card) => (
              <div key={card.label} className="card-glow rounded-lg p-4 text-center">
                <card.icon className={`h-5 w-5 mx-auto mb-2 ${card.color}`} />
                <p className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Disk usage for cache */}
          <div className="card-glow rounded-lg p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              Almacenamiento de Caché
            </h3>
            <div className="w-full bg-secondary rounded-full h-4 overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressColor(stats.disk.percent)}`}
                style={{ width: `${Math.min(stats.disk.percent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground font-mono">
              <span>Usado: {stats.disk.used}</span>
              <span>{stats.disk.percent}%</span>
              <span>Total: {stats.disk.total}</span>
            </div>
          </div>

          {/* Per-service breakdown */}
          {stats.services.length > 0 && (
            <div className="card-glow rounded-lg p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Desglose por Servicio
              </h3>
              <div className="space-y-3">
                {stats.services.map((svc) => (
                  <div key={svc.name} className="flex items-center justify-between p-3 bg-secondary/50 rounded-md">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{svc.name}</p>
                      <div className="flex gap-4 mt-1">
                        <span className="text-xs text-muted-foreground">Caché: <span className="font-mono text-foreground">{svc.cached}</span></span>
                        <span className="text-xs text-muted-foreground">Servido: <span className="font-mono text-success">{svc.served}</span></span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold font-mono ${svc.hitRate >= 70 ? "text-success" : svc.hitRate >= 40 ? "text-warning" : "text-destructive"}`}>
                        {svc.hitRate}%
                      </p>
                      <p className="text-xs text-muted-foreground">hit rate</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent activity log */}
          {stats.recentActivity.length > 0 && (
            <div className="card-glow rounded-lg p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" />
                Actividad Reciente
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left py-2 pr-4">Hora</th>
                      <th className="text-left py-2 pr-4">Dominio</th>
                      <th className="text-right py-2 pr-4">Tamaño</th>
                      <th className="text-center py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentActivity.map((item, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-mono text-muted-foreground">{item.time}</td>
                        <td className="py-2 pr-4 font-mono text-foreground">{item.domain}</td>
                        <td className="py-2 pr-4 text-right font-mono text-foreground">{item.size}</td>
                        <td className="py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            item.status === "HIT" 
                              ? "bg-success/20 text-success" 
                              : "bg-destructive/20 text-destructive"
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="card-glow rounded-lg p-4 border-l-4 border-l-primary">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">💡 ¿Cómo funciona?</strong> Lancache intercepta descargas de 
              Windows Update, Steam, Xbox, Origin y otros CDNs mediante redirección DNS. La primera descarga se 
              almacena localmente; las siguientes se sirven desde caché a velocidad LAN, ahorrando ancho de banda 
              del proveedor (ideal para enlaces Starlink o limitados).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
