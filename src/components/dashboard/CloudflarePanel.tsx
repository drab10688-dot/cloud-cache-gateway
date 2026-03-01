import { Cloud, ExternalLink, Copy, Power, PowerOff, Loader2, Terminal, CheckCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

export function CloudflarePanel() {
  const [tunnelActive, setTunnelActive] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customToken, setCustomToken] = useState("");
  const [useCustomToken, setUseCustomToken] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await api.getTunnelStatus();
      setTunnelActive(status.active);
      setTunnelUrl(status.url || "");
    } catch { /* offline */ }
    finally { setInitialLoading(false); }
  }, []);

  useEffect(() => {
    // Only check status, never auto-start
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const toggleTunnel = async () => {
    setLoading(true);
    try {
      if (tunnelActive) {
        await api.stopTunnel();
        setTunnelActive(false);
        setTunnelUrl("");
      } else {
        // Use custom token only if user opted in and provided one
        const token = useCustomToken && customToken.trim() ? customToken.trim() : undefined;
        const result = await api.startTunnel(token);
        setTunnelActive(true);
        setTunnelUrl(result.url || "");
        if (!result.url) {
          setTimeout(fetchStatus, 8000);
        }
      }
    } catch { /* error */ }
    setLoading(false);
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
        <p className="text-sm text-muted-foreground mt-1">Un clic para generar tu link de acceso — sin IP pública</p>
      </div>

      {/* Big activate button */}
      <div className={`rounded-lg p-6 mb-6 border-2 transition-all duration-500 ${
        tunnelActive ? "border-success/50 bg-success/5 glow-success" : "border-border bg-card"
      }`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full transition-all duration-500 ${tunnelActive ? "bg-success/20" : "bg-secondary"}`}>
              <Cloud className={`h-8 w-8 transition-colors duration-500 ${tunnelActive ? "text-success" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">{tunnelActive ? "Túnel Activo ✓" : "Túnel Inactivo"}</h3>
              <p className="text-sm text-muted-foreground">
                {tunnelActive ? "Tu panel es accesible desde cualquier lugar" : "Presiona para generar un link de acceso público (gratis)"}
              </p>
            </div>
          </div>
          <Button onClick={toggleTunnel} disabled={loading || initialLoading} size="lg"
            className={`gap-2 min-w-[180px] text-base font-semibold transition-all duration-300 ${
              tunnelActive ? "bg-destructive hover:bg-destructive/80 text-destructive-foreground" : "bg-primary hover:bg-primary/80 text-primary-foreground"
            }`}>
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> {tunnelActive ? "Desactivando..." : "Activando..."}</>
            ) : tunnelActive ? (
              <><PowerOff className="h-5 w-5" /> Desactivar</>
            ) : (
              <><Power className="h-5 w-5" /> Activar Túnel</>
            )}
          </Button>
        </div>

        {tunnelActive && tunnelUrl && (
          <div className="mt-5 p-4 rounded-md bg-secondary/50 border border-border animate-slide-in">
            <p className="text-xs text-muted-foreground mb-2">Tu link de acceso público:</p>
            <div className="flex items-center gap-3">
              <code className="text-sm font-mono text-success flex-1 break-all">{tunnelUrl}</code>
              <Button size="icon" variant="ghost" onClick={handleCopy} className="shrink-0 text-muted-foreground hover:text-foreground">
                {copied ? <CheckCircle className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
              <a href={tunnelUrl} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        )}

        {tunnelActive && !tunnelUrl && (
          <div className="mt-5 p-4 rounded-md bg-secondary/50 border border-border animate-slide-in">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generando URL... puede tomar unos segundos
            </p>
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="card-glow rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          Configuración del Túnel
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Modo</p>
              <p className="text-xs text-muted-foreground">Por defecto usa URL temporal gratuita de Cloudflare</p>
            </div>
            <span className="text-xs font-mono px-3 py-1 rounded-full bg-primary/10 text-primary">
              {useCustomToken ? "Token propio" : "Gratuito (Quick Tunnel)"}
            </span>
          </div>
          
          <div className="border-t border-border pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomToken}
                onChange={(e) => setUseCustomToken(e.target.checked)}
                className="rounded border-border"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Usar token propio de Cloudflare</p>
                <p className="text-xs text-muted-foreground">Opcional: para subdominio fijo en tu cuenta de Cloudflare</p>
              </div>
            </label>
            {useCustomToken && (
              <div className="mt-3 ml-7">
                <Input
                  type="password"
                  placeholder="Pega tu token de Cloudflare aquí..."
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  className="bg-secondary border-border text-foreground font-mono text-sm"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SSH Commands */}
      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          También puedes usar SSH
        </h3>
        <div className="space-y-2">
          {[
            { cmd: "netadmin-tunnel start", desc: "Activar (genera URL automática)" },
            { cmd: "netadmin-tunnel start TU_TOKEN", desc: "Activar con token de Cloudflare" },
            { cmd: "netadmin-tunnel stop", desc: "Desactivar túnel" },
            { cmd: "netadmin-tunnel url", desc: "Ver URL actual" },
            { cmd: "netadmin-status", desc: "Estado de todos los servicios" },
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
