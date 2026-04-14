import { useState, useEffect, useCallback } from "react";
import { Router, Copy, CheckCircle, Globe, Info, Zap, AlertTriangle, Shield, Activity, Server, ArrowRight, Play, Loader2, Wifi, Settings, XCircle, Link, Power, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mikrotikDeviceApi, getDevice, type MikroTikDevice, MikroTikApiError } from "@/lib/mikrotik-api";
import { stepLabels } from "@/lib/mikrotik-commands";

interface StepStatus {
  loading: boolean;
  result: 'idle' | 'success' | 'error';
  message: string;
}

export function MikroTikPanel() {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const serverIp = typeof window !== "undefined" ? window.location.hostname : "IP_DEL_SERVIDOR";

  // Connection state
  const [mkHost, setMkHost] = useState('');
  const [mkUser, setMkUser] = useState('admin');
  const [mkPass, setMkPass] = useState('');
  const [mkPort, setMkPort] = useState(443);
  const [mkVersion, setMkVersion] = useState<'v7' | 'v6'>('v7');
  const [device, setDevice] = useState<MikroTikDevice | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  // Step execution
  const [stepStatus, setStepStatus] = useState<Record<number, StepStatus>>({});

  // Bandwidth for Queue Tree auto-calc
  const [totalBandwidth, setTotalBandwidth] = useState(100);
  const dnsBw = Math.max(1, Math.round(totalBandwidth * 0.05));
  const voipBw = Math.max(1, Math.round(totalBandwidth * 0.10));
  const clientBw = Math.max(1, totalBandwidth - dnsBw - voipBw);

  // Load saved device on mount
  useEffect(() => {
    const saved = getDevice();
    if (saved) {
      setDevice(saved);
      setMkHost(saved.host);
      setMkUser(saved.username);
      setMkPort(saved.port);
      setMkVersion(saved.version);
      // Test connection silently
      mikrotikDeviceApi.testConnection()
        .then(result => {
          if (result.success) {
            setDevice(prev => prev ? { ...prev, connected: true, identity: result.identity, routeros_version: result.version } : prev);
          } else {
            setDevice(prev => prev ? { ...prev, connected: false } : prev);
            setConnError('Dispositivo guardado pero no accesible. Reconecta.');
          }
        })
        .catch(() => {
          setDevice(prev => prev ? { ...prev, connected: false } : prev);
        });
    }
  }, []);

  const handleConnect = async () => {
    if (!mkHost) return;
    setConnecting(true);
    setConnError(null);
    try {
      const connected = await mikrotikDeviceApi.connect(mkHost, mkUser, mkPass, mkPort, mkVersion);
      setDevice(connected);
      setMkPass(''); // Clear password from state after connecting
    } catch (e: any) {
      setConnError(e instanceof MikroTikApiError ? e.message : 'Error de conexión con el backend');
      setDevice(null);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    mikrotikDeviceApi.disconnect();
    setDevice(null);
    setStepStatus({});
  };

  const handleReconnect = async () => {
    setConnecting(true);
    setConnError(null);
    try {
      const result = await mikrotikDeviceApi.testConnection();
      if (result.success) {
        setDevice(prev => prev ? { ...prev, connected: true, identity: result.identity, routeros_version: result.version } : prev);
      } else {
        setConnError(result.error || 'No se pudo reconectar');
        setDevice(prev => prev ? { ...prev, connected: false } : prev);
      }
    } catch (e: any) {
      setConnError(e.message || 'Error de conexión');
    } finally {
      setConnecting(false);
    }
  };

  const connected = device?.connected ?? false;

  const executeStep = async (step: number) => {
    setStepStatus(prev => ({ ...prev, [step]: { loading: true, result: 'idle', message: 'Ejecutando...' } }));
    try {
      const result = await mikrotikDeviceApi.execute([`step:${step}:${serverIp}`]);
      if (result.success) {
        setStepStatus(prev => ({ ...prev, [step]: { loading: false, result: 'success', message: result.message || `${stepLabels[step]} aplicado correctamente` } }));
      } else {
        setStepStatus(prev => ({ ...prev, [step]: { loading: false, result: 'error', message: result.error || 'Error al ejecutar' } }));
      }
    } catch (e: any) {
      const msg = e instanceof MikroTikApiError
        ? `${e.message}${e.status === 408 ? ' (timeout — el comando puede necesitar más tiempo)' : ''}`
        : 'Error de conexión con el backend';
      setStepStatus(prev => ({ ...prev, [step]: { loading: false, result: 'error', message: msg } }));
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const ExecuteButton = ({ step }: { step: number }) => {
    const status = stepStatus[step];
    const isLoading = status?.loading;
    const isSuccess = status?.result === 'success';
    const isError = status?.result === 'error';

    return (
      <div className="mt-3">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => executeStep(step)}
            disabled={!connected || isLoading}
            className={`gap-2 ${isSuccess ? 'bg-success hover:bg-success/90' : isError ? 'bg-destructive hover:bg-destructive/90' : ''}`}
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
             isSuccess ? <CheckCircle className="h-3.5 w-3.5" /> :
             isError ? <XCircle className="h-3.5 w-3.5" /> :
             <Play className="h-3.5 w-3.5" />}
            {isLoading ? 'Ejecutando...' : isSuccess ? 'Aplicado ✓' : isError ? 'Reintentar' : `Aplicar: ${stepLabels[step]}`}
          </Button>
          {!connected && (
            <span className="text-xs text-muted-foreground">Conecta tu MikroTik primero ↑</span>
          )}
        </div>
        {status?.message && status.result !== 'idle' && (
          <p className={`text-xs mt-1.5 ${isSuccess ? 'text-success' : 'text-destructive'}`}>
            {status.message}
          </p>
        )}
      </div>
    );
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
          Topología: MikroTik (BNG/PPPoE) ↔ NetAdmin VPS — Ejecución automática via REST API
        </p>
      </div>

      {/* MikroTik Connection — Device style */}
      <div className={`card-glow rounded-lg p-5 mb-6 border-2 ${connected ? 'border-success/40' : 'border-warning/40'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-md ${connected ? 'bg-success/20' : 'bg-warning/20'}`}>
            <Link className={`h-5 w-5 ${connected ? 'text-success' : 'text-warning'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Conexión MikroTik</h3>
            {connected && device ? (
              <p className="text-xs text-success">
                ✓ {device.identity || device.host} — RouterOS {device.routeros_version || device.version} — Puerto {device.port}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Configura la conexión para ejecutar comandos automáticamente</p>
            )}
          </div>
          {connected && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleReconnect} disabled={connecting} className="gap-1.5 h-8 text-xs">
                <RefreshCw className={`h-3.5 w-3.5 ${connecting ? 'animate-spin' : ''}`} />
                Test
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDisconnect} className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive">
                <Power className="h-3.5 w-3.5" />
                Desconectar
              </Button>
            </div>
          )}
        </div>

        {!connected && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">IP / Hostname</label>
                <Input
                  placeholder="192.168.88.1"
                  value={mkHost}
                  onChange={e => setMkHost(e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Usuario</label>
                <Input
                  placeholder="admin"
                  value={mkUser}
                  onChange={e => setMkUser(e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Contraseña</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={mkPass}
                  onChange={e => setMkPass(e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Puerto API</label>
                <Input
                  type="number"
                  placeholder="443"
                  value={mkPort}
                  onChange={e => setMkPort(parseInt(e.target.value) || 443)}
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleConnect} disabled={connecting || !mkHost} className="gap-2 w-full h-9">
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Router className="h-4 w-4" />}
                  {connecting ? 'Conectando...' : 'Conectar'}
                </Button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-4">
              <label className="text-xs text-muted-foreground flex items-center gap-2">
                <input
                  type="radio"
                  checked={mkVersion === 'v7'}
                  onChange={() => setMkVersion('v7')}
                  className="accent-primary"
                />
                RouterOS v7 (REST API)
              </label>
              <label className="text-xs text-muted-foreground flex items-center gap-2">
                <input
                  type="radio"
                  checked={mkVersion === 'v6'}
                  onChange={() => setMkVersion('v6')}
                  className="accent-primary"
                />
                RouterOS v6 (API Legacy)
              </label>
            </div>
          </>
        )}

        {connError && (
          <div className="mt-3 p-2 rounded-md bg-destructive/5 border border-destructive/20">
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              {connError}
            </p>
          </div>
        )}

        <div className="mt-3 p-2 rounded-md bg-primary/5 border border-primary/20">
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>
              La conexión pasa por tu <strong className="text-foreground">VPS backend</strong> → MikroTik.
              Puerto común: <strong className="text-foreground">443</strong> (HTTPS REST), <strong className="text-foreground">8728</strong> (API), <strong className="text-foreground">80</strong> (HTTP).
              El usuario necesita permisos <strong className="text-foreground">full</strong> o policy: write, api, read.
            </span>
          </p>
        </div>
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
        <ExecuteButton step={1} />
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
        <ExecuteButton step={2} />
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
        <ExecuteButton step={3} />
        <div className="mt-3 p-2 rounded-md bg-primary/5 border border-primary/20">
          <div className="flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">¿Por qué?</strong> Al forzar TCP, todo el tráfico de video (YouTube, Netflix, TikTok) pasa por TCP → el kernel del VPS con BBR optimiza el throughput y reduce buffering.
            </p>
          </div>
        </div>
      </div>

      {/* Step 4: Mangle */}
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
        <ExecuteButton step={4} />
      </div>

      {/* Step 5: Queue Tree */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-success">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-success text-success-foreground font-bold text-sm">5</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Queue Tree — Control de ancho de banda</h3>
            <p className="text-xs text-muted-foreground">Ingresa tu velocidad real y se calculan las colas automáticamente</p>
          </div>
        </div>

        {/* Bandwidth input */}
        <div className="mb-4 p-3 rounded-md bg-primary/5 border border-primary/20">
          <label className="text-xs font-semibold text-foreground mb-2 block">Tu ancho de banda total (Mbps)</label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={10000}
              value={totalBandwidth}
              onChange={e => setTotalBandwidth(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-9 w-32 text-sm font-mono"
            />
            <span className="text-xs text-muted-foreground">Mbps</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-secondary/50 rounded px-2 py-1.5 text-center">
              <span className="text-muted-foreground">DNS:</span>{' '}
              <strong className="text-primary">{dnsBw}M</strong>
              <span className="text-muted-foreground ml-1">(5%)</span>
            </div>
            <div className="bg-secondary/50 rounded px-2 py-1.5 text-center">
              <span className="text-muted-foreground">VoIP:</span>{' '}
              <strong className="text-warning">{voipBw}M</strong>
              <span className="text-muted-foreground ml-1">(10%)</span>
            </div>
            <div className="bg-secondary/50 rounded px-2 py-1.5 text-center">
              <span className="text-muted-foreground">Clientes:</span>{' '}
              <strong className="text-success">{clientBw}M</strong>
              <span className="text-muted-foreground ml-1">(resto)</span>
            </div>
          </div>
        </div>

        <CopyBlock
          field="queue-tree"
          code={`# Queue padre (tu ancho de banda total)
/queue tree add name=Total-Download parent=global \\
  max-limit=${totalBandwidth}M comment="NetAdmin: BW total download"

# Cola DNS (máxima prioridad)
/queue tree add name=DNS-Priority parent=Total-Download \\
  packet-mark=dns-priority priority=1 max-limit=${dnsBw}M \\
  comment="NetAdmin: DNS alta prioridad"

# Cola VoIP (alta prioridad)
/queue tree add name=VoIP-Priority parent=Total-Download \\
  packet-mark=voip-priority priority=2 max-limit=${voipBw}M \\
  comment="NetAdmin: VoIP alta prioridad"

# Cola general clientes
/queue tree add name=Client-Traffic parent=Total-Download \\
  packet-mark=client-packets priority=5 max-limit=${clientBw}M \\
  comment="NetAdmin: Tráfico general clientes"`}
        />
        <ExecuteButton step={5} />
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
        <ExecuteButton step={6} />
      </div>

      {/* Step 7: TCP MSS Clamping */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-warning">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-warning text-warning-foreground font-bold text-sm">7</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">TCP MSS Clamping — Evitar fragmentación PPPoE</h3>
            <p className="text-xs text-muted-foreground">Elimina páginas que cargan a medias o se quedan en blanco en conexiones PPPoE</p>
          </div>
        </div>
        <CopyBlock
          field="mss-clamping"
          code={`# Clamp MSS para tráfico PPPoE (evita fragmentación)
/ip firewall mangle add chain=forward protocol=tcp \\
  tcp-flags=syn action=change-mss \\
  new-mss=clamp-to-pmtu passthrough=yes \\
  comment="NetAdmin: MSS Clamp forward"

/ip firewall mangle add chain=postrouting protocol=tcp \\
  tcp-flags=syn action=change-mss \\
  new-mss=clamp-to-pmtu passthrough=yes \\
  comment="NetAdmin: MSS Clamp postrouting"

# Verificar MTU en interfaces PPPoE
/interface pppoe-server server print
# Si el MTU no es 1480, ajustar:
# /interface pppoe-server server set [find] mrru=1480`}
        />
        <ExecuteButton step={7} />
        <div className="mt-3 p-2 rounded-md bg-primary/5 border border-primary/20">
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">clamp-to-pmtu</strong> ajusta automáticamente el MSS según el Path MTU.
              Esto es mejor que fijar un valor manual porque se adapta a cualquier tipo de enlace.
            </span>
          </p>
        </div>
      </div>

      {/* Step 8: Connection Tracking Tuning */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-warning">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-warning text-warning-foreground font-bold text-sm">8</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Connection Tracking — Optimizar tabla de conexiones</h3>
            <p className="text-xs text-muted-foreground">Libera memoria del router reduciendo timeouts de conexiones inactivas</p>
          </div>
        </div>
        <CopyBlock
          field="conntrack-tuning"
          code={`# Reducir timeouts para liberar conntrack más rápido
/ip firewall connection tracking set \\
  udp-timeout=30s \\
  udp-stream-timeout=120s \\
  icmp-timeout=10s \\
  generic-timeout=120s \\
  tcp-close-timeout=10s \\
  tcp-close-wait-timeout=10s \\
  tcp-fin-wait-timeout=10s \\
  tcp-last-ack-timeout=10s \\
  tcp-time-wait-timeout=10s \\
  tcp-syn-sent-timeout=30s \\
  tcp-syn-received-timeout=10s \\
  tcp-established-timeout=7200s

# Verificar estado actual de la tabla
/ip firewall connection tracking print
/ip firewall connection print count-only`}
        />
        <ExecuteButton step={8} />
        <div className="mt-3 p-2 rounded-md bg-success/5 border border-success/20">
          <p className="text-xs text-success flex items-start gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>tcp-established=7200s</strong> (2h) mantiene conexiones activas estables.
              Los demás timeouts reducidos liberan entradas inactivas rápidamente.
            </span>
          </p>
        </div>
      </div>


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
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Beneficio</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-primary">AdGuard DNS</td>
                    <td className="py-2 pr-4">Bloquea ads, trackers, malware</td>
                    <td className="py-2 pr-4 text-success">Páginas cargan más rápido</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-primary">Unbound DNS</td>
                    <td className="py-2 pr-4">Caché DNS recursivo + DNSSEC</td>
                    <td className="py-2 pr-4 text-success">Resolución ~4ms vs ~50ms</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-success">TCP BBR</td>
                    <td className="py-2 pr-4">Algoritmo de congestión optimizado</td>
                    <td className="py-2 pr-4 text-success">+10-30% throughput</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-warning">QUIC Block</td>
                    <td className="py-2 pr-4">Fuerza TCP en streaming</td>
                    <td className="py-2 pr-4 text-success">BBR optimiza video</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-primary">QoS MikroTik</td>
                    <td className="py-2 pr-4">Prioriza VoIP/DNS</td>
                    <td className="py-2 pr-4 text-success">Llamadas sin cortes</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-primary">Simple Queues</td>
                    <td className="py-2 pr-4">Velocidad por plan</td>
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
