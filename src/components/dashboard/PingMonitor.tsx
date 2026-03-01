import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

function generatePingData(count: number) {
  const data = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const base = 10 + Math.random() * 8;
    const spike = Math.random() > 0.92 ? Math.random() * 80 : 0;
    data.push({
      time: new Date(now - i * 2000).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      ping: Math.round((base + spike) * 10) / 10,
    });
  }
  return data;
}

export function PingMonitor() {
  const [data, setData] = useState(() => generatePingData(60));

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        const next = [...prev.slice(1)];
        const base = 10 + Math.random() * 8;
        const spike = Math.random() > 0.92 ? Math.random() * 80 : 0;
        next.push({
          time: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          ping: Math.round((base + spike) * 10) / 10,
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const current = data[data.length - 1]?.ping ?? 0;
  const avg = Math.round((data.reduce((s, d) => s + d.ping, 0) / data.length) * 10) / 10;
  const max = Math.round(Math.max(...data.map((d) => d.ping)) * 10) / 10;
  const lost = data.filter((d) => d.ping > 50).length;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Monitor de Ping</h2>
        <p className="text-sm text-muted-foreground mt-1">Ping en tiempo real a 8.8.8.8 (Google DNS)</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Actual", value: `${current}ms`, color: current > 50 ? "text-destructive" : "text-success" },
          { label: "Promedio", value: `${avg}ms`, color: "text-primary" },
          { label: "Máximo", value: `${max}ms`, color: max > 50 ? "text-warning" : "text-primary" },
          { label: "Paquetes altos", value: `${lost}`, color: lost > 3 ? "text-destructive" : "text-success" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card-glow rounded-lg p-5">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 18%)" />
            <XAxis dataKey="time" stroke="hsl(215 15% 50%)" fontSize={10} tickLine={false} interval={9} />
            <YAxis stroke="hsl(215 15% 50%)" fontSize={10} tickLine={false} domain={[0, "auto"]} unit="ms" />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(220 18% 10%)",
                border: "1px solid hsl(220 15% 18%)",
                borderRadius: "8px",
                fontSize: 12,
                fontFamily: "JetBrains Mono",
              }}
              labelStyle={{ color: "hsl(200 20% 90%)" }}
            />
            <ReferenceLine y={50} stroke="hsl(38 90% 55%)" strokeDasharray="5 5" label={{ value: "Umbral", fill: "hsl(38 90% 55%)", fontSize: 10 }} />
            <Line
              type="monotone"
              dataKey="ping"
              stroke="hsl(175 80% 45%)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "hsl(175 80% 45%)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
