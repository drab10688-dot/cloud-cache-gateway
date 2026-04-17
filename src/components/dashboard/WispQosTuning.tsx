import { useState, useEffect, useCallback } from "react";
import {
  Gauge, Zap, Shield, Activity, CheckCircle, XCircle, Loader2, Play,
  RotateCcw, AlertTriangle, Cpu, TrendingUp, Info, Rocket, Globe,
  Award, Sparkles, ArrowRight, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { mikrotikDeviceApi, MikroTikApiError } from "@/lib/mikrotik-api";
import {
  buildApplyCommands,
  buildRollbackCommands,
  DETECT_PROBES,
} from "@/lib/wisp-qos-commands";

type ImprovementKey = "mss" | "quic" | "conntrack" | "fqcodel";

interface ImprovementState {
  loading: boolean;
  active: boolean | null; // null = unknown
  lastMessage?: string;
  lastError?: string;
}

interface BufferbloatResult {
  target: string;
  label: string;
  pingIdle?: number;
  pingLoaded?: number;
  jitter?: number;
  loss?: number;
  grade?: "A+" | "A" | "B" | "C" | "D" | "F";
  status: "idle" | "running" | "done" | "error";
  error?: string;
}

const TARGETS = [
  { id: "google", label: "Google DNS", host: "8.8.8.8" },
  { id: "cloudflare", label: "Cloudflare", host: "1.1.1.1" },
  { id: "isp", label: "ISP Local (1er hop)", host: "auto" },
];

const IMPROVEMENT_META: Record<ImprovementKey, { title: string; icon: React.ElementType; color: string; desc: string }> = {
  mss: {
    title: "MSS Clamping PPPoE",
    icon: Shield,
    color: "text-blue-500",
    desc: "Evita fragmentación en clientes PPPoE → menos retransmisiones",
  },
  quic: {
    title: "Bloqueo QUIC (UDP 443)",
    icon: Zap,
    color: "text-orange-500",
    desc: "Fuerza HTTP/3 a TCP → controlable por QoS y caché",
  },
  conntrack: {
    title: "Connection Tracking",
    icon: Activity,
    color: "text-purple-500",
    desc: "Timeouts optimizados → menos RAM/CPU bajo carga",
  },
  fqcodel: {
    title: "FQ_CODEL en WAN",
    icon: Gauge,
    color: "text-success",
    desc: "Anti-bufferbloat liviano (5x más eficiente que CAKE)",
  },
};

function gradeFromLoaded(idle: number, loaded: number): BufferbloatResult["grade"] {
  const delta = loaded - idle;
  if (delta < 5) return "A+";
  if (delta < 30) return "A";
  if (delta < 60) return "B";
  if (delta < 150) return "C";
  if (delta < 300) return "D";
  return "F";
}

function gradeColor(g?: string) {
  switch (g) {
    case "A+": return "bg-success text-success-foreground";
    case "A": return "bg-success/80 text-success-foreground";
    case "B": return "bg-primary text-primary-foreground";
    case "C": return "bg-warning text-warning-foreground";
    case "D": return "bg-orange-500 text-white";
    case "F": return "bg-destructive text-destructive-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

export function WispQosTuning({ connected, serverIp }: { connected: boolean; serverIp: string }) {
  const [improvements, setImprovements] = useState<Record<ImprovementKey, ImprovementState>>({
    mss: { loading: false, active: null },
    quic: { loading: false, active: null },
    conntrack: { loading: false, active: null },
    fqcodel: { loading: false, active: null },
  });

  const [cpuUsage, setCpuUsage] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);

  const [bufferTests, setBufferTests] = useState<BufferbloatResult[]>(
    TARGETS.map(t => ({ target: t.host, label: t.label, status: "idle" }))
  );
  const [testRunning, setTestRunning] = useState(false);

  // ── Detect improvement status via real REST GETs ──
  const detectStatus = useCallback(async () => {
    if (!connected) return;
    const updates: Partial<Record<ImprovementKey, boolean>> = {};
    for (const probe of DETECT_PROBES) {
      try {
        const res = await mikrotikDeviceApi.execute([probe.cmd]);
        const row = Array.isArray(res.results) ? res.results[0] : null;
        // Backend returns either { data: [...] } or the array directly in `data`/`result`
        const rawRows =
          (row && (row.data ?? row.result ?? row.rows ?? row)) ?? [];
        const rows = Array.isArray(rawRows) ? rawRows : [];
        updates[probe.key] = probe.match(rows);
      } catch {
        // keep previous state on network/endpoint failure
      }
    }
    setImprovements(prev => ({
      mss: { ...prev.mss, active: updates.mss ?? prev.mss.active },
      quic: { ...prev.quic, active: updates.quic ?? prev.quic.active },
      conntrack: { ...prev.conntrack, active: updates.conntrack ?? prev.conntrack.active },
      fqcodel: { ...prev.fqcodel, active: updates.fqcodel ?? prev.fqcodel.active },
    }));
  }, [connected]);

  // ── CPU polling ──
  const fetchCpu = useCallback(async () => {
    if (!connected) return;
    try {
      const res = await mikrotikDeviceApi.execute(["wisp:cpu"]);
      if (res.success && res.results?.[0]?.cpu != null) {
        setCpuUsage(res.results[0].cpu);
      }
    } catch {/* silent */}
  }, [connected]);

  useEffect(() => {
    if (!connected) return;
    detectStatus();
    fetchCpu();
  }, [connected, detectStatus, fetchCpu]);

  useEffect(() => {
    if (!polling || !connected) return;
    const id = setInterval(fetchCpu, 3000);
    return () => clearInterval(id);
  }, [polling, connected, fetchCpu]);

  // ── Apply / rollback (via real REST commands) ──
  const extractError = (res: any, fallback: string): string => {
    if (!res) return fallback;
    if (typeof res.error === "string" && res.error.trim()) return res.error;
    if (Array.isArray(res.results)) {
      const failed = res.results.find((r: any) => r && r.success === false);
      if (failed) {
        return failed.error || failed.message || `Backend rechazó "${failed.cmd || "comando"}"`;
      }
    }
    if (typeof res.message === "string" && res.message.trim()) return res.message;
    return `${fallback} — el backend no devolvió detalle.`;
  };

  const runBatch = async (commands: string[]) => {
    // Execute commands one-by-one so a single failure doesn't abort the whole batch,
    // and we can surface the first real error to the user.
    const errors: string[] = [];
    let anyOk = false;
    for (const cmd of commands) {
      try {
        const res = await mikrotikDeviceApi.execute([cmd]);
        if (res.success) {
          anyOk = true;
        } else {
          errors.push(extractError(res, "Error"));
        }
      } catch (e: any) {
        const msg = e instanceof MikroTikApiError ? `${e.message} (HTTP ${e.status})` : (e?.message || "Error de conexión");
        errors.push(msg);
      }
    }
    return { ok: anyOk && errors.length === 0, errors, anyOk };
  };

  const applyImprovement = async (key: ImprovementKey) => {
    setImprovements(prev => ({ ...prev, [key]: { ...prev[key], loading: true, lastError: undefined, lastMessage: undefined } }));
    const { ok, errors } = await runBatch(buildApplyCommands(key, serverIp));
    setImprovements(prev => ({
      ...prev,
      [key]: {
        loading: false,
        active: ok ? true : prev[key].active,
        lastMessage: ok ? `${IMPROVEMENT_META[key].title} aplicado ✓` : undefined,
        lastError: ok ? undefined : (errors[0] || "Error al aplicar"),
      },
    }));
    if (ok) detectStatus();
  };

  const rollbackImprovement = async (key: ImprovementKey) => {
    setImprovements(prev => ({ ...prev, [key]: { ...prev[key], loading: true, lastError: undefined, lastMessage: undefined } }));
    const { ok, errors } = await runBatch(buildRollbackCommands(key));
    setImprovements(prev => ({
      ...prev,
      [key]: {
        loading: false,
        active: ok ? false : prev[key].active,
        lastMessage: ok ? `${IMPROVEMENT_META[key].title} revertido` : undefined,
        lastError: ok ? undefined : (errors[0] || "Error al revertir"),
      },
    }));
    if (ok) detectStatus();
  };

  const applyAll = async () => {
    for (const key of ["mss", "quic", "conntrack", "fqcodel"] as ImprovementKey[]) {
      await applyImprovement(key);
    }
  };

  const rollbackAll = async () => {
    for (const key of ["fqcodel", "quic", "conntrack", "mss"] as ImprovementKey[]) {
      await rollbackImprovement(key);
    }
  };

  // ── Bufferbloat test ──
  const runBufferTest = async () => {
    if (!connected) return;
    setTestRunning(true);
    setPolling(true);
    setBufferTests(TARGETS.map(t => ({ target: t.host, label: t.label, status: "running" as const })));

    for (let i = 0; i < TARGETS.length; i++) {
      const target = TARGETS[i];
      try {
        const res = await mikrotikDeviceApi.execute([`wisp:bufferbloat:${target.host}`]);
        if (res.success && res.results?.[0]) {
          const r = res.results[0];
          const grade = r.pingIdle != null && r.pingLoaded != null
            ? gradeFromLoaded(r.pingIdle, r.pingLoaded)
            : undefined;
          setBufferTests(prev => prev.map((p, idx) => idx === i ? {
            ...p,
            pingIdle: r.pingIdle,
            pingLoaded: r.pingLoaded,
            jitter: r.jitter,
            loss: r.loss,
            grade,
            status: "done",
          } : p));
        } else {
          setBufferTests(prev => prev.map((p, idx) => idx === i ? {
            ...p, status: "error", error: res.error || "Sin respuesta"
          } : p));
        }
      } catch (e: any) {
        const msg = e instanceof MikroTikApiError ? e.message : "Error";
        setBufferTests(prev => prev.map((p, idx) => idx === i ? {
          ...p, status: "error", error: msg
        } : p));
      }
    }
    setTestRunning(false);
    setPolling(false);
  };

  const StatusDot = ({ active }: { active: boolean | null }) => {
    if (active === null) return <span className="inline-block w-2 h-2 rounded-full bg-muted" />;
    return active
      ? <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />
      : <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground" />;
  };

  const activeCount = Object.values(improvements).filter(i => i.active === true).length;

  return (
    <div className="card-glow rounded-lg p-5 mb-6 border-2 border-primary/30">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-md bg-primary/20">
          <Gauge className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            WISP QoS Tuning
            <Badge variant="outline" className="text-xs">Anti-Bufferbloat</Badge>
          </h3>
          <p className="text-xs text-muted-foreground">
            Optimización profesional para WISP — 4 mejoras seguras + Wizard CAKE para hardware potente
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Mejoras activas</div>
          <div className="text-lg font-bold text-foreground">{activeCount}/4</div>
        </div>
      </div>

      <Tabs defaultValue="status" className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="status" className="text-xs gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Estado
          </TabsTrigger>
          <TabsTrigger value="apply" className="text-xs gap-1.5">
            <Rocket className="h-3.5 w-3.5" /> Aplicar
          </TabsTrigger>
          <TabsTrigger value="test" className="text-xs gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Test Bufferbloat
          </TabsTrigger>
          <TabsTrigger value="cake" className="text-xs gap-1.5">
            <Award className="h-3.5 w-3.5" /> Wizard CAKE
          </TabsTrigger>
        </TabsList>

        {/* ───────────── ESTADO ───────────── */}
        <TabsContent value="status" className="mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(Object.keys(IMPROVEMENT_META) as ImprovementKey[]).map(key => {
              const meta = IMPROVEMENT_META[key];
              const state = improvements[key];
              const Icon = meta.icon;
              return (
                <div key={key} className="bg-secondary/30 border border-border rounded-md p-3">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 ${meta.color} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{meta.title}</p>
                        <StatusDot active={state.active} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
                      <div className="mt-1.5">
                        {state.active === true && <Badge className="bg-success/20 text-success border-success/40 text-[10px] h-5">ACTIVO</Badge>}
                        {state.active === false && <Badge variant="outline" className="text-[10px] h-5">INACTIVO</Badge>}
                        {state.active === null && <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">Sin detectar</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CPU monitor */}
          <div className="bg-secondary/30 border border-border rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">CPU MikroTik</span>
                {cpuUsage != null && (
                  <span className={`text-sm font-bold ${cpuUsage > 85 ? "text-destructive" : cpuUsage > 70 ? "text-warning" : "text-success"}`}>
                    {cpuUsage}%
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPolling(p => !p)}
                disabled={!connected}
                className="h-7 text-xs gap-1.5"
              >
                {polling ? <><Loader2 className="h-3 w-3 animate-spin" /> Monitoreando</> : <>Iniciar monitor</>}
              </Button>
            </div>
            {cpuUsage != null && <Progress value={cpuUsage} className="h-2" />}
            {cpuUsage != null && cpuUsage > 85 && (
              <p className="text-xs text-destructive mt-1.5 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" /> CPU alto — considera revertir FQ_CODEL o reducir flows
              </p>
            )}
          </div>

          <Button onClick={detectStatus} disabled={!connected} variant="outline" size="sm" className="gap-2">
            <Activity className="h-3.5 w-3.5" /> Re-detectar estado
          </Button>
        </TabsContent>

        {/* ───────────── APLICAR ───────────── */}
        <TabsContent value="apply" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Button onClick={applyAll} disabled={!connected} className="gap-2 bg-success hover:bg-success/90">
              <Rocket className="h-4 w-4" /> Aplicar las 4 mejoras
            </Button>
            <Button onClick={rollbackAll} disabled={!connected} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" /> Rollback completo
            </Button>
          </div>

          {(Object.keys(IMPROVEMENT_META) as ImprovementKey[]).map(key => {
            const meta = IMPROVEMENT_META[key];
            const state = improvements[key];
            const Icon = meta.icon;
            return (
              <div key={key} className="bg-secondary/30 border border-border rounded-md p-3">
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 ${meta.color} shrink-0 mt-0.5`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{meta.title}</p>
                      <StatusDot active={state.active} />
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{meta.desc}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => applyImprovement(key)}
                        disabled={!connected || state.loading}
                        className="h-7 text-xs gap-1.5"
                      >
                        {state.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        Aplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rollbackImprovement(key)}
                        disabled={!connected || state.loading}
                        className="h-7 text-xs gap-1.5"
                      >
                        <RotateCcw className="h-3 w-3" /> Revertir
                      </Button>
                      {state.lastMessage && (
                        <span className="text-xs text-success flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> {state.lastMessage}
                        </span>
                      )}
                      {state.lastError && (
                        <span className="text-xs text-destructive flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> {state.lastError}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="p-3 rounded-md bg-warning/5 border border-warning/30">
            <p className="text-xs text-warning flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Recomendación:</strong> aplica primero MSS y Conntrack (cero riesgo), luego FQ_CODEL
                (monitorea CPU), y al final QUIC (puede afectar WhatsApp/Zoom — revisa con clientes).
              </span>
            </p>
          </div>
        </TabsContent>

        {/* ───────────── TEST BUFFERBLOAT ───────────── */}
        <TabsContent value="test" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Test de Bufferbloat</p>
              <p className="text-xs text-muted-foreground">
                Mide ping idle vs ping bajo carga (descarga 1GB) contra Google, Cloudflare e ISP local
              </p>
            </div>
            <Button onClick={runBufferTest} disabled={!connected || testRunning} className="gap-2">
              {testRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {testRunning ? "Midiendo..." : "Iniciar test"}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs font-medium text-muted-foreground">Destino</th>
                  <th className="text-right py-2 text-xs font-medium text-muted-foreground">Idle</th>
                  <th className="text-right py-2 text-xs font-medium text-muted-foreground">Bajo carga</th>
                  <th className="text-right py-2 text-xs font-medium text-muted-foreground">Δ</th>
                  <th className="text-right py-2 text-xs font-medium text-muted-foreground">Loss</th>
                  <th className="text-center py-2 text-xs font-medium text-muted-foreground">Grade</th>
                </tr>
              </thead>
              <tbody>
                {bufferTests.map((t, idx) => {
                  const delta = t.pingIdle != null && t.pingLoaded != null
                    ? (t.pingLoaded - t.pingIdle).toFixed(1) : "—";
                  return (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2.5 text-foreground">
                        <div className="flex items-center gap-2">
                          {t.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                          {t.status === "done" && <CheckCircle className="h-3 w-3 text-success" />}
                          {t.status === "error" && <XCircle className="h-3 w-3 text-destructive" />}
                          <span className="font-medium">{t.label}</span>
                          <span className="text-xs text-muted-foreground font-mono">{t.target}</span>
                        </div>
                        {t.error && <p className="text-xs text-destructive mt-0.5">{t.error}</p>}
                      </td>
                      <td className="py-2.5 text-right text-foreground font-mono">
                        {t.pingIdle != null ? `${t.pingIdle.toFixed(1)}ms` : "—"}
                      </td>
                      <td className="py-2.5 text-right text-foreground font-mono">
                        {t.pingLoaded != null ? `${t.pingLoaded.toFixed(1)}ms` : "—"}
                      </td>
                      <td className="py-2.5 text-right text-foreground font-mono">
                        {delta !== "—" ? `+${delta}ms` : "—"}
                      </td>
                      <td className="py-2.5 text-right text-foreground font-mono">
                        {t.loss != null ? `${t.loss}%` : "—"}
                      </td>
                      <td className="py-2.5 text-center">
                        {t.grade && (
                          <Badge className={`${gradeColor(t.grade)} text-xs font-bold`}>{t.grade}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                Cómo se interpreta el grade:
                <strong className="text-success"> A+</strong> Δ&lt;5ms,
                <strong className="text-success"> A</strong> &lt;30ms,
                <strong className="text-primary"> B</strong> &lt;60ms,
                <strong className="text-warning"> C</strong> &lt;150ms,
                <strong className="text-destructive"> F</strong> &gt;300ms.
                Equivale al test de waveform.com pero ejecutado desde el MikroTik.
              </span>
            </p>
          </div>
        </TabsContent>

        {/* ───────────── WIZARD CAKE ───────────── */}
        <TabsContent value="cake" className="mt-4 space-y-3">
          <div className="bg-gradient-to-br from-primary/10 to-success/10 border border-primary/30 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="h-6 w-6 text-primary" />
              <div>
                <h4 className="text-base font-bold text-foreground">CAKE — Anti-Bufferbloat Premium</h4>
                <p className="text-xs text-muted-foreground">
                  Para WISPs con hardware potente. Da grade A+ absoluto pero requiere CPU dedicado.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="bg-card/50 rounded p-2">
                <p className="font-semibold text-foreground">Beneficio</p>
                <p className="text-muted-foreground mt-0.5">Bufferbloat A+ absoluto, fairness perfecto entre clientes</p>
              </div>
              <div className="bg-card/50 rounded p-2">
                <p className="font-semibold text-foreground">Costo CPU</p>
                <p className="text-muted-foreground mt-0.5">~3-5x mayor que FQ_CODEL — necesita hardware acorde</p>
              </div>
              <div className="bg-card/50 rounded p-2">
                <p className="font-semibold text-foreground">Cuándo usar</p>
                <p className="text-muted-foreground mt-0.5">CCR2004+, RB5009, CHR con vCPU dedicado</p>
              </div>
            </div>
          </div>

          {/* Compatibilidad de hardware */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Cpu className="h-4 w-4" /> Hardware recomendado para CAKE
            </h4>
            <div className="space-y-2">
              {[
                { model: "hAP ax² / hEX / RB750", capacity: "Hasta 250 Mbps con CAKE", verdict: "no", note: "Insuficiente — usa solo FQ_CODEL" },
                { model: "RB5009 / CCR1009", capacity: "Hasta 1 Gbps con CAKE", verdict: "ok", note: "OK para WISPs medianos (300-500 clientes)" },
                { model: "CCR2004-1G-12S+2XS", capacity: "3+ Gbps con CAKE", verdict: "best", note: "Recomendado — escalable a 1000+ clientes" },
                { model: "CCR2116-12G-4S+", capacity: "10+ Gbps con CAKE", verdict: "best", note: "Sobrado — para grandes WISPs" },
                { model: "CHR (VPS 4+ vCPU)", capacity: "1-2 Gbps con CAKE", verdict: "ok", note: "Flexible y económico (~$8-15/mes)" },
              ].map(hw => (
                <div key={hw.model} className="bg-secondary/30 border border-border rounded-md p-3 flex items-center gap-3">
                  {hw.verdict === "best" && <Award className="h-5 w-5 text-success shrink-0" />}
                  {hw.verdict === "ok" && <CheckCircle className="h-5 w-5 text-primary shrink-0" />}
                  {hw.verdict === "no" && <XCircle className="h-5 w-5 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{hw.model}</span>
                      <Badge variant="outline" className="text-[10px] h-5">{hw.capacity}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{hw.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Wizard pasos */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Rocket className="h-4 w-4" /> Wizard CAKE — Pasos guiados
            </h4>
            <ol className="space-y-2">
              {[
                {
                  step: 1,
                  title: "Verificar hardware",
                  cmd: `/system resource print`,
                  hint: "Confirma que CPU < 40% en horario pico antes de aplicar CAKE",
                },
                {
                  step: 2,
                  title: "Backup de seguridad",
                  cmd: `/system backup save name=pre-cake\n/export file=pre-cake`,
                  hint: "Descarga ambos archivos vía Winbox antes de continuar",
                },
                {
                  step: 3,
                  title: "Quitar FQ_CODEL anterior",
                  cmd: `/queue interface set [find interface=ether1] queue=only-hardware-queue`,
                  hint: "CAKE reemplaza a FQ_CODEL — no usar ambos",
                },
                {
                  step: 4,
                  title: "Crear queue type CAKE",
                  cmd: `/queue type add name=cake-wan kind=cake cake-bandwidth=950M cake-rtt=internet cake-flowmode=triple-isolate cake-overhead=44 cake-mpu=84 cake-ack-filter=filter`,
                  hint: "Ajusta cake-bandwidth a ~95% de tu velocidad WAN real medida",
                },
                {
                  step: 5,
                  title: "Aplicar a interfaz WAN",
                  cmd: `/queue interface set [find interface=ether1] queue=cake-wan`,
                  hint: "Monitorea CPU inmediatamente con /system resource monitor",
                },
                {
                  step: 6,
                  title: "Validar bufferbloat",
                  cmd: `/tool ping 8.8.8.8 count=60 interval=500ms`,
                  hint: "En paralelo: /tool fetch url=\"http://speedtest.tele2.net/1GB.zip\" mode=http dst-path=test.bin",
                },
                {
                  step: 7,
                  title: "Rollback si CPU > 90%",
                  cmd: `/queue interface set [find interface=ether1] queue=fq-codel-wan\n/queue type remove [find name=cake-wan]`,
                  hint: "Vuelve a FQ_CODEL si CAKE satura el router",
                },
              ].map(s => (
                <li key={s.step} className="bg-secondary/30 border border-border rounded-md p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs shrink-0">
                      {s.step}
                    </div>
                    <p className="text-sm font-medium text-foreground">{s.title}</p>
                  </div>
                  <div className="bg-card border border-border rounded p-2 mb-1.5 relative group">
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all pr-8">{s.cmd}</pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(s.cmd)}
                      className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copiar"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="h-3 w-3 shrink-0 mt-0.5 text-primary" /> {s.hint}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <div className="p-3 rounded-md bg-destructive/5 border border-destructive/30">
            <p className="text-xs text-destructive flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>NO apliques CAKE en hAP ax² u otros routers SOHO con &gt;200 Mbps de tráfico.</strong>
                Saturas la CPU y tumbas a tus clientes. Migra primero a CCR2004 / RB5009 / CHR.
              </span>
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {!connected && (
        <div className="mt-3 p-2 rounded-md bg-warning/5 border border-warning/20">
          <p className="text-xs text-warning flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Conecta tu MikroTik arriba para activar todas las funciones de este panel.
          </p>
        </div>
      )}
    </div>
  );
}
