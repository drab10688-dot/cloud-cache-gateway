import { Lock, Users, ArrowUpDown, Globe } from "lucide-react";

const peers = [
  { name: "Servidor Principal", ip: "10.0.0.1", endpoint: "—", lastHandshake: "ahora", transferred: "2.4 GB", status: "online" as const },
  { name: "Laptop Admin", ip: "10.0.0.2", endpoint: "dynamic", lastHandshake: "hace 3m", transferred: "890 MB", status: "online" as const },
  { name: "Móvil Juan", ip: "10.0.0.3", endpoint: "dynamic", lastHandshake: "hace 15m", transferred: "340 MB", status: "online" as const },
  { name: "PC Oficina", ip: "10.0.0.4", endpoint: "—", lastHandshake: "hace 2h", transferred: "1.1 GB", status: "offline" as const },
];

const statusColors = {
  online: "status-dot-online",
  offline: "status-dot-offline",
};

export function WireGuardPanel() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">WireGuard VPN</h2>
        <p className="text-sm text-muted-foreground mt-1">Túnel VPN con Unbound DNS integrado</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Peers totales", value: "4", icon: Users, color: "text-primary" },
          { label: "Conectados", value: "3", icon: Lock, color: "text-success" },
          { label: "Transferido hoy", value: "4.7 GB", icon: ArrowUpDown, color: "text-primary" },
          { label: "Interfaz", value: "wg0", icon: Globe, color: "text-accent-foreground" },
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

      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Peers</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Estado", "Nombre", "IP Túnel", "Último Handshake", "Transferido"].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {peers.map((peer) => (
                <tr key={peer.name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-3 px-3"><div className={statusColors[peer.status]} /></td>
                  <td className="py-3 px-3 text-foreground font-medium">{peer.name}</td>
                  <td className="py-3 px-3 font-mono text-primary text-xs">{peer.ip}</td>
                  <td className="py-3 px-3 text-muted-foreground text-xs">{peer.lastHandshake}</td>
                  <td className="py-3 px-3 font-mono text-xs text-foreground">{peer.transferred}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-glow rounded-lg p-5 mt-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Configuración del Servidor</h3>
        <pre className="text-xs font-mono text-muted-foreground bg-secondary/50 p-4 rounded-md overflow-x-auto">
{`[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = ****************************
DNS = 127.0.0.1  # Unbound local

PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT`}
        </pre>
      </div>
    </div>
  );
}
