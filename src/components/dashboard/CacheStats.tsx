import { useState, useEffect, useCallback } from "react";
import { MonitorSpeaker, Package, Gamepad2, Database } from "lucide-react";
import { api } from "@/lib/api";

interface CacheData {
  squid: { size: string; hits: number; misses: number; hitRate: number; youtube: number };
  lancache: { size: string; status: string };
  apt: { size: string };
  nginx: { size: string };
}

export function CacheStats() {
  const [cache, setCache] = useState<CacheData | null>(null);

  const fetchCache = useCallback(async () => {
    try {
      const [squid, lancache, apt, nginx] = await Promise.all([
        api.getCacheSquid(),
        api.getCacheLancache(),
        api.getCacheApt(),
        api.getCacheNginx(),
      ]);
      setCache({ squid, lancache, apt, nginx });
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    fetchCache();
    const id = setInterval(fetchCache, 30000);
    return () => clearInterval(id);
  }, [fetchCache]);

  const services = [
    {
      name: "Squid (YouTube + HTTPS)",
      icon: MonitorSpeaker,
      size: cache?.squid.size || "—",
      detail: cache ? `Hit rate: ${cache.squid.hitRate}% | YouTube: ${cache.squid.youtube} objetos` : "Cargando...",
      hitRate: cache?.squid.hitRate || 0,
    },
    {
      name: "Lancache (Windows/Steam/Epic)",
      icon: Gamepad2,
      size: cache?.lancache.size || "—",
      detail: cache ? `Estado: ${cache.lancache.status}` : "Cargando...",
      hitRate: null,
    },
    {
      name: "apt-cacher-ng (Repos Linux)",
      icon: Package,
      size: cache?.apt.size || "—",
      detail: "Repositorios Ubuntu/Debian",
      hitRate: null,
    },
    {
      name: "Nginx CDN (General)",
      icon: Database,
      size: cache?.nginx.size || "—",
      detail: "Caché de contenido web general",
      hitRate: null,
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Caché CDN — Datos Reales</h2>
        <p className="text-sm text-muted-foreground mt-1">Estadísticas en vivo de todos los servicios de caché</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Squid", value: cache?.squid.size || "—", color: "text-primary" },
          { label: "Lancache", value: cache?.lancache.size || "—", color: "text-success" },
          { label: "apt-cache", value: cache?.apt.size || "—", color: "text-warning" },
          { label: "Nginx CDN", value: cache?.nginx.size || "—", color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((svc) => (
          <div key={svc.name} className="card-glow rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-md bg-secondary">
                <svc.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{svc.name}</h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{svc.detail}</p>
              </div>
            </div>
            <div className="flex items-center justify-between bg-secondary/30 rounded-md px-4 py-3">
              <span className="text-xs text-muted-foreground">Tamaño en disco</span>
              <span className="text-lg font-bold font-mono text-primary">{svc.size}</span>
            </div>
            {svc.hitRate !== null && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Hit Rate</span>
                  <span className="font-mono text-success">{svc.hitRate}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${svc.hitRate}%` }} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {cache?.squid && (
        <div className="card-glow rounded-lg p-5 mt-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Squid — Detalle</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-success">{cache.squid.hits}</p>
              <p className="text-xs text-muted-foreground">Cache Hits</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-destructive">{cache.squid.misses}</p>
              <p className="text-xs text-muted-foreground">Cache Misses</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-primary">{cache.squid.youtube}</p>
              <p className="text-xs text-muted-foreground">YouTube</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
