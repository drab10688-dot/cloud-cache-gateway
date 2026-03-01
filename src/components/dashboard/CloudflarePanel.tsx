import { Cloud, ExternalLink, Copy, Power, PowerOff, Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function CloudflarePanel() {
  const [tunnelActive, setTunnelActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");

  const toggleTunnel = () => {
    setLoading(true);
    setTimeout(() => {
      if (!tunnelActive) {
        setTunnelUrl(`https://netadmin-${Math.random().toString(36).slice(2, 8)}.trycloudflare.com`);
        setTunnelActive(true);
      } else {
        setTunnelUrl("");
        setTunnelActive(false);
      }
      setLoading(false);
    }, 2000);
  };

  const handleCopy = () => {
    if (!tunnelUrl) return;
    navigator.clipboard.writeText(tunnelUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Cloudflare Tunnel</h2>
        <p className="text-sm text-muted-foreground mt-1">Acceso remoto sin IP pública — un clic para generar tu link</p>
      </div>

      {/* Activate Button */}
      <div className={`rounded-lg p-6 mb-6 border-2 transition-all duration-500 ${
        tunnelActive 
          ? "border-success/50 bg-success/5 glow-success" 
          : "border-border bg-card card-glow"
      }`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full transition-all duration-500 ${
              tunnelActive ? "bg-success/20" : "bg-secondary"
            }`}>
              <Cloud className={`h-8 w-8 transition-colors duration-500 ${
                tunnelActive ? "text-success" : "text-muted-foreground"
              }`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {tunnelActive ? "Túnel Activo" : "Túnel Inactivo"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {tunnelActive 
                  ? "Tu panel es accesible desde cualquier lugar" 
                  : "Presiona para generar un link de acceso público"
                }
              </p>
            </div>
          </div>
          <Button
            onClick={toggleTunnel}
            disabled={loading}
            size="lg"
            className={`gap-2 min-w-[180px] text-base font-semibold transition-all duration-300 ${
              tunnelActive 
                ? "bg-destructive hover:bg-destructive/80 text-destructive-foreground" 
                : "bg-primary hover:bg-primary/80 text-primary-foreground"
            }`}
          >
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> {tunnelActive ? "Desactivando..." : "Activando..."}</>
            ) : tunnelActive ? (
              <><PowerOff className="h-5 w-5" /> Desactivar</>
            ) : (
              <><Power className="h-5 w-5" /> Activar Túnel</>
            )}
          </Button>
        </div>

        {/* Generated URL */}
        {tunnelActive && tunnelUrl && (
          <div className="mt-5 p-4 rounded-md bg-card border border-border animate-slide-in">
            <p className="text-xs text-muted-foreground mb-2">Tu link de acceso público:</p>
            <div className="flex items-center gap-3">
              <code className="text-sm font-mono text-success flex-1 break-all">{tunnelUrl}</code>
              <Button size="icon" variant="ghost" onClick={handleCopy} className="shrink-0 text-muted-foreground hover:text-foreground">
                <Copy className="h-4 w-4" />
              </Button>
              <a href={tunnelUrl} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
            {copied && <p className="text-xs text-success mt-2 font-mono">✓ Copiado al portapapeles</p>}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Protocolo", value: "QUIC", color: "text-primary" },
          { label: "Conexiones", value: tunnelActive ? "4" : "0", color: tunnelActive ? "text-primary" : "text-muted-foreground" },
          { label: "Uptime", value: tunnelActive ? "48h 23m" : "—", color: tunnelActive ? "text-success" : "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Routes */}
      <div className="card-glow rounded-lg p-5 mb-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Rutas del Túnel</h3>
        <div className="space-y-2">
          {[
            { path: "/", service: `http://localhost:${3000}`, desc: "AdGuard Home" },
            { path: "/panel", service: "http://localhost:8080", desc: "NetAdmin Panel" },
            { path: "/squid", service: "http://localhost:3128", desc: "Squid Stats" },
            { path: "/cache", service: "http://localhost:8888", desc: "Nginx CDN Stats" },
          ].map((route) => (
            <div key={route.path} className="flex items-center justify-between px-4 py-3 rounded-md bg-secondary/30 border border-border/50">
              <div className="flex items-center gap-4">
                <code className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{route.path}</code>
                <span className="text-xs text-muted-foreground">→</span>
                <code className="text-xs font-mono text-muted-foreground">{route.service}</code>
              </div>
              <span className="text-xs text-muted-foreground">{route.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Commands */}
      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          Comandos SSH
        </h3>
        <div className="space-y-2">
          {[
            { cmd: "netadmin-tunnel start", desc: "Activar túnel (genera URL automática)" },
            { cmd: "netadmin-tunnel start TU_TOKEN", desc: "Activar con token de Cloudflare" },
            { cmd: "netadmin-tunnel stop", desc: "Desactivar túnel" },
            { cmd: "netadmin-tunnel url", desc: "Ver URL actual" },
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
