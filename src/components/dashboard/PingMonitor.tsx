import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { api } from "@/lib/api";

interface PingPoint {
  time: string;
  status: string;
  ping: number;
}

export function PingMonitor() {
  const [data, setData] = useState<PingPoint[]>([]);
  const [stats, setStats] = useState({ current: 0, avg: 0, max: 0, lost: 0 });
  const [downtime, setDowntime] = useState<{ time: string; event: string }[]>([]);

  const fetchPing = useCallback(async () => {
    try {
      const [pingRes, dtRes] = await Promise.all([api.getPing(), api.getDowntime()]);
      setData(pingRes.data);
      setStats(pingRes.stats);
      setDowntime(dtRes);
    } catch {
      // fallback
    }
  }, []);

  useEffect(() => {
    fetchPing();
    const id = setInterval(fetchPing, 5000);
    return () => clearInterval(id);
  }, [fetchPing]);

  const chartData = data.map(d => ({
    time: d.time.split(' ')[1] || d.time,
    ping: d.status === 'FAIL' ? null : d.ping,
  }));

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Monitor de Ping</h2>
        <p className="text-sm text-muted-foreground mt-1">Ping en tiempo real a 8.8.8.8 (Google DNS) — datos del servidor</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Actual", value: `${stats.current}ms`, color: stats.current > 50 ? "text-destructive" : "text-success" },
          { label: "Promedio", value: `${stats.avg}ms`, color: "text-primary" },
          { label: "Máximo", value: `${stats.max}ms`, color: stats.max > 50 ? "text-warning" : "text-primary" },
          { label: "Perdidos", value: `${stats.lost}`, color: stats.lost > 3 ? "text-destructive" : "text-success" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card-glow rounded-lg p-5 mb-4">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 18%)" />
            <XAxis dataKey="time" stroke="hsl(215 15% 50%)" fontSize={10} tickLine={false} interval={Math.floor(chartData.length / 10)} />
            <YAxis stroke="hsl(215 15% 50%)" fontSize={10} tickLine={false} domain={[0, "auto"]} unit="ms" />
            <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 10%)", border: "1px solid hsl(220 15% 18%)", borderRadius: "8px", fontSize: 12, fontFamily: "JetBrains Mono" }} />
            <ReferenceLine y={50} stroke="hsl(38 90% 55%)" strokeDasharray="5 5" label={{ value: "Umbral", fill: "hsl(38 90% 55%)", fontSize: 10 }} />
            <Line type="monotone" dataKey="ping" stroke="hsl(175 80% 45%)" strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4, fill: "hsl(175 80% 45%)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Downtime log */}
      {downtime.length > 0 && (
        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Historial de Caídas</h3>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {downtime.slice().reverse().map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary/30">
                <div className={d.event === "DOWN" ? "status-dot-offline" : "status-dot-online"} />
                <span className="text-xs font-mono text-muted-foreground">{d.time}</span>
                <span className={`text-xs font-mono ${d.event === "DOWN" ? "text-destructive" : "text-success"}`}>
                  {d.event === "DOWN" ? "Internet caído" : "Recuperado"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
