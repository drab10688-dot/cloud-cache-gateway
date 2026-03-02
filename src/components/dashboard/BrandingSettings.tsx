import { useState, useRef } from "react";
import { Palette, Eye, RotateCcw, CheckCircle, ImagePlus, ExternalLink, Upload } from "lucide-react";
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
  const [logoMode, setLogoMode] = useState<"url" | "file">(config.logoUrl ? "url" : "file");
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (partial: Partial<BrandingConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("El archivo debe ser menor a 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update({ logoUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
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
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          Branding del Speed Test
        </h3>
        <a
          href="/speedtest"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Ver página pública
        </a>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Personaliza la página <code className="text-primary">/speedtest</code> con el logo y colores de tu empresa
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column - Form */}
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

          {/* Logo */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Logo de la empresa</label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setLogoMode("file")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                  logoMode === "file" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground"
                }`}
              >
                <Upload className="h-3 w-3" />
                Subir archivo
              </button>
              <button
                onClick={() => setLogoMode("url")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                  logoMode === "url" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground"
                }`}
              >
                <ExternalLink className="h-3 w-3" />
                URL externa
              </button>
            </div>

            {logoMode === "file" ? (
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {config.logoUrl && config.logoUrl.startsWith("data:") ? (
                  <div className="flex flex-col items-center gap-3">
                    <img src={config.logoUrl} alt="Logo" className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/30" />
                    <p className="text-xs text-muted-foreground">Clic para cambiar</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Clic o arrastra tu logo aquí</p>
                    <p className="text-[10px] text-muted-foreground">PNG, JPG, SVG o WebP · Máximo 2MB</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Input
                  value={config.logoUrl.startsWith("data:") ? "" : config.logoUrl}
                  onChange={(e) => update({ logoUrl: e.target.value })}
                  placeholder="https://tu-sitio.com/logo.png"
                  className="bg-secondary border-border"
                />
                <p className="text-xs text-muted-foreground mt-1">Deja vacío para usar el logo por defecto</p>
              </div>
            )}

            {config.logoUrl && (
              <button
                onClick={() => update({ logoUrl: "" })}
                className="text-xs text-destructive hover:underline mt-2"
              >
                Quitar logo
              </button>
            )}
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
            <label className="text-xs text-muted-foreground block mb-2">Color corporativo</label>
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
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(${c.value})` }} />
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
            </div>
          </div>

          {/* Show powered by */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Mostrar "Powered by NetAdmin"</p>
              <p className="text-xs text-muted-foreground">Pie de página en el speed test</p>
            </div>
            <Switch checked={config.showPoweredBy} onCheckedChange={(v) => update({ showPoweredBy: v })} />
          </div>
        </div>

        {/* Right column - Live Preview */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Vista previa</label>
            <button
              onClick={() => setPreviewOpen(!previewOpen)}
              className="flex items-center gap-1 text-xs text-primary hover:underline lg:hidden"
            >
              <Eye className="h-3.5 w-3.5" />
              {previewOpen ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <div className={`${previewOpen ? "block" : "hidden"} lg:block`}>
            <div
              className="rounded-xl border border-border overflow-hidden"
              style={{ "--preview-primary": config.primaryColor } as React.CSSProperties}
            >
              {/* Preview header */}
              <div className="border-b border-border px-4 py-3 bg-muted/30">
                <div className="flex items-center gap-3">
                  {config.logoUrl ? (
                    <img
                      src={config.logoUrl}
                      alt="Logo"
                      className="w-8 h-8 rounded-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: `hsl(${config.primaryColor})` }}
                    >
                      {config.ispName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-sm text-foreground">{config.ispName || "Mi ISP"} Speed Test</p>
                    <p className="text-[10px] text-muted-foreground">{config.tagline}</p>
                  </div>
                </div>
              </div>

              {/* Preview body */}
              <div className="p-6 flex flex-col items-center bg-background">
                {/* Mini gauge preview */}
                <div className="w-24 h-24 rounded-full border-4 border-secondary flex items-center justify-center mb-4"
                  style={{ borderTopColor: `hsl(${config.primaryColor})` }}
                >
                  <span className="text-lg font-bold font-mono text-foreground">0</span>
                </div>
                <div
                  className="px-6 py-2 rounded-full text-white text-sm font-bold"
                  style={{ backgroundColor: `hsl(${config.primaryColor})` }}
                >
                  GO
                </div>
              </div>

              {/* Preview footer */}
              {config.showPoweredBy && (
                <div className="border-t border-border py-2 text-center bg-muted/30">
                  <p className="text-[10px] text-muted-foreground">
                    Powered by <span className="font-semibold" style={{ color: `hsl(${config.primaryColor})` }}>NetAdmin</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6">
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
  );
}
