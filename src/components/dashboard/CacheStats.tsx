import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const hourlyData = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i.toString().padStart(2, "0")}:00`,
  hits: Math.floor(Math.random() * 500 + 100),
  misses: Math.floor(Math.random() * 80 + 10),
}));

const typeData = [
  { name: "YouTube Video", value: 45, color: "hsl(0 70% 50%)" },
  { name: "Imágenes", value: 25, color: "hsl(175 80% 45%)" },
  { name: "CSS/JS", value: 18, color: "hsl(200 80% 50%)" },
  { name: "Otros", value: 12, color: "hsl(38 90% 55%)" },
];

export function CacheStats() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Caché CDN</h2>
        <p className="text-sm text-muted-foreground mt-1">Estadísticas de caché — YouTube, imágenes y contenido estático</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Hit Rate", value: "87%", color: "text-success" },
          { label: "Almacenado", value: "24.3 GB", color: "text-primary" },
          { label: "Videos YouTube", value: "156", color: "text-destructive" },
          { label: "Ancho de banda ahorrado", value: "180 GB", color: "text-warning" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Hits vs Misses por Hora</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 18%)" />
              <XAxis dataKey="hour" stroke="hsl(215 15% 50%)" fontSize={10} tickLine={false} interval={3} />
              <YAxis stroke="hsl(215 15% 50%)" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220 18% 10%)",
                  border: "1px solid hsl(220 15% 18%)",
                  borderRadius: "8px",
                  fontSize: 12,
                  fontFamily: "JetBrains Mono",
                }}
              />
              <Bar dataKey="hits" fill="hsl(175 80% 45%)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="misses" fill="hsl(0 70% 50% / 0.6)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Tipo de Contenido</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={typeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {typeData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220 18% 10%)",
                  border: "1px solid hsl(220 15% 18%)",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {typeData.map((t) => (
              <div key={t.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-muted-foreground">{t.name}</span>
                </div>
                <span className="font-mono text-foreground">{t.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
