import { useState, useEffect, useCallback } from "react";
import {
  Router, Loader2, CheckCircle, XCircle, ArrowRight, Play,
  Network, Shuffle, Link2, GitBranch, Plus, Trash2, AlertTriangle, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mikrotikDeviceApi, getDevice, type MikroTikDevice } from "@/lib/mikrotik-api";

type BalanceMethod = "pcc" | "nth" | "bonding" | "routing";
type ClientType = "pppoe" | "dhcp";

interface MkInterface {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  comment?: string;
}

const methodInfo: Record<BalanceMethod, { label: string; icon: React.ElementType; description: string; color: string }> = {
  pcc: {
    label: "PCC (Per Connection Classifier)",
    icon: Shuffle,
    description: "Distribuye conexiones basándose en hash de origen/destino. Cada conexión se mantiene en la misma WAN. Ideal para múltiples WANs con diferente velocidad.",
    color: "text-primary",
  },
  nth: {
    label: "NTH (Round Robin)",
    icon: GitBranch,
    description: "Distribuye paquetes de forma secuencial entre las WANs (1→WAN1, 2→WAN2, 3→WAN3...). Simple pero efectivo con WANs de igual velocidad.",
    color: "text-success",
  },
  bonding: {
    label: "Bonding",
    icon: Link2,
    description: "Combina múltiples interfaces en una sola interfaz lógica. Requiere que todas las WANs sean del mismo tipo y velocidad. Máximo throughput agregado.",
    color: "text-warning",
  },
  routing: {
    label: "Balanceo por Ruteo (División de clientes)",
    icon: Network,
    description: "Asigna grupos de clientes PPPoE/DHCP a diferentes WANs. Ej: 300 clientes → 100 por cada WAN. Cada grupo sale por una WAN específica.",
    color: "text-chart-2",
  },
};

function generatePCCScript(wans: string[], bridge: string, lans: string[]): string {
  const lines: string[] = [
    `# === NetAdmin: Balanceo PCC con ${wans.length} WANs ===`,
    `# Bridge LAN: ${bridge} (${lans.join(", ")})`,
    "",
    "# 1. Crear bridge LAN",
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN balanceo"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l} comment="NetAdmin: LAN port"`),
    "",
    "# 2. Mangle: Marcar conexiones por PCC",
  ];

  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting in-interface=${bridge} dst-address-type=!local \\`,
      `  per-connection-classifier=both-addresses-and-ports:${wans.length}/${i} \\`,
      `  action=mark-connection new-connection-mark=WAN${i + 1}_conn passthrough=yes \\`,
      `  comment="NetAdmin PCC: Conexiones → ${wan}"`
    );
  });

  lines.push("");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting connection-mark=WAN${i + 1}_conn \\`,
      `  action=mark-routing new-routing-mark=to_WAN${i + 1} passthrough=yes \\`,
      `  comment="NetAdmin PCC: Ruteo → ${wan}"`
    );
  });

  lines.push("", "# 3. NAT por cada WAN");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade \\`,
      `  comment="NetAdmin PCC: NAT ${wan}"`
    );
  });

  lines.push("", "# 4. Rutas por marca de ruteo");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip route add dst-address=0.0.0.0/0 gateway=${wan} routing-mark=to_WAN${i + 1} \\`,
      `  check-gateway=ping comment="NetAdmin PCC: Ruta ${wan}"`
    );
  });

  return lines.join("\n");
}

