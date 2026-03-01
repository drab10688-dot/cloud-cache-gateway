import { useState } from "react";
import { Lock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, setToken } from "@/lib/api";

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
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center">
      <div className="card-glow rounded-lg p-8 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <Globe className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">NetAdmin</h1>
            <p className="text-xs text-muted-foreground font-mono">Panel de Red v2.0</p>
          </div>
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
