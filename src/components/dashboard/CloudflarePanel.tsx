import { Cloud, ExternalLink, RefreshCw, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function CloudflarePanel() {
  const [copied, setCopied] = useState(false);
  const tunnelUrl = "https://mi-red-admin.trycloudflare.com";

  const handleCopy = () => {
    navigator.clipboard.writeText(tunnelUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Cloudflare Tunnel</h2>
        <p className="text-sm text-muted-foreground mt-1">Acceso remoto sin IP pública mediante cloudflared</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Estado del túnel", value: "Activo", color: "text-success" },
          { label: "Protocolo", value: "QUIC", color: "text-primary" },
          { label: "Conexiones", value: "4", color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card-glow rounded-lg p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <Cloud className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">URL Pública del Túnel</h3>
        </div>
        <div className="flex items-center gap-3 bg-secondary/50 rounded-md p-3">
          <code className="text-sm font-mono text-primary flex-1">{tunnelUrl}</code>
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

      <div className="card-glow rounded-lg p-5 mb-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Rutas Configuradas</h3>
        <div className="space-y-2">
          {[
            { path: "/", service: "http://localhost:3000", desc: "Panel de Administración" },
            { path: "/api", service: "http://localhost:8080", desc: "API Backend" },
            { path: "/dns", service: "http://localhost:5380", desc: "Unbound Web UI" },
            { path: "/wg", service: "http://localhost:51821", desc: "WireGuard UI" },
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

      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Configuración cloudflared</h3>
        <pre className="text-xs font-mono text-muted-foreground bg-secondary/50 p-4 rounded-md overflow-x-auto">
{`tunnel: mi-red-admin
credentials-file: /root/.cloudflared/credentials.json

ingress:
  - hostname: mi-red-admin.trycloudflare.com
    service: http://localhost:3000
  - hostname: mi-red-admin.trycloudflare.com
    path: /api/*
    service: http://localhost:8080
  - service: http_status:404`}
        </pre>
      </div>
    </div>
  );
}