function generateNTHScript(wans: string[], bridge: string, lans: string[]): string {
  const lines: string[] = [
    `# === NetAdmin: Balanceo NTH con ${wans.length} WANs ===`,
    "",
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN balanceo"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l}`),
    "",
    "# Mangle NTH",
  ];

  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting in-interface=${bridge} dst-address-type=!local \\`,
      `  connection-state=new nth=${wans.length},${i + 1} \\`,
      `  action=mark-connection new-connection-mark=WAN${i + 1}_conn passthrough=yes \\`,
      `  comment="NetAdmin NTH: ${wan}"`
    );
  });

  lines.push("");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall mangle add chain=prerouting connection-mark=WAN${i + 1}_conn \\`,
      `  action=mark-routing new-routing-mark=to_WAN${i + 1} passthrough=yes`
    );
  });

  lines.push("", "# NAT y Rutas");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade`,
      `/ip route add dst-address=0.0.0.0/0 gateway=${wan} routing-mark=to_WAN${i + 1} check-gateway=ping`
    );
  });

  return lines.join("\n");
}

function generateBondingScript(wans: string[], bridge: string, lans: string[]): string {
  const lines: string[] = [
    `# === NetAdmin: Bonding con ${wans.length} interfaces ===`,
    "",
    `/interface bonding add name=bond-wan mode=balance-rr slaves=${wans.join(",")} \\`,
    `  comment="NetAdmin: Bonding WAN"`,
    "",
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l}`),
    "",
    `/ip firewall nat add chain=srcnat out-interface=bond-wan action=masquerade \\`,
    `  comment="NetAdmin: NAT Bonding"`,
    `/ip route add dst-address=0.0.0.0/0 gateway=bond-wan check-gateway=ping \\`,
    `  comment="NetAdmin: Ruta Bonding"`,
  ];
  return lines.join("\n");
}

function generateRoutingScript(
  wans: string[],
  bridge: string,
  lans: string[],
  clientType: ClientType,
  totalClients: number
): string {
  const perWan = Math.floor(totalClients / wans.length);
  const remainder = totalClients % wans.length;

  const lines: string[] = [
    `# === NetAdmin: Balanceo por Ruteo — ${totalClients} clientes ${clientType.toUpperCase()} ÷ ${wans.length} WANs ===`,
    `# Distribución: ${wans.map((w, i) => `${w} → ${perWan + (i < remainder ? 1 : 0)} clientes`).join(", ")}`,
    "",
    `/interface bridge add name=${bridge} comment="NetAdmin: Bridge LAN"`,
    ...lans.map(l => `/interface bridge port add bridge=${bridge} interface=${l}`),
    "",
  ];

  if (clientType === "pppoe") {
    lines.push("# Crear perfiles PPPoE por WAN");
    wans.forEach((wan, i) => {
      const count = perWan + (i < remainder ? 1 : 0);
      lines.push(
        `/ppp profile add name=plan-${wan} local-address=10.${i + 1}.0.1 \\`,
        `  remote-address=pool-${wan} dns-server=8.8.8.8 \\`,
        `  comment="NetAdmin Routing: ${count} clientes → ${wan}"`,
        `/ip pool add name=pool-${wan} ranges=10.${i + 1}.0.2-10.${i + 1}.${Math.min(255, Math.ceil(count / 254))}.${Math.min(254, count)} \\`,
        `  comment="NetAdmin: Pool ${wan}"`,
      );
    });

    lines.push("", "# Marcar tráfico de cada pool y rutear por WAN");
    wans.forEach((wan, i) => {
      lines.push(
        `/ip firewall mangle add chain=prerouting src-address=10.${i + 1}.0.0/16 \\`,
        `  action=mark-routing new-routing-mark=to_${wan} passthrough=yes \\`,
        `  comment="NetAdmin Routing: Pool ${wan}"`,
      );
    });
  } else {
    lines.push("# Crear pools DHCP por WAN");
    wans.forEach((wan, i) => {
      const count = perWan + (i < remainder ? 1 : 0);
      lines.push(
        `/ip pool add name=pool-${wan} ranges=192.168.${10 + i}.2-192.168.${10 + i}.${Math.min(254, count + 1)} \\`,
        `  comment="NetAdmin: Pool DHCP ${wan} (${count} clientes)"`,
        `/ip address add address=192.168.${10 + i}.1/24 interface=${bridge} \\`,
        `  comment="NetAdmin: Gateway pool ${wan}"`,
      );
    });

    lines.push("", "# Mangle por subred → WAN");
    wans.forEach((wan, i) => {
      lines.push(
        `/ip firewall mangle add chain=prerouting src-address=192.168.${10 + i}.0/24 \\`,
        `  action=mark-routing new-routing-mark=to_${wan} passthrough=yes \\`,
        `  comment="NetAdmin Routing: Subnet → ${wan}"`,
      );
    });
  }

  lines.push("", "# NAT y Rutas por WAN");
  wans.forEach((wan, i) => {
    lines.push(
      `/ip firewall nat add chain=srcnat out-interface=${wan} action=masquerade`,
      `/ip route add dst-address=0.0.0.0/0 gateway=${wan} routing-mark=to_${wan} check-gateway=ping`,
    );
  });

  return lines.join("\n");
}

