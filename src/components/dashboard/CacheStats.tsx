import { useState, useEffect, useCallback } from "react";
import { MonitorSpeaker, Package, Gamepad2, Database, Settings, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface CacheData {
  squid: { size: string; hits: number; misses: number; hitRate: number; youtube: number };
  lancache: { size: string; status: string };
  apt: { size: string };
  nginx: { size: string };
}

export function CacheStats() {
  const [cache, setCache] = useState<CacheData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCache();
    setRefreshing(false);
  };

  const services = [
    {
      name: "Squid (YouTube + HTTPS)",
      icon: MonitorSpeaker,
      size: cache?.squid.size || "—",
      detail: cache ? `Hit rate: ${cache.squid.hitRate}% | YouTube: ${cache.squid.youtube} objetos` : "Cargando...",
      hitRate: cache?.squid.hitRate || 0,
      description: "Proxy con SSL Bump para cachear contenido HTTPS incluyendo YouTube",
      status: cache ? "Activo" : "Verificando...",
    },
    {
      name: "Lancache (Windows/Steam/Epic)",
      icon: Gamepad2,
      size: cache?.lancache.size || "—",
      detail: cache ? `Estado: ${cache.lancache.status}` : "Cargando...",
      hitRate: null,
      description: "Caché de actualizaciones de Windows, juegos de Steam, Epic Games, etc.",
      status: cache?.lancache.status || "Verificando...",
    },
    {
      name: "apt-cacher-ng (Repos Linux)",
      icon: Package,
      size: cache?.apt.size || "—",
      detail: "Repositorios Ubuntu/Debian",
      hitRate: null,
      description: "Caché de paquetes .deb para actualizaciones rápidas en red local",
      status: cache ? "Activo" : "Verificando...",
    },
    {
      name: "Nginx CDN (General)",
      icon: Database,
      size: cache?.nginx.size || "—",
      detail: "Caché de contenido web general",
      hitRate: null,
      description: "Reverse proxy con caché para contenido web estático y dinámico",
      status: cache ? "Activo" : "Verificando...",
    },
  ];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Caché CDN</h2>
          <p className="text-sm text-muted-foreground mt-1">Estadísticas en vivo de todos los servicios de caché</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      {/* Summary cards */}
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

      {/* Service cards with config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((svc) => (
          <div key={svc.name} className="card-glow rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-secondary">
                  <svc.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{svc.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{svc.detail}</p>
                </div>
              </div>
              <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                svc.status === "Activo" || svc.status === "running"
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              }`}>
                {svc.status}
              </span>
            </div>
            
            <p className="text-xs text-muted-foreground mb-3">{svc.description}</p>

            <div className="flex items-center justify-between bg-secondary/30 rounded-md px-4 py-3">
              <span className="text-xs text-muted-foreground">Tamaño en disco</span>
              <span className="text-lg font-bold font-mono text-primary">{svc.size}</span>
            </div>

            {svc.hitRate !== null && (
              <div className="mt-3">
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

      {/* Squid detail */}
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

      {/* SSH Commands for cache */}
      <div className="card-glow rounded-lg p-5 mt-4">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          Gestión de Caché (SSH)
        </h3>
        <div className="space-y-2">
          {[
            { cmd: "docker restart squid", desc: "Reiniciar Squid proxy" },
            { cmd: "docker restart lancache", desc: "Reiniciar Lancache" },
            { cmd: "docker restart apt-cacher-ng", desc: "Reiniciar apt-cacher-ng" },
            { cmd: "du -sh /opt/netadmin/data/squid-cache/", desc: "Ver tamaño caché Squid" },
            { cmd: "du -sh /opt/netadmin/data/lancache/data/", desc: "Ver tamaño caché Lancache" },
            { cmd: "docker logs squid --tail 50", desc: "Ver logs de Squid" },
          ].map((c) => (
            <div key={c.cmd} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/50">
              <code className="text-xs font-mono text-primary">{c.cmd}</code>
              <span className="text-xs text-muted-foreground">{c.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
