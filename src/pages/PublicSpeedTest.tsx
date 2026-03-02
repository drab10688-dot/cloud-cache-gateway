import { useMemo } from "react";
import { SpeedTestPanel } from "@/components/dashboard/SpeedTestPanel";
import { getBranding } from "@/lib/branding";
import logoImg from "@/assets/logo.png";

const PublicSpeedTest = () => {
  const branding = useMemo(() => getBranding(), []);

  return (
    <div
      className="min-h-screen bg-background grid-pattern"
      style={{
        "--primary": branding.primaryColor,
      } as React.CSSProperties}
    >
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.ispName}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/50"
              onError={(e) => {
                (e.target as HTMLImageElement).src = logoImg;
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-primary/50">
              <img src={logoImg} alt="Logo" className="w-full h-full object-cover" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-foreground">{branding.ispName} Speed Test</h1>
            <p className="text-xs text-muted-foreground">{branding.tagline}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <SpeedTestPanel />
      </main>

      {branding.showPoweredBy && (
        <footer className="border-t border-border py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-primary">NetAdmin</span>
          </p>
        </footer>
      )}
    </div>
  );
};

export default PublicSpeedTest;