export function LoadBalancingPanel() {
  const [device, setDevice] = useState<MikroTikDevice | null>(null);
  const [interfaces, setInterfaces] = useState<MkInterface[]>([]);
  const [loadingIfaces, setLoadingIfaces] = useState(false);
  const [ifaceError, setIfaceError] = useState<string | null>(null);

  // Config
  const [method, setMethod] = useState<BalanceMethod>("pcc");
  const [selectedWans, setSelectedWans] = useState<string[]>([]);
  const [selectedLans, setSelectedLans] = useState<string[]>([]);
  const [bridgeName, setBridgeName] = useState("bridge-lan");
  const [clientType, setClientType] = useState<ClientType>("pppoe");
  const [totalClients, setTotalClients] = useState(300);

  // Script & execution
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = getDevice();
    if (saved) {
      setDevice(saved);
      fetchInterfaces();
    }
  }, []);

  const fetchInterfaces = useCallback(async () => {
    setLoadingIfaces(true);
    setIfaceError(null);
    try {
      const result = await mikrotikDeviceApi.execute(["/interface/print"]);
      if (result.results && Array.isArray(result.results)) {
        const ifaces: MkInterface[] = result.results.map((r: any) => ({
          name: r.name || r[".id"] || "unknown",
          type: r.type || "ethernet",
          running: r.running === "true" || r.running === true,
          disabled: r.disabled === "true" || r.disabled === true,
          comment: r.comment,
        }));
        setInterfaces(ifaces);
      }
    } catch (e: any) {
      setIfaceError(e.message || "No se pudieron obtener las interfaces");
    } finally {
      setLoadingIfaces(false);
    }
  }, []);

  const toggleWan = (name: string) => {
    setSelectedWans(prev =>
      prev.includes(name) ? prev.filter(w => w !== name) : [...prev, name]
    );
    setGeneratedScript(null);
    setExecResult(null);
  };

  const toggleLan = (name: string) => {
    setSelectedLans(prev =>
      prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]
    );
    setGeneratedScript(null);
    setExecResult(null);
  };

  const generateScript = () => {
    if (selectedWans.length < 2) return;
    if (selectedLans.length < 1) return;

    let script = "";
    switch (method) {
      case "pcc":
        script = generatePCCScript(selectedWans, bridgeName, selectedLans);
        break;
      case "nth":
        script = generateNTHScript(selectedWans, bridgeName, selectedLans);
        break;
      case "bonding":
        script = generateBondingScript(selectedWans, bridgeName, selectedLans);
        break;
      case "routing":
        script = generateRoutingScript(selectedWans, bridgeName, selectedLans, clientType, totalClients);
        break;
    }
    setGeneratedScript(script);
    setExecResult(null);
  };

  const executeScript = async () => {
    if (!generatedScript) return;
    setExecuting(true);
    setExecResult(null);
    try {
      const commands = generatedScript
        .split("\n")
        .filter(l => l.trim() && !l.startsWith("#"))
        .map(l => l.replace(/\\\s*$/, "").trim())
        // Join continuation lines
        .reduce<string[]>((acc, line) => {
          if (acc.length > 0 && !line.startsWith("/")) {
            acc[acc.length - 1] += " " + line;
          } else {
            acc.push(line);
          }
          return acc;
        }, []);

      const result = await mikrotikDeviceApi.execute(commands);
      setExecResult({ success: result.success, message: result.message || "Script aplicado correctamente" });
    } catch (e: any) {
      setExecResult({ success: false, message: e.message || "Error al ejecutar" });
    } finally {
      setExecuting(false);
    }
  };

  const handleCopy = () => {
    if (generatedScript) {
      navigator.clipboard.writeText(generatedScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const ethernetIfaces = interfaces.filter(i =>
    (i.type === "ethernet" || i.type === "ether") && !i.disabled
  );

  const notConnected = !device || !device.connected;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Network className="h-6 w-6 text-primary" />
          Balanceo de Carga
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configura PCC, NTH, Bonding o Balanceo por Ruteo directamente en el MikroTik
        </p>
      </div>

      {/* Connection status */}
      {notConnected ? (
        <div className="card-glow rounded-lg p-6 text-center">
          <Router className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-2">
            Primero conecta un MikroTik desde el panel <strong>MikroTik</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            El balanceo necesita leer las interfaces del equipo para configurarse automáticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Device info bar */}
          <div className="card-glow rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {device.identity || device.host}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {device.host}:{device.port} • RouterOS {device.routeros_version || device.version}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchInterfaces} disabled={loadingIfaces} className="gap-1.5">
              {loadingIfaces ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Router className="h-3.5 w-3.5" />}
              Recargar Interfaces
            </Button>
          </div>

          {ifaceError && (
            <div className="card-glow rounded-lg p-4 border-l-4 border-l-destructive">
              <p className="text-sm text-destructive">{ifaceError}</p>
            </div>
          )}

          {/* Step 1: Select method */}
          <div className="card-glow rounded-lg p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
              Método de Balanceo
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.entries(methodInfo) as [BalanceMethod, typeof methodInfo.pcc][]).map(([key, info]) => {
                const Icon = info.icon;
                const isSelected = method === key;
                return (
                  <button
                    key={key}
                    onClick={() => { setMethod(key); setGeneratedScript(null); setExecResult(null); }}
                    className={`text-left p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/30 hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-5 w-5 ${info.color}`} />
                      <span className="text-sm font-semibold text-foreground">{info.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{info.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Select WANs */}
          <div className="card-glow rounded-lg p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
              Seleccionar interfaces WAN
              <span className="text-xs text-muted-foreground ml-2">({selectedWans.length} seleccionadas)</span>
            </h3>
            {ethernetIfaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {loadingIfaces ? "Cargando..." : "No se encontraron interfaces ethernet. Recarga las interfaces."}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {ethernetIfaces.map(iface => {
                  const isWan = selectedWans.includes(iface.name);
                  const isLan = selectedLans.includes(iface.name);
                  return (
                    <button
                      key={`wan-${iface.name}`}
                      onClick={() => !isLan && toggleWan(iface.name)}
                      disabled={isLan}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        isWan
                          ? "border-primary bg-primary/10"
                          : isLan
                          ? "border-border bg-secondary/20 opacity-50 cursor-not-allowed"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono font-semibold text-foreground">{iface.name}</span>
                        <div className={`w-2.5 h-2.5 rounded-full ${iface.running ? "bg-success" : "bg-destructive"}`} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{iface.type}</p>
                      {iface.comment && <p className="text-xs text-muted-foreground truncate">{iface.comment}</p>}
                      {isWan && <span className="text-xs text-primary font-bold mt-1 block">WAN ✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3: Select LANs for bridge */}
          <div className="card-glow rounded-lg p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
              Seleccionar interfaces LAN (Bridge)
              <span className="text-xs text-muted-foreground ml-2">({selectedLans.length} seleccionadas)</span>
            </h3>
            <div className="flex items-center gap-3 mb-4">
              <label className="text-xs text-muted-foreground">Nombre del Bridge:</label>
              <Input
                value={bridgeName}
                onChange={e => setBridgeName(e.target.value)}
                className="w-48 h-8 text-sm font-mono"
              />
            </div>
            {ethernetIfaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay interfaces disponibles.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {ethernetIfaces.map(iface => {
                  const isLan = selectedLans.includes(iface.name);
                  const isWan = selectedWans.includes(iface.name);
                  return (
                    <button
                      key={`lan-${iface.name}`}
                      onClick={() => !isWan && toggleLan(iface.name)}
                      disabled={isWan}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        isLan
                          ? "border-chart-2 bg-chart-2/10"
                          : isWan
                          ? "border-border bg-secondary/20 opacity-50 cursor-not-allowed"
                          : "border-border hover:border-chart-2/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono font-semibold text-foreground">{iface.name}</span>
                        <div className={`w-2.5 h-2.5 rounded-full ${iface.running ? "bg-success" : "bg-destructive"}`} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{iface.type}</p>
                      {isLan && <span className="text-xs text-chart-2 font-bold mt-1 block">LAN ✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 4: Routing-specific options */}
          {method === "routing" && (
            <div className="card-glow rounded-lg p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</span>
                Configuración de Clientes
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-2">Tipo de clientes</label>
                  <div className="flex gap-2">
                    {(["pppoe", "dhcp"] as ClientType[]).map(ct => (
                      <button
                        key={ct}
                        onClick={() => setClientType(ct)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                          clientType === ct
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {ct.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-2">Total de clientes</label>
                  <Input
                    type="number"
                    value={totalClients}
                    onChange={e => setTotalClients(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-32 h-9 font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ {Math.floor(totalClients / Math.max(1, selectedWans.length))} clientes por WAN
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={generateScript}
              disabled={selectedWans.length < 2 || selectedLans.length < 1}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              Generar Script
            </Button>
            {selectedWans.length < 2 && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Selecciona al menos 2 WANs
              </p>
            )}
            {selectedWans.length >= 2 && selectedLans.length < 1 && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Selecciona al menos 1 LAN
              </p>
            )}
          </div>

          {/* Generated script */}
          {generatedScript && (
            <div className="card-glow rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  Script Generado — {methodInfo[method].label}
                </h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                    {copied ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={executeScript}
                    disabled={executing}
                    className="gap-1.5 bg-success hover:bg-success/80 text-success-foreground"
                  >
                    {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Aplicar en MikroTik
                  </Button>
                </div>
              </div>

              <pre className="bg-background/80 border border-border rounded-md p-4 text-xs font-mono text-foreground overflow-x-auto max-h-96 leading-relaxed whitespace-pre-wrap">
                {generatedScript}
              </pre>

              {/* Distribution summary for routing */}
              {method === "routing" && (
                <div className="bg-secondary/50 rounded-md p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">📊 Distribución de clientes:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {selectedWans.map((wan, i) => {
                      const perWan = Math.floor(totalClients / selectedWans.length);
                      const extra = i < (totalClients % selectedWans.length) ? 1 : 0;
                      return (
                        <div key={wan} className="flex items-center gap-2 text-xs">
                          <div className="w-3 h-3 rounded-full bg-primary" />
                          <span className="font-mono text-foreground">{wan}</span>
                          <span className="text-muted-foreground">→ {perWan + extra} clientes</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {execResult && (
                <div className={`rounded-md p-3 border-l-4 ${
                  execResult.success
                    ? "border-l-success bg-success/10"
                    : "border-l-destructive bg-destructive/10"
                }`}>
                  <div className="flex items-center gap-2">
                    {execResult.success
                      ? <CheckCircle className="h-4 w-4 text-success" />
                      : <XCircle className="h-4 w-4 text-destructive" />
                    }
                    <span className="text-sm text-foreground">{execResult.message}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info box */}
          <div className="card-glow rounded-lg p-4 border-l-4 border-l-primary">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">💡 Recomendación:</strong>{" "}
              {method === "pcc" && "PCC es ideal cuando las WANs tienen distinta velocidad. Cada conexión se mantiene en la misma WAN, evitando problemas con sesiones HTTPS y servicios bancarios."}
              {method === "nth" && "NTH funciona mejor con WANs de igual velocidad. Es más simple que PCC pero puede causar problemas si una WAN se cae (las conexiones asignadas se pierden)."}
              {method === "bonding" && "Bonding requiere que todas las interfaces sean del mismo tipo. Ideal para agregar ancho de banda pero todas las WANs deben llegar al mismo gateway/ISP."}
              {method === "routing" && `Con ${selectedWans.length || "N"} WANs y ${totalClients} clientes ${clientType.toUpperCase()}, cada WAN manejará ≈${Math.floor(totalClients / Math.max(1, selectedWans.length))} clientes. Perfecto para distribuir carga equitativamente.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
