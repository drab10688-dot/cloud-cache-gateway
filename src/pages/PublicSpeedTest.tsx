import { SpeedTestPanel } from "@/components/dashboard/SpeedTestPanel";
import logoImg from "@/assets/logo.png";

const PublicSpeedTest = () => {
  return (
    <div className="min-h-screen bg-background grid-pattern">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-primary/50">
            <img src={logoImg} alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">NetAdmin Speed Test</h1>
            <p className="text-xs text-muted-foreground">Verifica la velocidad de tu conexión</p>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        <SpeedTestPanel />
      </main>
    </div>
  );
};

export default PublicSpeedTest;
