import { useCallback, useEffect, useState } from "react";
import { Activity, Database, Shield, Cloud, Wifi, Globe, MonitorSpeaker, Package, Gamepad2, Server, HeartPulse, RefreshCw, Copy, CheckCircle, Info, ExternalLink } from "lucide-react";
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

const serverIpGlobal = typeof window !== "undefined" ? window.location.hostname : "localhost";

const serviceConfig = [
  { key: "adguard", name: "AdGuard Home", icon: Shield, port: 3000, desc: "Filtrado DNS, bloqueo de ads" },
  { key: "unbound", name: "Unbound DNS", icon: Globe, desc: "DNS recursivo con caché" },
  { key: "squid", name: "Squid Proxy (YouTube)", icon: MonitorSpeaker, port: 3128, desc: "Proxy caché SSL Bump" },
  { key: "lancache", name: "Lancache (Steam/Windows)", icon: Gamepad2, desc: "Caché de juegos y updates" },
  { key: "apt-cacher-ng", name: "apt-cacher-ng", icon: Package, port: 3142, desc: "Caché repos Linux" },
  { key: "nginx", name: "Nginx CDN", icon: Database, desc: "Web server + CDN caché" },
  { key: "cloudflared", name: "Cloudflare Tunnel", icon: Cloud, desc: "Acceso remoto sin IP pública" },
  { key: "uptime-kuma", name: "Uptime Kuma", icon: HeartPulse, port: 3001, desc: "Monitoreo de servicios" },
  { key: "ping_monitor", name: "Monitor de Ping", icon: Activity, desc: "Detección de caídas" },
  { key: "blocklist_updater", name: "Cron Listas (24h)", icon: RefreshCw, desc: "Actualización de listas" },
];

export function StatusOverview() {
  const [services, setServices] = useState<Services>({});
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [pingStats, setPingStats] = useState({ current: 0, avg: 0 });
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  // Detect the server IP from the current page URL
  const serverIp = typeof window !== "undefined" ? window.location.hostname : "IP_DEL_SERVIDOR";

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <button onClick={() => copyToClipboard(text, field)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2">
      {copiedField === field ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );

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

      {/* DNS Configuration for Clients */}
      <div className="card-glow rounded-lg p-5 mb-6 border-2 border-primary/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-primary/20">
            <Wifi className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Configuración DNS para tus Clientes</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Configura estos valores en el router o en cada dispositivo</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* DNS Config */}
          <div className="bg-secondary/30 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-primary" />
              DNS (Bloqueo de Ads + Seguridad)
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-card rounded-md px-3 py-2 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">DNS Primario</p>
                  <p className="text-sm font-mono font-bold text-primary">{serverIp}</p>
                </div>
                <CopyButton text={serverIp} field="dns-primary" />
              </div>
              <div className="flex items-center justify-between bg-card rounded-md px-3 py-2 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">DNS Secundario (respaldo)</p>
                  <p className="text-sm font-mono font-bold text-muted-foreground">8.8.8.8</p>
                </div>
                <CopyButton text="8.8.8.8" field="dns-secondary" />
              </div>
              <div className="flex items-center justify-between bg-card rounded-md px-3 py-2 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Puerto DNS</p>
                  <p className="text-sm font-mono font-bold text-muted-foreground">53 (predeterminado)</p>
                </div>
                <CopyButton text="53" field="dns-port" />
              </div>
            </div>
          </div>

          {/* Proxy Config */}
          <div className="bg-secondary/30 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <MonitorSpeaker className="h-3.5 w-3.5 text-primary" />
              Proxy Caché (YouTube, HTTPS)
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-card rounded-md px-3 py-2 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Proxy HTTP/HTTPS</p>
                  <p className="text-sm font-mono font-bold text-primary">{serverIp}:3128</p>
                </div>
                <CopyButton text={`${serverIp}:3128`} field="proxy" />
              </div>
              <div className="flex items-center justify-between bg-card rounded-md px-3 py-2 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">apt-cacher-ng (repos Linux)</p>
                  <p className="text-sm font-mono font-bold text-primary">{serverIp}:3142</p>
                </div>
                <CopyButton text={`${serverIp}:3142`} field="apt-cache" />
              </div>
              <div className="flex items-center justify-between bg-card rounded-md px-3 py-2 border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Certificado SSL (para HTTPS cache)</p>
                  <p className="text-xs font-mono text-warning break-all">/etc/squid/ssl_cert/netadmin-ca.pem</p>
                </div>
                <CopyButton text="/etc/squid/ssl_cert/netadmin-ca.pem" field="cert" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick setup instructions */}
        <div className="mt-4 p-3 rounded-md bg-primary/5 border border-primary/20">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Router/MikroTik:</strong> Cambia el DNS primario a <span className="text-primary font-mono">{serverIp}</span> en DHCP → DNS Settings</p>
              <p><strong className="text-foreground">Windows:</strong> Panel de control → Red → Adaptador → IPv4 → DNS: <span className="text-primary font-mono">{serverIp}</span></p>
              <p><strong className="text-foreground">Android/iOS:</strong> WiFi → Configuración avanzada → DNS: <span className="text-primary font-mono">{serverIp}</span></p>
              <p><strong className="text-foreground">⚠ HTTPS cache:</strong> Instalar el certificado CA en cada dispositivo para evitar errores SSL</p>
            </div>
          </div>
        </div>
      </div>

      {/* Services grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {serviceConfig.map((svc) => {
          const isOnline = services[svc.key] ?? false;
          const hasUI = !!svc.port;
          const serviceUrl = hasUI ? `http://${serverIp}:${svc.port}` : null;

          return (
            <div key={svc.key} className={`card-glow rounded-lg p-5 transition-all ${hasUI && isOnline ? "hover:border-primary/40 hover:shadow-lg cursor-pointer" : ""}`}>
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
                    <p className="text-xs text-muted-foreground mt-0.5">{svc.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasUI && isOnline && serviceUrl && (
                    <a
                      href={serviceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md bg-primary/10 hover:bg-primary/20 transition-colors"
                      title={`Abrir ${svc.name}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </a>
                  )}
                  <div className={loading ? "status-dot-warning animate-pulse-glow" : isOnline ? "status-dot-online" : "status-dot-offline"} />
                </div>
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
