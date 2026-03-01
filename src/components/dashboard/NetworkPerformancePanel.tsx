import { useState, useCallback, useEffect } from "react";
import { Zap, ShieldOff, ShieldCheck, Loader2, Wifi, MonitorSpeaker, TrendingDown, TrendingUp, Info, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface QuicStatus {
  blocked: boolean;
  rules_active: boolean;
}

interface VideoStats {
  total_requests: number;
  cached_requests: number;
  hit_rate: number;
  bandwidth_saved: string;
  top_domains: { domain: string; hits: number; cached: number }[];
}

export function NetworkPerformancePanel() {
  const [quicStatus, setQuicStatus] = useState<QuicStatus>({ blocked: false, rules_active: false });
  const [videoStats, setVideoStats] = useState<VideoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [quic, video] = await Promise.all([
        api.getQuicStatus(),
        api.getVideoStats(),
      ]);
      setQuicStatus(quic);
      setVideoStats(video);
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);

  const toggleQuic = async () => {
    setToggling(true);
    try {
      if (quicStatus.blocked) {
        await api.unblockQuic();
      } else {
        await api.blockQuic();
      }
      setTimeout(fetchData, 2000);
    } catch {
      // error
    } finally {
      setTimeout(() => setToggling(false), 2000);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Rendimiento UDP / QUIC y Video</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Controla el protocolo QUIC para maximizar el caché de video
        </p>
      </div>

      {/* QUIC Explanation + Toggle */}
      <div className={`rounded-lg p-6 mb-6 border-2 transition-all duration-500 ${
        quicStatus.blocked
          ? "border-success/50 bg-success/5"
          : "border-warning/50 bg-warning/5"
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full transition-all duration-500 ${
              quicStatus.blocked ? "bg-success/20" : "bg-warning/20"
            }`}>
              {quicStatus.blocked ? (
                <ShieldCheck className="h-8 w-8 text-success" />
              ) : (
                <ShieldOff className="h-8 w-8 text-warning" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {quicStatus.blocked ? "QUIC Bloqueado ✓ — Caché Optimizado" : "QUIC Activo — Caché Reducido"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {quicStatus.blocked
                  ? "Los navegadores usan HTTP/2 (TCP) → Squid puede interceptar y cachear videos"
                  : "Los navegadores usan QUIC (UDP) → El tráfico bypasea el proxy y no se cachea"}
              </p>
            </div>
          </div>
          <Button
            onClick={toggleQuic}
            disabled={toggling || loading}
            size="lg"
            className={`gap-2 min-w-[200px] text-base font-semibold transition-all duration-300 ${
              quicStatus.blocked
                ? "bg-warning hover:bg-warning/80 text-warning-foreground"
                : "bg-success hover:bg-success/80 text-success-foreground"
            }`}
          >
            {toggling ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Aplicando...</>
            ) : quicStatus.blocked ? (
              <><ShieldOff className="h-5 w-5" /> Desbloquear QUIC</>
            ) : (
              <><ShieldCheck className="h-5 w-5" /> Bloquear QUIC</>
            )}
          </Button>
        </div>
      </div>

      {/* How QUIC blocking works */}
      <div className="card-glow rounded-lg p-5 mb-6">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">¿Por qué bloquear QUIC?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div className="space-y-2">
                <p className="font-semibold text-warning">❌ Con QUIC activo:</p>
                <div className="bg-warning/5 border border-warning/20 rounded-md p-3 space-y-1">
                  <p>• YouTube, Google, Facebook usan HTTP/3 (QUIC)</p>
                  <p>• QUIC usa <strong className="text-foreground">UDP puerto 443</strong></p>
                  <p>• Squid solo intercepta <strong className="text-foreground">TCP</strong></p>
                  <p>• → Videos NO se cachean, cada vez se descargan</p>
                  <p>• → Se consume todo el ancho de banda</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-success">✅ Con QUIC bloqueado:</p>
                <div className="bg-success/5 border border-success/20 rounded-md p-3 space-y-1">
                  <p>• Navegadores caen a HTTP/2 (TCP 443)</p>
                  <p>• Squid SSL Bump intercepta las conexiones</p>
                  <p>• Videos populares se cachean localmente</p>
                  <p>• → Ahorro masivo de ancho de banda</p>
                  <p>• → Videos cargan instantáneamente</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Firewall rules applied */}
      <div className="card-glow rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Reglas de Firewall (iptables)
        </h3>
        <div className="space-y-2">
          {[
            {
              rule: "iptables -A FORWARD -p udp --dport 443 -j DROP",
              desc: "Bloquear QUIC saliente (clientes de la red)",
              active: quicStatus.blocked,
            },
            {
              rule: "iptables -A FORWARD -p udp --dport 80 -j DROP",
              desc: "Bloquear UDP puerto 80 (HTTP/3 alternativo)",
              active: quicStatus.blocked,
            },
            {
              rule: "iptables -A OUTPUT -p udp --dport 443 -j DROP",
              desc: "Bloquear QUIC desde el propio servidor",
              active: quicStatus.blocked,
            },
          ].map((r) => (
            <div key={r.rule} className={`flex items-center justify-between px-3 py-2.5 rounded-md border transition-all ${
              r.active ? "bg-success/5 border-success/30" : "bg-secondary/30 border-border"
            }`}>
              <div className="flex items-center gap-3">
                <div className={r.active ? "status-dot-online" : "status-dot-offline"} />
                <code className="text-xs font-mono text-foreground">{r.rule}</code>
              </div>
              <span className="text-xs text-muted-foreground">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Video cache stats */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Estadísticas de Caché de Video
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Solicitudes Totales",
              value: videoStats?.total_requests?.toLocaleString() || "—",
              icon: Wifi,
              color: "text-primary",
            },
            {
              label: "Desde Caché",
              value: videoStats?.cached_requests?.toLocaleString() || "—",
              icon: TrendingUp,
              color: "text-success",
            },
            {
              label: "Hit Rate",
              value: videoStats?.hit_rate ? `${videoStats.hit_rate}%` : "—",
              icon: MonitorSpeaker,
              color: "text-primary",
            },
            {
              label: "BW Ahorrado",
              value: videoStats?.bandwidth_saved || "—",
              icon: TrendingDown,
              color: "text-success",
            },
          ].map((s) => (
            <div key={s.label} className="card-glow rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top cached video domains */}
      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <MonitorSpeaker className="h-4 w-4 text-primary" />
          Top Dominios de Video Cacheados
        </h3>
        <div className="space-y-2">
          {(videoStats?.top_domains || [
            { domain: "*.googlevideo.com", hits: 0, cached: 0 },
            { domain: "*.youtube.com", hits: 0, cached: 0 },
            { domain: "*.ytimg.com", hits: 0, cached: 0 },
            { domain: "*.nflxvideo.net", hits: 0, cached: 0 },
            { domain: "*.fbcdn.net", hits: 0, cached: 0 },
          ]).map((d, i) => {
            const rate = d.hits > 0 ? Math.round((d.cached / d.hits) * 100) : 0;
            return (
              <div key={d.domain} className="flex items-center justify-between px-3 py-2.5 rounded-md bg-secondary/30">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-mono w-4">{i + 1}</span>
                  <span className="text-xs font-mono text-foreground">{d.domain}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">{d.hits.toLocaleString()} req</span>
                  <span className="text-xs text-success font-mono">{d.cached.toLocaleString()} cached</span>
                  <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success rounded-full transition-all"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-8 text-right">{rate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
