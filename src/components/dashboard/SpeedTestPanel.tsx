import { useState, useRef, useCallback } from "react";
import { Gauge, Download, Upload, Clock, Play, RotateCcw, Wifi } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SpeedResult {
  download: number; // Mbps
  upload: number;   // Mbps
  latency: number;  // ms
  jitter: number;   // ms
}

type TestPhase = "idle" | "latency" | "download" | "upload" | "done";

const SERVER_IP = typeof window !== "undefined" ? window.location.hostname : "localhost";
const API_BASE = "/api";

export function SpeedTestPanel() {
  const [phase, setPhase] = useState<TestPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [history, setHistory] = useState<(SpeedResult & { timestamp: Date })[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const measureLatency = useCallback(async (signal: AbortSignal): Promise<{ latency: number; jitter: number }> => {
    const pings: number[] = [];
    for (let i = 0; i < 10; i++) {
      if (signal.aborted) throw new Error("Aborted");
      const start = performance.now();
      await fetch(`${API_BASE}/speedtest/ping?t=${Date.now()}`, { signal, cache: "no-store" });
      pings.push(performance.now() - start);
      setProgress(((i + 1) / 10) * 100);
    }
    const avg = pings.reduce((a, b) => a + b, 0) / pings.length;
    const jitter = Math.sqrt(pings.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / pings.length);
    return { latency: Math.round(avg * 10) / 10, jitter: Math.round(jitter * 10) / 10 };
  }, []);

  const measureDownload = useCallback(async (signal: AbortSignal): Promise<number> => {
    const sizes = [1, 2, 4, 8, 16]; // MB chunks
    let totalBytes = 0;
    const startTime = performance.now();

    for (let i = 0; i < sizes.length; i++) {
      if (signal.aborted) throw new Error("Aborted");
      const size = sizes[i];
      const res = await fetch(`${API_BASE}/speedtest/download?size=${size}&t=${Date.now()}`, {
        signal,
        cache: "no-store",
      });
      const blob = await res.blob();
      totalBytes += blob.size;
      setProgress(((i + 1) / sizes.length) * 100);
    }

    const elapsed = (performance.now() - startTime) / 1000; // seconds
    return Math.round(((totalBytes * 8) / elapsed / 1_000_000) * 100) / 100; // Mbps
  }, []);

  const measureUpload = useCallback(async (signal: AbortSignal): Promise<number> => {
    const sizes = [0.5, 1, 2, 4]; // MB
    let totalBytes = 0;
    const startTime = performance.now();

    for (let i = 0; i < sizes.length; i++) {
      if (signal.aborted) throw new Error("Aborted");
      const sizeBytes = sizes[i] * 1024 * 1024;
      const data = new ArrayBuffer(sizeBytes);
      await fetch(`${API_BASE}/speedtest/upload`, {
        method: "POST",
        body: data,
        signal,
        headers: { "Content-Type": "application/octet-stream" },
      });
      totalBytes += sizeBytes;
      setProgress(((i + 1) / sizes.length) * 100);
    }

    const elapsed = (performance.now() - startTime) / 1000;
    return Math.round(((totalBytes * 8) / elapsed / 1_000_000) * 100) / 100;
  }, []);

  const runTest = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    setResult(null);
    const partial: SpeedResult = { download: 0, upload: 0, latency: 0, jitter: 0 };

    try {
      // Phase 1: Latency
      setPhase("latency");
      setProgress(0);
      const { latency, jitter } = await measureLatency(signal);
      partial.latency = latency;
      partial.jitter = jitter;

      // Phase 2: Download
      setPhase("download");
      setProgress(0);
      partial.download = await measureDownload(signal);

      // Phase 3: Upload
      setPhase("upload");
      setProgress(0);
      partial.upload = await measureUpload(signal);

      setResult(partial);
      setHistory((h) => [{ ...partial, timestamp: new Date() }, ...h].slice(0, 10));
      setPhase("done");
    } catch {
      if (!signal.aborted) {
        setPhase("idle");
      }
    }
  }, [measureLatency, measureDownload, measureUpload]);

  const cancelTest = () => {
    abortRef.current?.abort();
    setPhase("idle");
    setProgress(0);
  };

  const reset = () => {
    setPhase("idle");
    setProgress(0);
    setResult(null);
  };

  const isRunning = phase !== "idle" && phase !== "done";

  const getSpeedRating = (mbps: number) => {
    if (mbps >= 100) return { label: "Excelente", color: "text-success" };
    if (mbps >= 50) return { label: "Muy bueno", color: "text-primary" };
    if (mbps >= 20) return { label: "Bueno", color: "text-primary" };
    if (mbps >= 5) return { label: "Aceptable", color: "text-warning" };
    return { label: "Lento", color: "text-destructive" };
  };

  const phaseLabels: Record<TestPhase, string> = {
    idle: "Listo para iniciar",
    latency: "Midiendo latencia...",
    download: "Midiendo descarga...",
    upload: "Midiendo subida...",
    done: "Test completado",
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Speed Test</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Mide la velocidad de conexión entre tu dispositivo y el servidor
        </p>
      </div>

      {/* Main gauge area */}
      <div className="card-glow rounded-lg p-8 mb-6">
        <div className="flex flex-col items-center">
          {/* Status */}
          <p className="text-sm font-medium text-muted-foreground mb-6">
            {phaseLabels[phase]}
          </p>

          {/* Gauge display */}
          <div className="relative w-48 h-48 mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-secondary" />
            <div
              className="absolute inset-0 rounded-full border-4 border-primary transition-all duration-500"
              style={{
                clipPath: isRunning
                  ? `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin((progress / 100) * 2 * Math.PI)}% ${50 - 50 * Math.cos((progress / 100) * 2 * Math.PI)}%)`
                  : phase === "done"
                  ? "none"
                  : "polygon(50% 50%, 50% 0%, 50% 0%)",
              }}
            />
            <div className="absolute inset-4 rounded-full bg-card flex flex-col items-center justify-center">
              {phase === "done" && result ? (
                <>
                  <p className="text-3xl font-bold font-mono text-primary">
                    {result.download}
                  </p>
                  <p className="text-xs text-muted-foreground">Mbps ↓</p>
                </>
              ) : isRunning ? (
                <>
                  <Gauge className="h-8 w-8 text-primary animate-pulse" />
                  <p className="text-lg font-bold font-mono text-primary mt-1">
                    {Math.round(progress)}%
                  </p>
                </>
              ) : (
                <Gauge className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Progress bar during test */}
          {isRunning && (
            <div className="w-full max-w-md mb-6">
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {phase === "idle" && (
              <button
                onClick={runTest}
                className="flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                <Play className="h-5 w-5" />
                Iniciar Test
              </button>
            )}
            {isRunning && (
              <button
                onClick={cancelTest}
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-destructive text-destructive-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                Cancelar
              </button>
            )}
            {phase === "done" && (
              <button
                onClick={reset}
                className="flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                <RotateCcw className="h-5 w-5" />
                Repetir Test
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results cards */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              icon: Download,
              label: "Descarga",
              value: `${result.download}`,
              unit: "Mbps",
              rating: getSpeedRating(result.download),
            },
            {
              icon: Upload,
              label: "Subida",
              value: `${result.upload}`,
              unit: "Mbps",
              rating: getSpeedRating(result.upload),
            },
            {
              icon: Clock,
              label: "Latencia",
              value: `${result.latency}`,
              unit: "ms",
              rating: {
                label: result.latency < 20 ? "Excelente" : result.latency < 50 ? "Bueno" : "Alto",
                color: result.latency < 20 ? "text-success" : result.latency < 50 ? "text-primary" : "text-warning",
              },
            },
            {
              icon: Wifi,
              label: "Jitter",
              value: `${result.jitter}`,
              unit: "ms",
              rating: {
                label: result.jitter < 5 ? "Estable" : result.jitter < 15 ? "Normal" : "Inestable",
                color: result.jitter < 5 ? "text-success" : result.jitter < 15 ? "text-primary" : "text-warning",
              },
            },
          ].map((stat) => (
            <div key={stat.label} className="card-glow rounded-lg p-5 text-center">
              <stat.icon className="h-5 w-5 text-primary mx-auto mb-2" />
              <p className={`text-2xl font-bold font-mono ${stat.rating.color}`}>
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.unit}</p>
              <p className={`text-xs font-medium mt-1 ${stat.rating.color}`}>
                {stat.rating.label}
              </p>
            </div>
          ))}
        </div>
      )}


      {/* History */}
      {history.length > 0 && (
        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Historial de tests</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs text-muted-foreground font-medium">Hora</th>
                  <th className="text-right py-2 text-xs text-muted-foreground font-medium">Descarga</th>
                  <th className="text-right py-2 text-xs text-muted-foreground font-medium">Subida</th>
                  <th className="text-right py-2 text-xs text-muted-foreground font-medium">Latencia</th>
                  <th className="text-right py-2 text-xs text-muted-foreground font-medium">Jitter</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 font-mono text-xs text-muted-foreground">
                      {h.timestamp.toLocaleTimeString()}
                    </td>
                    <td className="py-2 text-right font-mono font-bold text-primary">{h.download} Mbps</td>
                    <td className="py-2 text-right font-mono font-bold text-primary">{h.upload} Mbps</td>
                    <td className="py-2 text-right font-mono text-foreground">{h.latency} ms</td>
                    <td className="py-2 text-right font-mono text-foreground">{h.jitter} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
