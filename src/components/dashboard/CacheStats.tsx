import { useState, useEffect, useCallback } from "react";
import { MonitorSpeaker, Package, Gamepad2, Database, Settings, RefreshCw, Loader2, Play, Shield, Zap, HardDrive, Wifi, AlertTriangle, Copy, CheckCircle } from "lucide-react";
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

  const serverIp = typeof window !== "undefined" ? window.location.hostname : "IP_SERVIDOR";

  const services = [
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
          { label: "Squid Video", value: cache?.squid.size || "—", color: "text-primary" },
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
      {/* VIDEO CACHE — SSL BUMP — FEATURED SECTION          */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="card-glow rounded-lg overflow-hidden mb-6 border-2 border-primary/30">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/20 shadow-[0_0_20px_hsl(175_80%_35%/0.2)]">
                <Play className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Caché de Video (YouTube + HTTPS)</h3>
                <p className="text-sm text-muted-foreground mt-0.5">SSL Bump — Squid intercepta, cachea y sirve videos a velocidad LAN</p>
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
          {/* How it works */}
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">¿Cómo funciona?</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {[
                { step: "1", icon: Shield, title: "SSL Bump", desc: "Squid abre el paquete HTTPS usando un certificado CA propio" },
                { step: "2", icon: MonitorSpeaker, title: "Inspección", desc: "Detecta si el contenido es un video (YouTube, streaming, etc.)" },
                { step: "3", icon: HardDrive, title: "Almacena", desc: "Guarda el video en disco duro o RAM del servidor" },
                { step: "4", icon: Zap, title: "Sirve Local", desc: "El próximo cliente recibe el video a velocidad de red local (~1Gbps)" },
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
                <span className="font-mono text-success font-semibold">{cache.squid.hitRate}% de contenido servido desde caché</span>
              </div>
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-1000"
                  style={{ width: `${cache.squid.hitRate}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0%</span>
                <span className="text-primary font-mono">Ahorro de ancho de banda: ~{cache.squid.hitRate}%</span>
                <span>100%</span>
              </div>
            </div>
          )}

          {/* Proxy config for clients */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-5">
            <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
              <Wifi className="h-3.5 w-3.5 text-primary" />
              Configuración en dispositivos del cliente
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-card rounded-md p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Proxy HTTP/HTTPS</p>
                <div className="flex items-center justify-between">
                  <code className="text-sm font-mono font-bold text-primary">{serverIp}:3128</code>
                  <button onClick={() => copyText(`${serverIp}:3128`, "proxy")} className="text-muted-foreground hover:text-foreground">
                    {copiedField === "proxy" ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="bg-card rounded-md p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Certificado CA (obligatorio)</p>
                <div className="flex items-center justify-between">
                  <code className="text-xs font-mono text-warning break-all">/etc/squid/ssl_cert/netadmin-ca.pem</code>
                  <button onClick={() => copyText("/etc/squid/ssl_cert/netadmin-ca.pem", "cert")} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
                    {copiedField === "cert" ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SSL Certificate warning */}
          <div className="bg-warning/5 border border-warning/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p className="font-semibold text-foreground">⚠ Certificado SSL requerido en cada dispositivo</p>
                <p>Para que el caché de video funcione, cada dispositivo cliente debe instalar el certificado CA generado por Squid. Sin este certificado, los navegadores mostrarán errores de seguridad en sitios HTTPS.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                  <div className="bg-card rounded p-2 border border-border">
                    <p className="font-semibold text-foreground">Windows</p>
                    <p>Doble clic en el .pem → Instalar certificado → Almacén: "Entidades de certificación raíz de confianza"</p>
                  </div>
                  <div className="bg-card rounded p-2 border border-border">
                    <p className="font-semibold text-foreground">Android</p>
                    <p>Ajustes → Seguridad → Instalar certificado → Seleccionar el .pem</p>
                  </div>
                  <div className="bg-card rounded p-2 border border-border">
                    <p className="font-semibold text-foreground">iOS / macOS</p>
                    <p>Abrir el .pem → Instalar perfil → Ajustes → General → Confiar en certificado</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Other cache services */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            </div>
            <p className="text-xs text-muted-foreground mb-3">{svc.description}</p>
            <div className="flex items-center justify-between bg-secondary/30 rounded-md px-4 py-3">
              <span className="text-xs text-muted-foreground">Tamaño en disco</span>
              <span className="text-lg font-bold font-mono text-primary">{svc.size}</span>
            </div>
          </div>
        ))}
      </div>

      {/* SSH Commands for cache */}
      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          Gestión de Caché (SSH)
        </h3>
        <div className="space-y-2">
          {[
            { cmd: "docker restart squid", desc: "Reiniciar Squid proxy" },
            { cmd: "docker logs squid --tail 50", desc: "Ver logs de Squid" },
            { cmd: "du -sh /opt/netadmin/data/squid-cache/", desc: "Ver tamaño caché Squid" },
            { cmd: "docker restart lancache", desc: "Reiniciar Lancache" },
            { cmd: "du -sh /opt/netadmin/data/lancache/data/", desc: "Ver tamaño caché Lancache" },
            { cmd: "docker restart apt-cacher-ng", desc: "Reiniciar apt-cacher-ng" },
            { cmd: "cat /etc/squid/ssl_cert/netadmin-ca.pem", desc: "Ver certificado CA" },
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
