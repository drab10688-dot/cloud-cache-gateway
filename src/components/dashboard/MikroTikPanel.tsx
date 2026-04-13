import { useState } from "react";
import { Router, Copy, CheckCircle, Globe, Info, Wifi, Zap, AlertTriangle, Shield, Activity, Server, ArrowRight } from "lucide-react";

export function MikroTikPanel() {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const serverIp = typeof window !== "undefined" ? window.location.hostname : "IP_DEL_SERVIDOR";

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyBlock = ({ code, field, label }: { code: string; field: string; label?: string }) => (
    <div className="relative group">
      {label && <p className="text-xs text-muted-foreground mb-1.5">{label}</p>}
      <div className="bg-secondary/50 border border-border rounded-md p-3 pr-10">
        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">{code}</pre>
        <button
          onClick={() => copyToClipboard(code, field)}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {copiedField === field ? <CheckCircle className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">MikroTik + NetAdmin en Paralelo</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Topología: MikroTik (BNG/PPPoE) ↔ NetAdmin VPS — Optimización de internet para clientes
        </p>
      </div>

      {/* Architecture diagram */}
      <div className="card-glow rounded-lg p-5 mb-6 border-2 border-primary/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-primary/20">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Arquitectura en Paralelo</h3>
            <p className="text-xs text-muted-foreground">MikroTik maneja PPPoE/routing, NetAdmin optimiza DNS y throughput</p>
          </div>
        </div>
        <div className="bg-secondary/30 rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
            <span className="bg-card border border-border rounded-md px-3 py-2 text-primary font-bold">Clientes PPPoE</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="bg-card border border-border rounded-md px-3 py-2 text-warning font-bold">MikroTik (BNG)</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="bg-card border border-border rounded-md px-3 py-2 text-success font-bold">Internet</span>
          </div>
          <div className="flex justify-center mt-2">
            <div className="flex flex-col items-center gap-1">
              <div className="w-px h-4 bg-primary/50" />
              <span className="text-xs text-primary">DNS + TCP BBR</span>
              <div className="w-px h-4 bg-primary/50" />
            </div>
          </div>
          <div className="flex justify-center">
            <span className="bg-primary/20 border border-primary/40 rounded-md px-3 py-2 text-xs font-mono text-primary font-bold">
              NetAdmin VPS ({serverIp})
            </span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-secondary/20 rounded-md p-3 text-center">
            <Shield className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-xs font-semibold text-foreground">AdGuard + Unbound</p>
            <p className="text-xs text-muted-foreground">Filtrado + DNS recursivo</p>
          </div>
          <div className="bg-secondary/20 rounded-md p-3 text-center">
            <Zap className="h-5 w-5 mx-auto mb-1 text-success" />
            <p className="text-xs font-semibold text-foreground">TCP BBR</p>
            <p className="text-xs text-muted-foreground">Más throughput, menos latencia</p>
          </div>
          <div className="bg-secondary/20 rounded-md p-3 text-center">
            <Activity className="h-5 w-5 mx-auto mb-1 text-warning" />
            <p className="text-xs font-semibold text-foreground">QUIC Blocking</p>
            <p className="text-xs text-muted-foreground">Fuerza TCP → BBR optimiza</p>
          </div>
        </div>
      </div>

      {/* Step 1: DNS */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-primary">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">1</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">DNS — Redirigir consultas a NetAdmin</h3>
            <p className="text-xs text-muted-foreground">AdGuard filtra ads/malware → Unbound resuelve con DNSSEC + caché</p>
          </div>
        </div>
        <CopyBlock
          field="dns-mikrotik"
          code={`/ip dns set servers=${serverIp}
/ip dns set allow-remote-requests=yes

# Forzar que TODOS los clientes usen tu DNS (evitar bypass)
/ip firewall nat add chain=dstnat protocol=tcp dst-port=53 \\
  action=dst-nat to-addresses=${serverIp} to-ports=53 \\
  comment="NetAdmin: Forzar DNS TCP"
/ip firewall nat add chain=dstnat protocol=udp dst-port=53 \\
  action=dst-nat to-addresses=${serverIp} to-ports=53 \\
  comment="NetAdmin: Forzar DNS UDP"`}
        />
        <div className="mt-3 p-2 rounded-md bg-success/5 border border-success/20">
          <p className="text-xs text-success flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            Resultado: Bloqueo de ads, DNSSEC, caché DNS ~4ms, listas MinTIC/Coljuegos
          </p>
        </div>
      </div>

      {/* Step 2: DHCP */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-primary">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">2</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">DHCP — Entregar DNS de NetAdmin a los clientes</h3>
            <p className="text-xs text-muted-foreground">Los dispositivos reciben tu DNS automáticamente al conectarse</p>
          </div>
        </div>
        <CopyBlock
          field="dhcp-mikrotik"
          code={`# Para DHCP Server (clientes por DHCP)
/ip dhcp-server network set [find] dns-server=${serverIp}

# Para PPPoE (clientes PPPoE)
/ppp profile set [find] dns-server=${serverIp}
# O si tienes un perfil específico:
/ppp profile set default dns-server=${serverIp}`}
        />
      </div>

      {/* Step 3: Block QUIC */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-warning">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-warning text-warning-foreground font-bold text-sm">3</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Bloquear QUIC — Forzar TCP para que BBR optimice</h3>
            <p className="text-xs text-muted-foreground">Chrome/YouTube usan QUIC (UDP) que no se beneficia de BBR. Forzamos TCP.</p>
          </div>
        </div>
        <CopyBlock
          field="quic-block"
          code={`# Bloquear QUIC (UDP 443) — fuerza HTTP/2 sobre TCP
/ip firewall filter add chain=forward protocol=udp dst-port=443 \\
  action=drop comment="NetAdmin: Bloquear QUIC → forzar TCP BBR"
/ip firewall filter add chain=forward protocol=udp dst-port=80 \\
  action=drop comment="NetAdmin: Bloquear HTTP/3 alt"`}
        />
        <div className="mt-3 p-2 rounded-md bg-primary/5 border border-primary/20">
          <div className="flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">¿Por qué?</strong> Al forzar TCP, todo el tráfico de video (YouTube, Netflix, TikTok) pasa por TCP → el kernel del VPS con BBR optimiza el throughput y reduce buffering.
            </p>
          </div>
        </div>
      </div>

      {/* Step 4: Mangle - Mark traffic */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-success">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-success text-success-foreground font-bold text-sm">4</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Mangle — Marcar tráfico por tipo (QoS básico)</h3>
            <p className="text-xs text-muted-foreground">Clasifica tráfico para priorizar VoIP/gaming sobre descargas</p>
          </div>
        </div>
        <CopyBlock
          field="mangle-rules"
          code={`# Marcar conexiones de clientes PPPoE
/ip firewall mangle add chain=forward \\
  connection-mark=no-mark \\
  action=mark-connection new-connection-mark=client-traffic \\
  passthrough=yes comment="NetAdmin: Marcar tráfico clientes"

# Marcar paquetes para Queue Tree
/ip firewall mangle add chain=forward \\
  connection-mark=client-traffic \\
  action=mark-packet new-packet-mark=client-packets \\
  passthrough=no comment="NetAdmin: Paquetes clientes"

# Marcar tráfico DNS (alta prioridad)
/ip firewall mangle add chain=forward protocol=udp dst-port=53 \\
  action=mark-packet new-packet-mark=dns-priority \\
  passthrough=no comment="NetAdmin: DNS prioridad alta"

# Marcar tráfico VoIP/SIP (alta prioridad)
/ip firewall mangle add chain=forward protocol=udp dst-port=5060-5061 \\
  action=mark-packet new-packet-mark=voip-priority \\
  passthrough=no comment="NetAdmin: VoIP prioridad alta"`}
        />
      </div>

      {/* Step 5: Queue Tree */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-success">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-success text-success-foreground font-bold text-sm">5</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Queue Tree — Control de ancho de banda</h3>
            <p className="text-xs text-muted-foreground">Ejemplo: Link de 100Mbps con prioridades</p>
          </div>
        </div>
        <CopyBlock
          field="queue-tree"
          code={`# Queue padre (tu ancho de banda total)
/queue tree add name=Total-Download parent=global \\
  max-limit=100M comment="NetAdmin: BW total download"

# Cola DNS (máxima prioridad)
/queue tree add name=DNS-Priority parent=Total-Download \\
  packet-mark=dns-priority priority=1 max-limit=5M \\
  comment="NetAdmin: DNS alta prioridad"

# Cola VoIP (alta prioridad)
/queue tree add name=VoIP-Priority parent=Total-Download \\
  packet-mark=voip-priority priority=2 max-limit=10M \\
  comment="NetAdmin: VoIP alta prioridad"

# Cola general clientes
/queue tree add name=Client-Traffic parent=Total-Download \\
  packet-mark=client-packets priority=5 max-limit=90M \\
  comment="NetAdmin: Tráfico general clientes"`}
        />
        <div className="mt-3 p-2 rounded-md bg-warning/5 border border-warning/20">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning">
              Ajusta <strong>max-limit</strong> según tu ancho de banda real. El ejemplo usa 100M.
            </p>
          </div>
        </div>
      </div>

      {/* Step 6: Per-client simple queues */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-primary">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">6</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Simple Queues — Limitar velocidad por cliente</h3>
            <p className="text-xs text-muted-foreground">Asigna un plan de velocidad a cada suscriptor PPPoE</p>
          </div>
        </div>
        <CopyBlock
          field="simple-queues"
          code={`# Plan 10Mbps para un cliente
/queue simple add name="Cliente-Juan" \\
  target=10.0.0.2/32 \\
  max-limit=10M/10M \\
  burst-limit=12M/12M burst-threshold=8M/8M burst-time=10s/10s \\
  comment="Plan 10Mbps - Juan Pérez"

# Plan 20Mbps
/queue simple add name="Cliente-Maria" \\
  target=10.0.0.3/32 \\
  max-limit=20M/20M \\
  burst-limit=25M/25M burst-threshold=16M/16M burst-time=10s/10s \\
  comment="Plan 20Mbps - María López"

# Para PPPoE dinámico (por perfil):
/ppp profile add name=plan-10mbps \\
  rate-limit=10M/10M \\
  dns-server=${serverIp} \\
  comment="NetAdmin: Plan 10Mbps"`}
        />
      </div>

      {/* How it works together */}
      <div className="card-glow rounded-lg p-5 mb-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">¿Cómo mejora el internet de tus clientes?</h3>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Componente</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Qué hace</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Beneficio para el cliente</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-primary">AdGuard DNS</td>
                    <td className="py-2 pr-4">Bloquea ads, trackers, malware</td>
                    <td className="py-2 pr-4 text-success">Páginas cargan más rápido, menos datos</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-primary">Unbound DNS</td>
                    <td className="py-2 pr-4">Caché DNS recursivo + DNSSEC</td>
                    <td className="py-2 pr-4 text-success">Resolución DNS ~4ms vs ~50ms</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-success">TCP BBR (VPS)</td>
                    <td className="py-2 pr-4">Algoritmo de congestión optimizado</td>
                    <td className="py-2 pr-4 text-success">+10-30% throughput, menos buffering</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-warning">QUIC Block</td>
                    <td className="py-2 pr-4">Fuerza TCP en video streaming</td>
                    <td className="py-2 pr-4 text-success">BBR optimiza YouTube/Netflix</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-primary">QoS MikroTik</td>
                    <td className="py-2 pr-4">Prioriza VoIP/DNS sobre descargas</td>
                    <td className="py-2 pr-4 text-success">Llamadas sin cortes, gaming sin lag</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-primary">Simple Queues</td>
                    <td className="py-2 pr-4">Limita velocidad por plan</td>
                    <td className="py-2 pr-4 text-success">Cada cliente recibe lo que paga</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Verification commands */}
      <div className="card-glow rounded-lg p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-primary/20">
            <Router className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Verificar la configuración</h3>
            <p className="text-xs text-muted-foreground">Ejecuta estos comandos en tu MikroTik para confirmar</p>
          </div>
        </div>
        <div className="space-y-3">
          <CopyBlock field="verify-dns" label="Verificar DNS:" code={`/ip dns print
/ip dns cache print count-only`} />
          <CopyBlock field="verify-firewall" label="Verificar reglas firewall:" code={`/ip firewall nat print where comment~"NetAdmin"
/ip firewall filter print where comment~"NetAdmin"
/ip firewall mangle print where comment~"NetAdmin"`} />
          <CopyBlock field="verify-queues" label="Verificar colas:" code={`/queue tree print
/queue simple print`} />
          <CopyBlock field="verify-pppoe" label="Verificar perfiles PPPoE:" code={`/ppp profile print
/ppp active print`} />
        </div>
      </div>
    </div>
  );
}
