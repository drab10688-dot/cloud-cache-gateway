import { useState, useEffect, useCallback } from "react";
import { HeartPulse, ExternalLink, Plus, Settings, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const KUMA_URL = "/kuma/";

interface Monitor {
  id: number;
  name: string;
  type: string;
  target: string;
  status: string;
  uptime: string;
  ping: string;
}

const fallbackMonitors: Monitor[] = [
  { id: 1, name: "Google DNS", type: "ping", target: "8.8.8.8", status: "up", uptime: "—", ping: "—" },
  { id: 2, name: "Cloudflare DNS", type: "ping", target: "1.1.1.1", status: "up", uptime: "—", ping: "—" },
  { id: 3, name: "AdGuard Home", type: "http", target: "http://localhost:3000", status: "up", uptime: "—", ping: "—" },
  { id: 4, name: "Squid Proxy", type: "port", target: "localhost:3128", status: "up", uptime: "—", ping: "—" },
  { id: 5, name: "Nginx CDN", type: "http", target: "http://localhost:8888", status: "up", uptime: "—", ping: "—" },
  { id: 6, name: "Lancache", type: "port", target: "localhost:8880", status: "up", uptime: "—", ping: "—" },
  { id: 7, name: "apt-cacher-ng", type: "port", target: "localhost:3142", status: "up", uptime: "—", ping: "—" },
  { id: 8, name: "NetAdmin API", type: "http", target: "http://localhost:4000/api/services", status: "up", uptime: "—", ping: "—" },
];

export function UptimeKumaPanel() {
  const [monitors, setMonitors] = useState<Monitor[]>(fallbackMonitors);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMonitors = useCallback(async () => {
    try {
      const data = await api.getKumaMonitors();
      if (Array.isArray(data) && data.length > 0) {
        setMonitors(data);
        setError(null);
      }
    } catch {
      setError("No se pudo conectar con Uptime Kuma — mostrando datos de ejemplo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitors();
    const id = setInterval(fetchMonitors, 15000);
    return () => clearInterval(id);
  }, [fetchMonitors]);

  const upCount = monitors.filter(m => m.status === "up").length;
  const downCount = monitors.filter(m => m.status === "down").length;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Uptime Kuma</h2>
          <p className="text-sm text-muted-foreground mt-1">Monitor de disponibilidad de servicios</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchMonitors} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </Button>
          <a href={KUMA_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2 text-sm">
              <ExternalLink className="h-4 w-4" />
              Abrir Kuma UI
            </Button>
          </a>
        </div>
      </div>

      {error && (
        <div className="card-glow rounded-lg p-4 mb-4 border border-warning/30 bg-warning/5">
          <p className="text-xs text-warning">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">Asegúrate de que Uptime Kuma esté corriendo: <code className="font-mono text-primary">docker ps | grep kuma</code></p>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Monitores", value: monitors.length.toString(), color: "text-primary" },
          { label: "Online", value: upCount.toString(), color: "text-success" },
          { label: "Caídos", value: downCount.toString(), color: downCount > 0 ? "text-destructive" : "text-success" },
          { label: "Uptime Global", value: upCount > 0 ? `${Math.round((upCount / monitors.length) * 100)}%` : "—", color: "text-success" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Monitors list */}
      <div className="card-glow rounded-lg p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />
            Monitores Configurados
          </h3>
          <a href={KUMA_URL} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground">
              <Plus className="h-3 w-3" /> Agregar en Kuma
            </Button>
          </a>
        </div>

        <div className="space-y-2">
          {monitors.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 rounded-md bg-secondary/30 border border-border/50 hover:border-border transition-colors">
              <div className="flex items-center gap-3">
                <div className={m.status === "up" ? "status-dot-online" : "status-dot-offline"} />
                <div>
                  <span className="text-sm font-medium text-foreground">{m.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{m.target}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                  m.type === "ping" ? "bg-primary/20 text-primary" :
                  m.type === "http" ? "bg-success/20 text-success" :
                  "bg-warning/20 text-warning"
                }`}>{m.type}</span>
                <span className="text-xs font-mono text-muted-foreground w-16 text-right">{m.ping}</span>
                <span className="text-xs font-mono text-success w-16 text-right">{m.uptime}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Heartbeat visualization */}
      <div className="card-glow rounded-lg p-5 mb-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Heartbeat (últimas 24h)</h3>
        <div className="space-y-3">
          {monitors.slice(0, 5).map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">{m.name}</span>
              <div className="flex-1 flex gap-[2px]">
                {Array.from({ length: 48 }, (_, i) => {
                  const isDown = m.status === "down";
                  return (
                    <div
                      key={i}
                      className={`h-6 flex-1 rounded-[1px] transition-all ${
                        isDown ? "bg-destructive/80" : "bg-success/60 hover:bg-success"
                      }`}
                      title={`${Math.floor(i / 2)}:${i % 2 === 0 ? "00" : "30"}`}
                    />
                  );
                })}
              </div>
              <span className="text-xs font-mono text-success w-14 text-right shrink-0">{m.uptime}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Setup info */}
      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          Configuración
        </h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Uptime Kuma corre en Docker en el puerto <span className="text-primary font-mono">3001</span></p>
          <p>Accede a la interfaz completa para:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            {[
              "Agregar/editar monitores",
              "Configurar notificaciones (Telegram, Discord, Email)",
              "Ver historial detallado de uptime",
              "Crear páginas de estado públicas",
              "Configurar alertas por caídas",
              "Monitorear certificados SSL",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 px-3 py-1.5 rounded bg-secondary/30">
                <div className="status-dot-online shrink-0" style={{ width: 4, height: 4 }} />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
