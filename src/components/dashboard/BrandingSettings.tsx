import { useState } from "react";
import { Palette, Eye, RotateCcw, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getBranding, saveBranding, resetBranding, type BrandingConfig } from "@/lib/branding";

const presetColors = [
  { name: "Cyan", value: "175 80% 45%" },
  { name: "Azul", value: "220 80% 50%" },
  { name: "Verde", value: "142 70% 45%" },
  { name: "Naranja", value: "25 90% 55%" },
  { name: "Rojo", value: "0 75% 50%" },
  { name: "Morado", value: "270 70% 55%" },
  { name: "Rosa", value: "330 70% 55%" },
];

export function BrandingSettings() {
  const [config, setConfig] = useState<BrandingConfig>(getBranding);
  const [saved, setSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const update = (partial: Partial<BrandingConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  };

  const handleSave = () => {
    saveBranding(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    const defaults = resetBranding();
    setConfig(defaults);
    setSaved(false);
  };

  return (
    <div className="card-glow rounded-lg p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Palette className="h-4 w-4 text-primary" />
        Branding del Speed Test Público
      </h3>
      <p className="text-xs text-muted-foreground mb-5">
        Personaliza la página pública <code className="text-primary">/speedtest</code> con tu marca
      </p>

      <div className="space-y-5">
        {/* ISP Name */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Nombre del ISP / Empresa</label>
          <Input
            value={config.ispName}
            onChange={(e) => update({ ispName: e.target.value })}
            placeholder="Ej: MiInternet Fibra"
            className="bg-secondary border-border"
          />
        </div>

        {/* Logo URL */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">URL del Logo (opcional)</label>
          <Input
            value={config.logoUrl}
            onChange={(e) => update({ logoUrl: e.target.value })}
            placeholder="https://tu-sitio.com/logo.png"
            className="bg-secondary border-border"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Deja vacío para usar el logo de NetAdmin por defecto
          </p>
        </div>

        {/* Tagline */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Slogan / Tagline</label>
          <Input
            value={config.tagline}
            onChange={(e) => update({ tagline: e.target.value })}
            placeholder="Ej: Velocidad que conecta"
            className="bg-secondary border-border"
          />
        </div>

        {/* Color presets */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">Color primario</label>
          <div className="flex flex-wrap gap-2">
            {presetColors.map((c) => (
              <button
                key={c.name}
                onClick={() => update({ primaryColor: c.value })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                  config.primaryColor === c.value
                    ? "border-foreground bg-secondary"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: `hsl(${c.value})` }}
                />
                {c.name}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <Input
              value={config.primaryColor}
              onChange={(e) => update({ primaryColor: e.target.value })}
              placeholder="175 80% 45%"
              className="bg-secondary border-border font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">Formato HSL sin paréntesis</p>
          </div>
        </div>

        {/* Show powered by */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Mostrar "Powered by NetAdmin"</p>
            <p className="text-xs text-muted-foreground">Pie de página en el speed test público</p>
          </div>
          <Switch
            checked={config.showPoweredBy}
            onCheckedChange={(v) => update({ showPoweredBy: v })}
          />
        </div>

        {/* Preview */}
        <button
          onClick={() => setPreviewOpen(!previewOpen)}
          className="flex items-center gap-2 text-xs text-primary hover:underline"
        >
          <Eye className="h-3.5 w-3.5" />
          {previewOpen ? "Ocultar vista previa" : "Ver vista previa"}
        </button>

        {previewOpen && (
          <div
            className="rounded-lg border border-border p-5 text-center"
            style={{
              "--preview-primary": config.primaryColor,
            } as React.CSSProperties}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              {config.logoUrl ? (
                <img
                  src={config.logoUrl}
                  alt="Logo"
                  className="w-10 h-10 rounded-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: `hsl(${config.primaryColor})` }}
                >
                  {config.ispName.charAt(0)}
                </div>
              )}
              <div className="text-left">
                <p className="font-bold text-foreground">{config.ispName || "Mi ISP"}</p>
                <p className="text-xs text-muted-foreground">{config.tagline}</p>
              </div>
            </div>
            <div
              className="inline-block px-4 py-2 rounded-lg text-white text-sm font-semibold"
              style={{ backgroundColor: `hsl(${config.primaryColor})` }}
            >
              Iniciar Test
            </div>
            {config.showPoweredBy && (
              <p className="text-xs text-muted-foreground mt-3">Powered by NetAdmin</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={handleSave} className="flex-1 gap-2">
            {saved ? <CheckCircle className="h-4 w-4" /> : <Palette className="h-4 w-4" />}
            {saved ? "¡Guardado!" : "Guardar Branding"}
          </Button>
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
