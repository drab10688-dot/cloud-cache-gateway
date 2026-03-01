import { useState, useEffect, useCallback } from "react";
import { MonitorSpeaker, Package, Gamepad2, Database, Settings, RefreshCw, Loader2, Play, Globe, Zap, HardDrive, Wifi, Copy, CheckCircle, ArrowRight, Info } from "lucide-react";
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
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyBtn = ({ text, field }: { text: string; field: string }) => (
    <button onClick={() => copyText(text, field)} className="text-muted-foreground hover:text-foreground shrink-0">
      {copiedField === field ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );

  const serverIp = typeof window !== "undefined" ? window.location.hostname : "IP_SERVIDOR";

  const otherServices = [
    {
      name: "Lancache (Windows/Steam/Epic)",
      icon: Gamepad2,
      size: cache?.lancache.size || "—",
      detail: cache ? `Estado: ${cache.lancache.status}` : "Cargando...",
      description: "Caché de actualizaciones de Windows, juegos de Steam, Epic Games — funciona por DNS automáticamente",
    },
    {
      name: "apt-cacher-ng (Repos Linux)",
      icon: Package,
      size: cache?.apt.size || "—",
      detail: "Repositorios Ubuntu/Debian",
      description: "Caché de paquetes .deb para actualizaciones rápidas en red local",
    },
    {
      name: "Nginx CDN (General)",
      icon: Database,
      size: cache?.nginx.size || "—",
      detail: "Caché de contenido web general",
      description: "Reverse proxy con caché para contenido web estático y dinámico",
    },
  ];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Caché CDN</h2>
          <p className="text-sm text-muted-foreground mt-1">Todo el caché funciona a nivel DNS — solo configura el DNS en tus clientes</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Video Cache", value: cache?.squid.size || "—", color: "text-primary" },
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

      {/* ═══════════════════════════════════════════════════ */}
      {/* DNS-BASED VIDEO CACHE — FEATURED SECTION           */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="card-glow rounded-lg overflow-hidden mb-6 border-2 border-primary/30">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/20 shadow-[0_0_20px_hsl(175_80%_35%/0.2)]">
                <Play className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Caché de Video por DNS</h3>
                <p className="text-sm text-muted-foreground mt-0.5">YouTube, Netflix, streaming — solo necesitas configurar el DNS</p>
              </div>
            </div>
            <span className={`text-xs font-mono px-3 py-1 rounded-full ${
              cache ? "bg-success/10 text-success border border-success/30" : "bg-muted text-muted-foreground"
            }`}>
              {cache ? "● Activo" : "Verificando..."}
            </span>
          </div>
        </div>

        <div className="p-5">
          {/* How DNS-based caching works */}
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">¿Cómo funciona? — Sin instalar nada en los clientes</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {[
                { step: "1", icon: Globe, title: "DNS Redirect", desc: "El cliente usa tu DNS. AdGuard redirige dominios de video (ej: youtube.com) a tu servidor" },
                { step: "2", icon: MonitorSpeaker, title: "Proxy Transparente", desc: "Nginx/Squid actúa como reverse proxy transparente para esos dominios" },
                { step: "3", icon: HardDrive, title: "Almacena en Disco", desc: "El video se descarga 1 vez de internet y se guarda en el disco del VPS" },
                { step: "4", icon: Zap, title: "Sirve desde LAN", desc: "Los siguientes clientes reciben el video desde tu servidor a velocidad local (~1Gbps)" },
              ].map((s) => (
                <div key={s.step} className="relative bg-secondary/30 rounded-lg p-4 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">{s.step}</span>
                    <s.icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Key advantage */}
          <div className="bg-success/5 border border-success/30 rounded-lg p-4 mb-5">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-success shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground">
                <p className="font-semibold text-foreground text-sm">✅ Ventaja: No requiere configurar proxy ni instalar certificados</p>
                <p className="mt-1">A diferencia de un proxy HTTPS con SSL Bump, el caché por DNS funciona <strong className="text-foreground">solo configurando el DNS</strong> en el router o dispositivo. No necesitas instalar certificados CA ni configurar proxy en cada equipo. El tráfico se redirige de forma transparente.</p>
              </div>
            </div>
          </div>

          {/* Live stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            {[
              { label: "Tamaño Caché", value: cache?.squid.size || "—", color: "text-primary", icon: HardDrive },
              { label: "Cache Hits", value: cache?.squid.hits?.toLocaleString() || "—", color: "text-success", icon: Zap },
              { label: "Cache Misses", value: cache?.squid.misses?.toLocaleString() || "—", color: "text-destructive", icon: Wifi },
              { label: "Hit Rate", value: cache ? `${cache.squid.hitRate}%` : "—", color: "text-success", icon: RefreshCw },
              { label: "Videos YouTube", value: cache?.squid.youtube?.toLocaleString() || "—", color: "text-primary", icon: Play },
            ].map((s) => (
              <div key={s.label} className="bg-secondary/20 rounded-lg p-3 text-center border border-border/30">
                <s.icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Hit Rate bar */}
          {cache && (
            <div className="mb-5">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Eficiencia del Caché</span>
                <span className="font-mono text-success font-semibold">{cache.squid.hitRate}% servido desde caché local</span>
              </div>
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-1000" style={{ width: `${cache.squid.hitRate}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0%</span>
                <span className="text-primary font-mono">Ahorro de ancho de banda: ~{cache.squid.hitRate}%</span>
                <span>100%</span>
              </div>
            </div>
          )}

          {/* DNS config — the only thing clients need */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-primary" />
              Lo único que necesitan tus clientes: configurar este DNS
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-card rounded-md p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">DNS Primario (tu servidor)</p>
                <div className="flex items-center justify-between">
                  <code className="text-lg font-mono font-bold text-primary">{serverIp}</code>
                  <CopyBtn text={serverIp} field="dns" />
                </div>
              </div>
              <div className="bg-card rounded-md p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">DNS Secundario (respaldo)</p>
                <div className="flex items-center justify-between">
                  <code className="text-lg font-mono font-bold text-muted-foreground">8.8.8.8</code>
                  <CopyBtn text="8.8.8.8" field="dns2" />
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              {[
                { device: "Router / MikroTik", config: `DHCP → DNS = ${serverIp}` },
                { device: "Windows", config: `Adaptador → IPv4 → DNS = ${serverIp}` },
                { device: "Android / iOS", config: `WiFi → DNS privado = ${serverIp}` },
              ].map((d) => (
                <div key={d.device} className="bg-secondary/30 rounded p-2 text-xs">
                  <p className="font-semibold text-foreground">{d.device}</p>
                  <p className="text-muted-foreground font-mono mt-0.5">{d.config}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Other cache services */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {otherServices.map((svc) => (
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
            <p className="text-xs text-muted-foreground mb-3">{svc.description}</p>
            <div className="flex items-center justify-between bg-secondary/30 rounded-md px-4 py-3">
              <span className="text-xs text-muted-foreground">Tamaño en disco</span>
              <span className="text-lg font-bold font-mono text-primary">{svc.size}</span>
            </div>
          </div>
        ))}
      </div>

      {/* SSH Commands */}
      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          Gestión de Caché (SSH)
        </h3>
        <div className="space-y-2">
          {[
            { cmd: "docker restart squid", desc: "Reiniciar proxy de video" },
            { cmd: "docker logs squid --tail 50", desc: "Ver logs de caché video" },
            { cmd: "du -sh /opt/netadmin/data/squid-cache/", desc: "Tamaño caché video" },
            { cmd: "docker restart lancache", desc: "Reiniciar Lancache" },
            { cmd: "du -sh /opt/netadmin/data/lancache/data/", desc: "Tamaño caché juegos" },
            { cmd: "docker restart apt-cacher-ng", desc: "Reiniciar apt-cacher-ng" },
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
