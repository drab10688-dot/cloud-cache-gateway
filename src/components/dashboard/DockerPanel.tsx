import { useState, useCallback, useEffect } from "react";
import { Box, Play, Square, RotateCcw, Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Container {
  name: string;
  displayName: string;
  state: "running" | "exited" | "created" | "paused" | "dead" | string;
  status: string;
  image: string;
}

export function DockerPanel() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchContainers = useCallback(async () => {
    try {
      const data = await api.getContainers();
      setContainers(Array.isArray(data) ? data : []);
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContainers();
    const id = setInterval(fetchContainers, 8000);
    return () => clearInterval(id);
  }, [fetchContainers]);

  const handleAction = async (action: "start" | "stop" | "restart", name: string) => {
    setActionLoading(`${action}-${name}`);
    try {
      if (action === "start") await api.startContainer(name);
      else if (action === "stop") await api.stopContainer(name);
      else await api.restartContainer(name);
      // Wait a bit then refresh
      setTimeout(fetchContainers, 2000);
    } catch {
      // error
    } finally {
      setTimeout(() => setActionLoading(null), 2000);
    }
  };

  const running = containers.filter(c => c.state === "running").length;
  const stopped = containers.filter(c => c.state !== "running").length;

  const stateIcon = (state: string) => {
    if (state === "running") return <CheckCircle className="h-4 w-4 text-success" />;
    if (state === "exited" || state === "dead") return <XCircle className="h-4 w-4 text-destructive" />;
    return <AlertTriangle className="h-4 w-4 text-warning" />;
  };

  const stateColor = (state: string) => {
    if (state === "running") return "text-success";
    if (state === "exited" || state === "dead") return "text-destructive";
    return "text-warning";
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Gestión de Contenedores</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Administra los contenedores Docker de NetAdmin — {running} activos, {stopped} detenidos
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Activos", value: running, color: "text-success" },
          { label: "Detenidos", value: stopped, color: "text-destructive" },
          { label: "Total", value: containers.length, color: "text-primary" },
        ].map(s => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="card-glow rounded-lg p-8 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Cargando contenedores...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Stopped containers first for visibility */}
          {[...containers]
            .sort((a, b) => {
              if (a.state === "running" && b.state !== "running") return 1;
              if (a.state !== "running" && b.state === "running") return -1;
              return a.displayName.localeCompare(b.displayName);
            })
            .map((c) => {
              const isRunning = c.state === "running";
              return (
                <div
                  key={c.name}
                  className={`card-glow rounded-lg p-4 border-l-4 transition-all ${
                    isRunning ? "border-l-success" : "border-l-destructive"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-secondary">
                        <Box className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{c.displayName}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {stateIcon(c.state)}
                          <span className={`text-xs font-mono ${stateColor(c.state)}`}>
                            {c.state === "running" ? "Activo" : c.state === "exited" ? "Detenido" : c.state}
                          </span>
                          <span className="text-xs text-muted-foreground">• {c.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{c.image}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isRunning && (
                        <Button
                          size="sm"
                          onClick={() => handleAction("start", c.name)}
                          disabled={actionLoading !== null}
                          className="gap-1.5 bg-success hover:bg-success/80 text-success-foreground"
                        >
                          {actionLoading === `start-${c.name}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          Iniciar
                        </Button>
                      )}
                      {isRunning && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction("restart", c.name)}
                            disabled={actionLoading !== null}
                            className="gap-1.5"
                          >
                            {actionLoading === `restart-${c.name}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Reiniciar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAction("stop", c.name)}
                            disabled={actionLoading !== null}
                            className="gap-1.5"
                          >
                            {actionLoading === `stop-${c.name}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                            Detener
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
