import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, setToken } from "@/lib/api";
import logoImg from "@/assets/logo.png";

interface LoginProps {
  onLogin: () => void;
}

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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="card-glow rounded-xl p-8 w-full max-w-sm mx-4 shadow-lg">
        <div className="flex flex-col items-center mb-6">
          <div className="relative w-20 h-20 rounded-full overflow-hidden ring-3 ring-primary/50 shadow-[0_0_24px_hsl(175_80%_35%/0.35)] mb-3">
            <img src={logoImg} alt="NetAdmin Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl font-bold text-foreground">NetAdmin</h1>
          <p className="text-xs text-muted-foreground font-mono">Panel de Red v3.0</p>
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
  );
}
