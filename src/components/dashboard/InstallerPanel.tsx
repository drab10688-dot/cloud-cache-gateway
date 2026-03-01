import { useState } from "react";
import { Terminal, Download, Copy, CheckCircle, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Section } from "@/pages/Index";

interface Props {
  onNavigate: (s: Section) => void;
}

const SCRIPT_URL = "/install-netadmin.sh";

const steps = [
  { step: "1", title: "Descargar el script", cmd: "wget https://TU-DOMINIO/install-netadmin.sh" },
  { step: "2", title: "Dar permisos", cmd: "chmod +x install-netadmin.sh" },
  { step: "3", title: "Ejecutar como root", cmd: "sudo bash install-netadmin.sh" },
  { step: "4", title: "Verificar servicios", cmd: "netadmin-status" },
];

const features = [
  "Unbound DNS — Resolución recursiva con caché agresivo y DNSSEC",
  "AdGuard Home — Filtrado DNS con bloqueo de ads, trackers y listas MinTIC",
  "Cloudflare Tunnel — Acceso remoto sin IP pública",
  "Nginx Cache CDN — Caché de contenido (hasta 50GB)",
  "Monitor de Ping — Registro continuo de latencia a Google DNS",
  "Firewall UFW — Configuración automática de puertos",
];

export function InstallerPanel({ onNavigate }: Props) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyCmd = (cmd: string, idx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
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
        <p className="text-sm text-muted-foreground mt-1">Script automatizado para VPS — Ubuntu 20.04 / 22.04 / 24.04</p>
      </div>

      {/* Download button */}
      <div className="card-glow rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-secondary">
              <Terminal className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">install-netadmin.sh</h3>
              <p className="text-xs text-muted-foreground font-mono">Script Bash — ~200 líneas</p>
            </div>
          </div>
          <Button onClick={downloadScript} className="gap-2">
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
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {s.step}
              </span>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">{s.title}</p>
                <div className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2">
                  <code className="text-xs font-mono text-foreground flex-1">{s.cmd}</code>
                  <button
                    onClick={() => copyCmd(s.cmd, i)}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    {copiedIdx === i ? (
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="card-glow rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">¿Qué se instala?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-md bg-secondary/30">
              <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span className="text-xs text-foreground">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Requirements */}
      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Requisitos</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>• Ubuntu Server 20.04, 22.04 o 24.04 (64-bit)</p>
          <p>• Mínimo 1 GB RAM / 1 vCPU</p>
          <p>• 10 GB de disco (+ espacio para caché CDN)</p>
          <p>• Acceso root (sudo)</p>
          <p>• Cuenta de Cloudflare (gratis) para el túnel</p>
        </div>
      </div>
    </div>
  );
}
