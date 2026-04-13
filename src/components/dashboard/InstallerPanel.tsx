import { useState, useEffect } from "react";
import { Terminal, Download, Copy, CheckCircle, Server, Shield, MonitorSpeaker, Package, Gamepad2, Cloud, Activity, HeartPulse, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const SCRIPT_URL = "/install-netadmin.sh";

const steps = [
  { step: "1", title: "Conectarse al VPS", cmd: "ssh root@tu-servidor" },
  { step: "2", title: "Descargar el script", cmd: "curl -fsSL https://raw.githubusercontent.com/drab10688-dot/cloud-cache-gateway/main/public/install-netadmin.sh -o install-netadmin.sh" },
  { step: "3", title: "Dar permisos", cmd: "chmod +x install-netadmin.sh" },
  { step: "4", title: "Ejecutar (instala Docker + levanta todo)", cmd: "sudo bash install-netadmin.sh" },
  { step: "5", title: "Verificar contenedores", cmd: "netadmin status" },
  { step: "6", title: "Gestionar servicios", cmd: "netadmin logs / netadmin restart" },
  { step: "7", title: "Activar túnel Cloudflare", cmd: "netadmin-tunnel start" },
];

const uninstallSteps = [
  { step: "1", title: "Desinstalar NetAdmin (mantiene Docker)", cmd: "sudo bash install-netadmin.sh --uninstall" },
  { step: "2", title: "O desinstalar TODO (incluye Docker)", cmd: "sudo bash install-netadmin.sh --uninstall" },
];

const services = [
  { name: "Unbound DNS", icon: Server, desc: "DNS recursivo con DNSSEC, caché agresivo, respuesta ~4ms" },
  { name: "AdGuard Home", icon: Shield, desc: "Filtrado DNS: ads, trackers, infantil, MinTIC, Coljuegos" },
  { name: "Uptime Kuma", icon: HeartPulse, desc: "Monitoreo de uptime con alertas (Telegram, Discord, Email)" },
  { name: "Cloudflare Tunnel", icon: Cloud, desc: "Acceso remoto sin IP pública, un comando para generar link" },
  { name: "Monitor de Ping", icon: Activity, desc: "Registro de latencia y caídas de internet 24/7" },
];

export function InstallerPanel() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedUninstallIdx, setCopiedUninstallIdx] = useState<number | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [runningCount, setRunningCount] = useState(0);

  useEffect(() => {
    api.getServices()
      .then((data: Record<string, boolean>) => {
        const running = Object.values(data).filter(Boolean).length;
        setRunningCount(running);
        setIsInstalled(running > 0);
      })
      .catch(() => setIsInstalled(false));
  }, []);

  const copyCmd = (cmd: string, idx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const copyCmdUninstall = (cmd: string, idx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedUninstallIdx(idx);
    setTimeout(() => setCopiedUninstallIdx(null), 2000);
  };

  const downloadScript = () => {
    const a = document.createElement("a");
    a.href = SCRIPT_URL;
    a.download = "install-netadmin.sh";
    a.click();
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Instalador Ubuntu Server</h2>
        <p className="text-sm text-muted-foreground mt-1">100% Docker — Ubuntu Server 20.04+ — Un solo comando instala todo</p>
      </div>

      {/* Installation status */}
      {isInstalled !== null && (
        <div className={`card-glow rounded-lg p-4 mb-6 border-2 ${isInstalled ? "border-green-500/30 bg-green-500/5" : "border-muted/30"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isInstalled ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isInstalled ? `NetAdmin instalado — ${runningCount} servicios activos` : "NetAdmin no detectado"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isInstalled ? "El sistema está corriendo en este servidor" : "Sigue los pasos de instalación para comenzar"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Download */}
      <div className="card-glow rounded-lg p-5 mb-6 border-2 border-primary/30">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/20">
              <Terminal className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">install-netadmin.sh</h3>
              <p className="text-xs text-muted-foreground font-mono">Instala Docker + docker-compose.yml con todos los servicios</p>
            </div>
          </div>
          <Button onClick={downloadScript} className="gap-2" size="lg">
            <Download className="h-4 w-4" />
            Descargar Script
          </Button>
        </div>
      </div>

      {/* Steps */}
      <div className="card-glow rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          Pasos de Instalación
        </h3>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">{s.step}</span>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">{s.title}</p>
                <div className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2">
                  <code className="text-xs font-mono text-foreground flex-1 break-all">{s.cmd}</code>
                  <button onClick={() => copyCmd(s.cmd, i)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                    {copiedIdx === i ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What gets installed */}
      <div className="card-glow rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">¿Qué se instala?</h3>
        <div className="space-y-3">
          {services.map((svc) => (
            <div key={svc.name} className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-secondary/30">
              <div className="p-1.5 rounded bg-secondary shrink-0">
                <svc.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <span className="text-sm font-medium text-foreground">{svc.name}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{svc.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Post-install config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Configurar Dispositivos</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="text-foreground font-medium">En tu router o DHCP:</p>
            <div className="bg-secondary/50 rounded-md px-3 py-2 font-mono">
              <p>DNS Primario: <span className="text-primary">IP_DEL_VPS</span></p>
              <p>Proxy HTTP: <span className="text-primary">IP_DEL_VPS:3128</span></p>
            </div>
            <p className="mt-2 text-foreground font-medium">Para repos Linux (en cada máquina):</p>
            <div className="bg-secondary/50 rounded-md px-3 py-2 font-mono">
              echo 'Acquire::http::Proxy "http://IP:3142";' | sudo tee /etc/apt/apt.conf.d/01proxy
            </div>
          </div>
        </div>

        <div className="card-glow rounded-lg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Requisitos del VPS</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>• Ubuntu Server 20.04, 22.04 o 24.04 (LTS)</p>
            <p>• Mínimo <span className="text-primary font-mono">2 GB RAM</span> / <span className="text-primary font-mono">2 vCPU</span></p>
            <p>• <span className="text-primary font-mono">100 GB+</span> disco (para caché)</p>
            <p>• Acceso root (sudo)</p>
            <p>• Docker se instala automáticamente</p>
            <p>• Gestión: <span className="text-primary font-mono">netadmin up/down/update/logs</span></p>
          </div>
        </div>
      </div>

      {/* Important notes */}
      <div className="card-glow rounded-lg p-5 mb-6 border border-warning/30">
        <h3 className="text-sm font-semibold text-warning mb-3">⚠ Importante — Certificado SSL</h3>
        <p className="text-xs text-muted-foreground">
          Para cachear YouTube y contenido HTTPS, Squid genera un certificado CA propio. Debes instalar este
          certificado en cada dispositivo que quieras cachear. El archivo está en:
        </p>
        <code className="text-xs font-mono text-primary block mt-2 bg-secondary/50 px-3 py-2 rounded">/etc/squid/ssl_cert/netadmin-ca.pem</code>
        <p className="text-xs text-muted-foreground mt-2">Sin este certificado, los navegadores mostrarán advertencias de seguridad en sitios HTTPS.</p>
      </div>

      {/* Uninstall section */}
      {isInstalled && (
        <div className="card-glow rounded-lg p-5 border-2 border-destructive/30 bg-destructive/5">
          <h3 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Desinstalar NetAdmin
          </h3>
          <div className="flex items-start gap-2 mb-4 p-3 rounded-md bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Esto eliminará <strong className="text-foreground">todos los contenedores, configuraciones y datos de caché</strong>.
              El script te preguntará si también deseas desinstalar Docker.
            </p>
          </div>
          <div className="space-y-3">
            {uninstallSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-destructive/20 text-destructive text-xs font-bold flex items-center justify-center shrink-0">{s.step}</span>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">{s.title}</p>
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2">
                    <code className="text-xs font-mono text-foreground flex-1">{s.cmd}</code>
                    <button onClick={() => copyCmdUninstall(s.cmd, i)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                      {copiedUninstallIdx === i ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
