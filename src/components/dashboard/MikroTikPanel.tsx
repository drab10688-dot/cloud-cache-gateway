import { useState } from "react";
import { Router, Copy, CheckCircle, Shield, Globe, Info, Wifi, MonitorSpeaker, AlertTriangle } from "lucide-react";

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
        <h2 className="text-2xl font-bold text-foreground">Configuración MikroTik</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Reglas de firewall para proxy transparente — sin configurar nada en los clientes
        </p>
      </div>

      {/* Step 1: DNS */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-primary">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">1</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">DNS — Redirigir consultas a NetAdmin</h3>
            <p className="text-xs text-muted-foreground">Todo dispositivo que se conecte usará tu DNS automáticamente</p>
          </div>
        </div>
        <CopyBlock
          field="dns-mikrotik"
          code={`/ip dns set servers=${serverIp}
/ip dns set allow-remote-requests=yes

# Forzar que todos usen tu DNS (evitar bypass)
/ip firewall nat add chain=dstnat protocol=tcp dst-port=53 action=dst-nat to-addresses=${serverIp} to-ports=53 comment="NetAdmin: Forzar DNS TCP"
/ip firewall nat add chain=dstnat protocol=udp dst-port=53 action=dst-nat to-addresses=${serverIp} to-ports=53 comment="NetAdmin: Forzar DNS UDP"`}
        />
        <div className="mt-3 p-2 rounded-md bg-success/5 border border-success/20">
          <p className="text-xs text-success flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            Con solo esto ya tienes: caché DNS, bloqueo de ads, listas MinTIC/Coljuegos
          </p>
        </div>
      </div>

      {/* Step 2: DHCP */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-primary">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">2</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">DHCP — Entregar tu DNS a los clientes</h3>
            <p className="text-xs text-muted-foreground">Los dispositivos reciben tu DNS automáticamente al conectarse</p>
          </div>
        </div>
        <CopyBlock
          field="dhcp-mikrotik"
          code={`/ip dhcp-server network set [find] dns-server=${serverIp}`}
        />
      </div>

      {/* Step 3: Proxy Transparente HTTP */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-success">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-success text-success-foreground font-bold text-sm">3</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Proxy Transparente HTTP — Sin certificados</h3>
            <p className="text-xs text-muted-foreground">Cachea tráfico HTTP (puerto 80) automáticamente</p>
          </div>
        </div>
        <CopyBlock
          field="proxy-http"
          code={`# Redirigir HTTP al proxy Squid (transparente)
/ip firewall nat add chain=dstnat protocol=tcp dst-port=80 src-address=!${serverIp} action=dst-nat to-addresses=${serverIp} to-ports=3129 comment="NetAdmin: Proxy HTTP transparente"`}
        />
        <div className="mt-3 p-2 rounded-md bg-success/5 border border-success/20">
          <p className="text-xs text-success flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            No requiere configuración en los clientes. Funciona inmediatamente.
          </p>
        </div>
      </div>

      {/* Step 4: Proxy Transparente HTTPS (Opcional) */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-warning">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-warning text-warning-foreground font-bold text-sm">4</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Proxy HTTPS (SSL Bump) — Opcional</h3>
            <p className="text-xs text-muted-foreground">Cachea YouTube, Netflix, etc. Requiere certificado CA en clientes</p>
          </div>
        </div>
        <CopyBlock
          field="proxy-https"
          code={`# Redirigir HTTPS al proxy Squid SSL Bump
/ip firewall nat add chain=dstnat protocol=tcp dst-port=443 src-address=!${serverIp} action=dst-nat to-addresses=${serverIp} to-ports=3130 comment="NetAdmin: Proxy HTTPS SSL Bump"`}
        />
        <div className="mt-3 p-2 rounded-md bg-warning/5 border border-warning/20">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning">
              <strong>Requiere instalar el certificado CA</strong> en cada dispositivo, de lo contrario verán errores de SSL.
            </p>
          </div>
        </div>
      </div>

      {/* Step 5: Block QUIC */}
      <div className="card-glow rounded-lg p-5 mb-4 border-l-4 border-l-destructive">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive text-destructive-foreground font-bold text-sm">5</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Bloquear QUIC — Forzar TCP para caché</h3>
            <p className="text-xs text-muted-foreground">Impide que los navegadores usen UDP y bypaseen el proxy</p>
          </div>
        </div>
        <CopyBlock
          field="quic-block"
          code={`# Bloquear QUIC (UDP 443) para forzar HTTP/2 sobre TCP
/ip firewall filter add chain=forward protocol=udp dst-port=443 action=drop comment="NetAdmin: Bloquear QUIC"
/ip firewall filter add chain=forward protocol=udp dst-port=80 action=drop comment="NetAdmin: Bloquear HTTP/3 alt"`}
        />
      </div>

      {/* Certificate installation guide */}
      <div className="card-glow rounded-lg p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-primary/20">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Instalar Certificado CA (para HTTPS cache)</h3>
            <p className="text-xs text-muted-foreground">Solo necesario si activaste el paso 4</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-secondary/30 rounded-md p-3">
            <p className="text-xs font-semibold text-foreground mb-1">📥 Descargar certificado:</p>
            <CopyBlock field="cert-download" code={`scp root@${serverIp}:/opt/netadmin/certs/netadmin-ca.pem ./`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-secondary/30 rounded-md p-3">
              <p className="text-xs font-semibold text-foreground mb-2">🪟 Windows</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Doble clic en el archivo .pem</li>
                <li>Instalar certificado → Máquina local</li>
                <li>Entidades de certificación raíz</li>
                <li>Finalizar</li>
              </ol>
            </div>
            <div className="bg-secondary/30 rounded-md p-3">
              <p className="text-xs font-semibold text-foreground mb-2">📱 Android</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Enviar el .pem por email/USB</li>
                <li>Ajustes → Seguridad</li>
                <li>Instalar certificado CA</li>
                <li>Seleccionar el archivo</li>
              </ol>
            </div>
            <div className="bg-secondary/30 rounded-md p-3">
              <p className="text-xs font-semibold text-foreground mb-2">🍎 iOS / Mac</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Abrir el .pem en Safari</li>
                <li>Instalar perfil</li>
                <li>Ajustes → General → Perfil</li>
                <li>Confiar en certificado raíz</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="card-glow rounded-lg p-5">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Resumen: ¿Qué se cachea con cada nivel?</h3>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Nivel</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Qué cachea</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Config cliente</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-success">Solo DNS (1-2)</td>
                    <td className="py-2 pr-4">Resolución DNS, bloqueo ads/malware</td>
                    <td className="py-2 pr-4 text-success">Ninguna ✓</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-primary">+ HTTP proxy (3)</td>
                    <td className="py-2 pr-4">Descargas HTTP, repos Linux</td>
                    <td className="py-2 pr-4 text-success">Ninguna ✓</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-warning">+ HTTPS SSL (4)</td>
                    <td className="py-2 pr-4">YouTube, Netflix, todo HTTPS</td>
                    <td className="py-2 pr-4 text-warning">Certificado CA</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-destructive">+ QUIC block (5)</td>
                    <td className="py-2 pr-4">Fuerza TCP → maximiza caché video</td>
                    <td className="py-2 pr-4 text-success">Ninguna ✓</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
