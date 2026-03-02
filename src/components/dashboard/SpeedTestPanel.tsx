import { useState, useRef, useCallback } from "react";
import { Download, Upload, Clock, Play, RotateCcw, Wifi } from "lucide-react";

interface SpeedResult {
  download: number;
  upload: number;
  latency: number;
  jitter: number;
}

type TestPhase = "idle" | "latency" | "download" | "upload" | "done";

const API_BASE = "/api";

/* ── Animated Gauge ── */
function SpeedGauge({ value, max, phase, progress }: { value: number; max: number; phase: TestPhase; progress: number }) {
  const radius = 120;
  const stroke = 12;
  const center = 140;
  const startAngle = 135;
  const endAngle = 405;
  const totalAngle = endAngle - startAngle;

  const polarToCartesian = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: center + radius * Math.cos(rad), y: center + radius * Math.sin(rad) };
  };

  const describeArc = (start: number, end: number) => {
    const s = polarToCartesian(start);
    const e = polarToCartesian(end);
    const largeArc = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const isRunning = phase !== "idle" && phase !== "done";
  const ratio = phase === "done" ? Math.min(value / max, 1) : isRunning ? progress / 100 : 0;
  const currentAngle = startAngle + totalAngle * ratio;

  // Color gradient stops based on speed
  const getColor = (r: number) => {
    if (r < 0.25) return "hsl(0, 75%, 55%)";
    if (r < 0.5) return "hsl(38, 90%, 50%)";
    if (r < 0.75) return "hsl(55, 85%, 50%)";
    return "hsl(145, 65%, 45%)";
  };

  // Tick marks
  const ticks = [0, 10, 25, 50, 100, 250, 500, 1000];

  return (
    <div className="relative flex flex-col items-center">
      <svg width="280" height="220" viewBox="0 0 280 240">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(0, 75%, 55%)" />
            <stop offset="33%" stopColor="hsl(38, 90%, 50%)" />
            <stop offset="66%" stopColor="hsl(55, 85%, 50%)" />
            <stop offset="100%" stopColor="hsl(145, 65%, 45%)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={stroke}
          strokeLinecap="round"
        />

        {/* Active arc */}
        {ratio > 0.01 && (
          <path
            d={describeArc(startAngle, currentAngle)}
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            filter="url(#glow)"
            className="transition-all duration-300"
          />
        )}

        {/* Tick marks & labels */}
        {ticks.map((t) => {
          const tickRatio = Math.min(t / max, 1);
          const angle = startAngle + totalAngle * tickRatio;
          const inner = polarToCartesian(angle);
          const outerR = radius + 14;
          const rad = ((angle - 90) * Math.PI) / 180;
          const outer = { x: center + outerR * Math.cos(rad), y: center + outerR * Math.sin(rad) };
          const labelR = radius + 26;
          const label = { x: center + labelR * Math.cos(rad), y: center + labelR * Math.sin(rad) };
          return (
            <g key={t}>
              <line
                x1={inner.x} y1={inner.y}
                x2={outer.x} y2={outer.y}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="1.5"
                opacity="0.4"
              />
              <text
                x={label.x} y={label.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="hsl(var(--muted-foreground))"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Needle */}
        {(isRunning || phase === "done") && (() => {
          const needleAngle = currentAngle;
          const needleLen = radius - 25;
          const rad = ((needleAngle - 90) * Math.PI) / 180;
          const tip = { x: center + needleLen * Math.cos(rad), y: center + needleLen * Math.sin(rad) };
          return (
            <g className="transition-all duration-500">
              <circle cx={center} cy={center} r="6" fill={getColor(ratio)} />
              <line
                x1={center} y1={center}
                x2={tip.x} y2={tip.y}
                stroke={getColor(ratio)}
                strokeWidth="2.5"
                strokeLinecap="round"
                filter="url(#glow)"
              />
            </g>
          );
        })()}
      </svg>

      {/* Center value */}
      <div className="absolute top-[105px] flex flex-col items-center">
        {phase === "done" || isRunning ? (
          <>
            <span className="text-4xl font-bold font-mono text-foreground leading-none">
              {phase === "latency" ? Math.round(value) : value.toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              {phase === "latency" ? "ms" : "Mbps"}
            </span>
            {isRunning && (
              <span className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider animate-pulse">
                {phase === "latency" ? "Latencia" : phase === "download" ? "Descarga" : "Subida"}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Listo</span>
        )}
      </div>
    </div>
  );
}

/* ── Result Card ── */
function ResultCard({ icon: Icon, label, value, unit }: {
  icon: typeof Download;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="card-glow rounded-xl p-5 text-center group hover:scale-[1.02] transition-transform">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <p className="text-3xl font-bold font-mono text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{unit}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider mt-2 text-muted-foreground">{label}</p>
    </div>
  );
}

/* ── Main Panel ── */
export function SpeedTestPanel() {
  const [phase, setPhase] = useState<TestPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [liveValue, setLiveValue] = useState(0);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [history, setHistory] = useState<(SpeedResult & { timestamp: Date })[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const measureLatency = useCallback(async (signal: AbortSignal): Promise<{ latency: number; jitter: number }> => {
    const pings: number[] = [];
    for (let i = 0; i < 10; i++) {
      if (signal.aborted) throw new Error("Aborted");
      const start = performance.now();
      await fetch(`${API_BASE}/speedtest/ping?t=${Date.now()}`, { signal, cache: "no-store" });
      const ping = performance.now() - start;
      pings.push(ping);
      const avg = pings.reduce((a, b) => a + b, 0) / pings.length;
      setLiveValue(Math.round(avg * 10) / 10);
      setProgress(((i + 1) / 10) * 100);
    }
    const avg = pings.reduce((a, b) => a + b, 0) / pings.length;
    const jitter = Math.sqrt(pings.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / pings.length);
    return { latency: Math.round(avg * 10) / 10, jitter: Math.round(jitter * 10) / 10 };
  }, []);

  const measureDownload = useCallback(async (signal: AbortSignal): Promise<number> => {
    const sizes = [1, 2, 4, 8, 16];
    let totalBytes = 0;
    const startTime = performance.now();
    for (let i = 0; i < sizes.length; i++) {
      if (signal.aborted) throw new Error("Aborted");
      const res = await fetch(`${API_BASE}/speedtest/download?size=${sizes[i]}&t=${Date.now()}`, { signal, cache: "no-store" });
      const blob = await res.blob();
      totalBytes += blob.size;
      const elapsed = (performance.now() - startTime) / 1000;
      const currentSpeed = Math.round(((totalBytes * 8) / elapsed / 1_000_000) * 100) / 100;
      setLiveValue(currentSpeed);
      setProgress(((i + 1) / sizes.length) * 100);
    }
    const elapsed = (performance.now() - startTime) / 1000;
    return Math.round(((totalBytes * 8) / elapsed / 1_000_000) * 100) / 100;
  }, []);

  const measureUpload = useCallback(async (signal: AbortSignal): Promise<number> => {
    const sizes = [0.5, 1, 2, 4];
    let totalBytes = 0;
    const startTime = performance.now();
    for (let i = 0; i < sizes.length; i++) {
      if (signal.aborted) throw new Error("Aborted");
      const sizeBytes = sizes[i] * 1024 * 1024;
      const data = new ArrayBuffer(sizeBytes);
      await fetch(`${API_BASE}/speedtest/upload`, { method: "POST", body: data, signal, headers: { "Content-Type": "application/octet-stream" } });
      totalBytes += sizeBytes;
      const elapsed = (performance.now() - startTime) / 1000;
      const currentSpeed = Math.round(((totalBytes * 8) / elapsed / 1_000_000) * 100) / 100;
      setLiveValue(currentSpeed);
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
    setLiveValue(0);
    const partial: SpeedResult = { download: 0, upload: 0, latency: 0, jitter: 0 };
    try {
      setPhase("latency"); setProgress(0); setLiveValue(0);
      const { latency, jitter } = await measureLatency(signal);
      partial.latency = latency; partial.jitter = jitter;

      setPhase("download"); setProgress(0); setLiveValue(0);
      partial.download = await measureDownload(signal);

      setPhase("upload"); setProgress(0); setLiveValue(0);
      partial.upload = await measureUpload(signal);

      setResult(partial);
      setHistory((h) => [{ ...partial, timestamp: new Date() }, ...h].slice(0, 10));
      setPhase("done");
    } catch {
      if (!signal.aborted) setPhase("idle");
    }
  }, [measureLatency, measureDownload, measureUpload]);

  const cancelTest = () => { abortRef.current?.abort(); setPhase("idle"); setProgress(0); setLiveValue(0); };
  const reset = () => { setPhase("idle"); setProgress(0); setResult(null); setLiveValue(0); };

  const isRunning = phase !== "idle" && phase !== "done";

  const getSpeedRating = (mbps: number) => {
    if (mbps >= 100) return { label: "Excelente", color: "text-success" };
    if (mbps >= 50) return { label: "Muy bueno", color: "text-primary" };
    if (mbps >= 20) return { label: "Bueno", color: "text-primary" };
    if (mbps >= 5) return { label: "Aceptable", color: "text-warning" };
    return { label: "Lento", color: "text-destructive" };
  };

  const getLatencyRating = (ms: number) => {
    if (ms < 20) return { label: "Excelente", color: "text-success" };
    if (ms < 50) return { label: "Bueno", color: "text-primary" };
    return { label: "Alto", color: "text-warning" };
  };

  const getJitterRating = (ms: number) => {
    if (ms < 5) return { label: "Estable", color: "text-success" };
    if (ms < 15) return { label: "Normal", color: "text-primary" };
    return { label: "Inestable", color: "text-warning" };
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Speed Test</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Mide la velocidad de tu conexión a Internet
        </p>
      </div>

      {/* Gauge + Button */}
      <div className="card-glow rounded-2xl p-8 mb-6">
        <div className="flex flex-col items-center">
          <SpeedGauge
            value={phase === "done" ? (result?.download ?? 0) : liveValue}
            max={phase === "latency" ? 200 : 1000}
            phase={phase}
            progress={progress}
          />

          {/* Phase indicator pills */}
          {isRunning && (
            <div className="flex gap-2 mt-4 mb-4">
              {(["latency", "download", "upload"] as const).map((p) => (
                <span
                  key={p}
                  className={`text-[10px] uppercase tracking-wider font-semibold px-3 py-1 rounded-full transition-colors ${
                    phase === p
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {p === "latency" ? "Ping" : p === "download" ? "Descarga" : "Subida"}
                </span>
              ))}
            </div>
          )}

          {/* Action button */}
          <div className="mt-4">
            {phase === "idle" && (
              <button
                onClick={runTest}
                className="group relative flex items-center gap-3 px-10 py-4 rounded-full bg-primary text-primary-foreground font-bold text-lg hover:shadow-lg hover:shadow-primary/25 transition-all active:scale-95"
              >
                <Play className="h-6 w-6 transition-transform group-hover:scale-110" />
                GO
              </button>
            )}
            {isRunning && (
              <button
                onClick={cancelTest}
                className="px-8 py-3 rounded-full bg-destructive text-destructive-foreground font-semibold hover:opacity-90 transition-opacity active:scale-95"
              >
                Cancelar
              </button>
            )}
            {phase === "done" && (
              <button
                onClick={reset}
                className="flex items-center gap-2 px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:shadow-lg hover:shadow-primary/25 transition-all active:scale-95"
              >
                <RotateCcw className="h-5 w-5" />
                Repetir
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <ResultCard icon={Download} label="Descarga" value={`${result.download}`} unit="Mbps" />
          <ResultCard icon={Upload} label="Subida" value={`${result.upload}`} unit="Mbps" />
          <ResultCard icon={Clock} label="Latencia" value={`${result.latency}`} unit="ms" />
          <ResultCard icon={Wifi} label="Jitter" value={`${result.jitter}`} unit="ms" />
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="card-glow rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Historial</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs text-muted-foreground font-medium">Hora</th>
                  <th className="text-right py-2 text-xs text-muted-foreground font-medium">↓ Mbps</th>
                  <th className="text-right py-2 text-xs text-muted-foreground font-medium">↑ Mbps</th>
                  <th className="text-right py-2 text-xs text-muted-foreground font-medium">Ping</th>
                  <th className="text-right py-2 text-xs text-muted-foreground font-medium">Jitter</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2 font-mono text-xs text-muted-foreground">{h.timestamp.toLocaleTimeString()}</td>
                    <td className="py-2 text-right font-mono font-bold text-primary">{h.download}</td>
                    <td className="py-2 text-right font-mono font-bold text-primary">{h.upload}</td>
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
