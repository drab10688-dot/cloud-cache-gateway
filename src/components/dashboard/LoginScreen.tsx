import { useState } from "react";
import { Lock, Shield, Wifi, Gauge, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, setToken } from "@/lib/api";
import logoImg from "@/assets/logo.png";

interface LoginProps {
  onLogin: () => void;
}

const features = [
  { icon: Shield, text: "Bloqueo de ads, trackers y contenido no deseado" },
  { icon: Gauge, text: "Caché inteligente: YouTube, Steam, Windows Update" },
  { icon: Wifi, text: "Monitoreo 24/7 de latencia y caídas de internet" },
  { icon: Server, text: "Administración Docker centralizada desde el panel" },
];

export function LoginScreen({ onLogin }: LoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.login(password);
      if (result.success) {
        setToken(result.token);
        onLogin();
      } else {
        setError("Contraseña incorrecta");
      }
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex flex-col justify-center items-center w-1/2 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-12">
        <div className="max-w-md text-center space-y-8">
          <div className="relative w-24 h-24 mx-auto rounded-full overflow-hidden ring-4 ring-primary/50 shadow-[0_0_32px_hsl(175_80%_35%/0.4)]">
            <img src={logoImg} alt="NetAdmin Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-foreground tracking-tight">NetAdmin</h1>
            <p className="text-lg text-primary font-semibold mt-1">Panel de Gestión de Red</p>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Plataforma todo-en-uno para ISPs y administradores de red. Controla tu DNS, caché, 
            monitoreo y seguridad desde un solo lugar. Optimiza tu ancho de banda y protege tu red.
          </p>
          <div className="space-y-3 text-left">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-card/50 rounded-lg px-4 py-3 border border-border/50">
                <f.icon className="h-5 w-5 text-primary shrink-0" />
                <span className="text-sm text-foreground">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Login */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="card-glow rounded-xl p-8 w-full max-w-sm shadow-lg">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-20 h-20 rounded-full overflow-hidden ring-3 ring-primary/50 shadow-[0_0_24px_hsl(175_80%_35%/0.35)] mb-3">
              <img src={logoImg} alt="NetAdmin Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl font-bold text-foreground">NetAdmin</h1>
            <p className="text-xs text-muted-foreground font-mono">Panel de Gestión de Red</p>
            <p className="text-xs text-muted-foreground text-center mt-2 lg:hidden">
              Administra tu DNS, caché y monitoreo desde un solo panel.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Ingresa la contraseña..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="pl-9 bg-secondary border-border text-foreground"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive font-mono">{error}</p>
            )}

            <Button onClick={handleLogin} disabled={loading} className="w-full">
              {loading ? "Conectando..." : "Iniciar Sesión"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Contraseña configurada durante la instalación
          </p>
        </div>
      </div>
    </div>
  );
}
