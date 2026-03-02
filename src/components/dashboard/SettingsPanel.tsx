import { useState } from "react";
import { Lock, CheckCircle, AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, clearToken } from "@/lib/api";

export function SettingsPanel() {
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChangePassword = async () => {
    setMessage(null);
    if (!currentPass || !newPass || !confirmPass) {
      setMessage({ type: "error", text: "Todos los campos son obligatorios" });
      return;
    }
    if (newPass.length < 6) {
      setMessage({ type: "error", text: "La nueva contraseña debe tener al menos 6 caracteres" });
      return;
    }
    if (newPass !== confirmPass) {
      setMessage({ type: "error", text: "Las contraseñas no coinciden" });
      return;
    }
    setLoading(true);
    try {
      const result = await api.changePassword(currentPass, newPass);
      if (result.success) {
        setMessage({ type: "success", text: "Contraseña actualizada correctamente" });
        setCurrentPass("");
        setNewPass("");
        setConfirmPass("");
      } else {
        setMessage({ type: "error", text: result.error || "Error al cambiar la contraseña" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión con el servidor" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    window.location.reload();
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Configuración</h2>
        <p className="text-sm text-muted-foreground mt-1">Administra la seguridad del panel</p>
      </div>

      {/* Change password */}
      <div className="card-glow rounded-lg p-6 mb-6 max-w-md">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          Cambiar Contraseña
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Contraseña actual</label>
            <Input
              type="password"
              placeholder="Ingresa tu contraseña actual"
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Nueva contraseña</label>
            <Input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Confirmar nueva contraseña</label>
            <Input
              type="password"
              placeholder="Repite la nueva contraseña"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
              className="bg-secondary border-border"
            />
          </div>

          {message && (
            <div className={`flex items-center gap-2 text-xs font-mono p-3 rounded-md ${
              message.type === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            }`}>
              {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {message.text}
            </div>
          )}

          <Button onClick={handleChangePassword} disabled={loading} className="w-full">
            {loading ? "Actualizando..." : "Cambiar Contraseña"}
          </Button>
        </div>
      </div>

      {/* Logout */}
      <div className="card-glow rounded-lg p-6 max-w-md">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <LogOut className="h-4 w-4 text-destructive" />
          Sesión
        </h3>
        <p className="text-xs text-muted-foreground mb-4">Cierra sesión en este dispositivo. Tendrás que ingresar la contraseña nuevamente.</p>
        <Button variant="destructive" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </Button>
      </div>
    </div>
  );
}
