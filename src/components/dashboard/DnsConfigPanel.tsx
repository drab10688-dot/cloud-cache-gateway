import { useState, useCallback, useEffect } from "react";
import { Globe, Save, Loader2, RefreshCw, CheckCircle, Wifi, Info, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

const PRESET_DNS = [
  { name: "Google", primary: "8.8.8.8", secondary: "8.8.4.4" },
  { name: "Cloudflare", primary: "1.1.1.1", secondary: "1.0.0.1" },
  { name: "Quad9", primary: "9.9.9.9", secondary: "149.112.112.112" },
  { name: "OpenDNS", primary: "208.67.222.222", secondary: "208.67.220.220" },
];

export function DnsConfigPanel() {
  const [primary, setPrimary] = useState("8.8.8.8");
  const [secondary, setSecondary] = useState("8.8.4.4");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const serverIp = typeof window !== "undefined" ? window.location.hostname : "IP_DEL_SERVIDOR";

  const fetchConfig = useCallback(async () => {
    try {
      const config = await api.getDnsConfig();
      if (config.primary) setPrimary(config.primary);
      if (config.secondary) setSecondary(config.secondary);
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.setDnsConfig(primary, secondary);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: typeof PRESET_DNS[0]) => {
    setPrimary(preset.primary);
    setSecondary(preset.secondary);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Configuración DNS</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configura los DNS upstream de Unbound y la red de clientes
        </p>
      </div>

      {/* DNS for clients card */}
      <div className="card-glow rounded-lg p-5 mb-6 border-2 border-primary/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-primary/20">
            <Wifi className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">DNS para tus Clientes</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Configura esta IP como DNS en el router o en cada dispositivo</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between bg-card rounded-md px-4 py-3 border border-border">
            <div>
              <p className="text-xs text-muted-foreground">DNS Primario (tu servidor)</p>
              <p className="text-lg font-mono font-bold text-primary">{serverIp}</p>
            </div>
            <button onClick={() => copyToClipboard(serverIp, "dns-ip")} className="text-muted-foreground hover:text-foreground transition-colors ml-2">
              {copiedField === "dns-ip" ? <CheckCircle className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between bg-card rounded-md px-4 py-3 border border-border">
            <div>
              <p className="text-xs text-muted-foreground">DNS Secundario (respaldo)</p>
              <p className="text-lg font-mono font-bold text-muted-foreground">{secondary}</p>
            </div>
            <button onClick={() => copyToClipboard(secondary, "dns-sec")} className="text-muted-foreground hover:text-foreground transition-colors ml-2">
              {copiedField === "dns-sec" ? <CheckCircle className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-md bg-primary/5 border border-primary/20">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Router/MikroTik:</strong> DHCP → DNS Settings → DNS: <span className="text-primary font-mono">{serverIp}</span></p>
              <p><strong className="text-foreground">Windows:</strong> Adaptador → IPv4 → DNS: <span className="text-primary font-mono">{serverIp}</span></p>
              <p><strong className="text-foreground">Android/iOS:</strong> WiFi → DNS Privado: <span className="text-primary font-mono">{serverIp}</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Upstream DNS Config */}
      <div className="card-glow rounded-lg p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-secondary">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">DNS Upstream (Resolución Externa)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Servidores DNS que Unbound usa para resolver dominios — se aplica a toda tu red
            </p>
          </div>
        </div>

        {/* Presets */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">Seleccionar proveedor:</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_DNS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                  primary === preset.primary
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-foreground border-border hover:border-primary/50"
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Manual inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">DNS Primario (upstream)</label>
            <Input
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              placeholder="8.8.8.8"
              className="font-mono bg-secondary border-border"
              disabled={loading}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">DNS Secundario (upstream)</label>
            <Input
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              placeholder="8.8.4.4"
              className="font-mono bg-secondary border-border"
              disabled={loading}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? "Guardado ✓" : "Guardar y Aplicar"}
          </Button>
          <Button variant="outline" onClick={fetchConfig} disabled={loading} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Recargar
          </Button>
        </div>

        {saved && (
          <p className="text-xs text-success mt-3 animate-slide-in">
            ✓ DNS upstream actualizado. Unbound se reiniciará automáticamente para aplicar los cambios.
          </p>
        )}
      </div>

      {/* How it works */}
      <div className="card-glow rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">¿Cómo funciona la cadena DNS?</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            { label: "Dispositivo", color: "bg-primary/20 text-primary" },
            { label: "→" },
            { label: "AdGuard Home", color: "bg-destructive/20 text-destructive" },
            { label: "(filtrado)" },
            { label: "→" },
            { label: "Unbound", color: "bg-success/20 text-success" },
            { label: "(caché + recursivo)" },
            { label: "→" },
            { label: `${primary}`, color: "bg-warning/20 text-warning" },
            { label: "(upstream)" },
          ].map((item, i) =>
            item.color ? (
              <span key={i} className={`px-2 py-1 rounded-md font-mono font-semibold ${item.color}`}>
                {item.label}
              </span>
            ) : (
              <span key={i} className="text-muted-foreground">{item.label}</span>
            )
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Los clientes solo necesitan apuntar a <span className="text-primary font-mono font-bold">{serverIp}</span>. 
          AdGuard filtra ads/malware, Unbound resuelve con caché agresivo, y el upstream que configures aquí es el respaldo final.
        </p>
      </div>
    </div>
  );
}
