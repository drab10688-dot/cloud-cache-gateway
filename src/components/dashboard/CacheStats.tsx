import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { MonitorSpeaker, Package, Gamepad2, Database } from "lucide-react";

const hourlyData = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i.toString().padStart(2, "0")}:00`,
  squid: Math.floor(Math.random() * 300 + 50),
  lancache: Math.floor(Math.random() * 200 + 20),
  nginx: Math.floor(Math.random() * 150 + 30),
  apt: Math.floor(Math.random() * 40 + 5),
}));

const typeData = [
  { name: "YouTube (Squid)", value: 35, color: "hsl(0 70% 50%)" },
  { name: "Windows Update", value: 22, color: "hsl(200 80% 50%)" },
  { name: "Steam / Epic", value: 18, color: "hsl(145 70% 45%)" },
  { name: "Repos Linux", value: 10, color: "hsl(38 90% 55%)" },
  { name: "CDN General", value: 15, color: "hsl(175 80% 45%)" },
];

const cacheServices = [
  { name: "Squid (YouTube + HTTPS)", icon: MonitorSpeaker, size: "38.2 GB", objects: "1,243", hitRate: "72%" },
  { name: "Lancache (Windows/Steam)", icon: Gamepad2, size: "45.8 GB", objects: "892", hitRate: "94%" },
  { name: "apt-cacher-ng (Linux)", icon: Package, size: "12.1 GB", objects: "3,421", hitRate: "98%" },
  { name: "Nginx CDN (General)", icon: Database, size: "24.3 GB", objects: "8,102", hitRate: "87%" },
];

export function CacheStats() {
  const totalSize = "120.4 GB";
  const totalSaved = "340 GB";

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Caché CDN — Todos los Servicios</h2>
        <p className="text-sm text-muted-foreground mt-1">Squid (YouTube), Lancache (Windows/Steam), apt-cacher-ng, Nginx</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total en caché", value: totalSize, color: "text-primary" },
          { label: "Ancho de banda ahorrado", value: totalSaved, color: "text-success" },
          { label: "Videos YouTube", value: "156", color: "text-destructive" },
          { label: "Updates Windows", value: "892", color: "text-warning" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Per-service stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {cacheServices.map((svc) => (
          <div key={svc.name} className="card-glow rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-md bg-secondary">
                <svc.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{svc.name}</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-sm font-bold font-mono text-primary">{svc.size}</p>
                <p className="text-xs text-muted-foreground">Tamaño</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold font-mono text-foreground">{svc.objects}</p>
                <p className="text-xs text-muted-foreground">Objetos</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold font-mono text-success">{svc.hitRate}</p>
                <p className="text-xs text-muted-foreground">Hit Rate</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Hits por Servicio (24h)</h3>
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
              <Bar dataKey="squid" name="Squid" fill="hsl(0 70% 50%)" radius={[2, 2, 0, 0]} stackId="a" />
              <Bar dataKey="lancache" name="Lancache" fill="hsl(145 70% 45%)" radius={[2, 2, 0, 0]} stackId="a" />
              <Bar dataKey="nginx" name="Nginx" fill="hsl(175 80% 45%)" radius={[2, 2, 0, 0]} stackId="a" />
              <Bar dataKey="apt" name="apt-cache" fill="hsl(38 90% 55%)" radius={[2, 2, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Distribución por Tipo</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={typeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {typeData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 10%)", border: "1px solid hsl(220 15% 18%)", borderRadius: "8px", fontSize: 12 }} />
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
