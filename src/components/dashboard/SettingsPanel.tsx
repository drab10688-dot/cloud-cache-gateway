import { useState } from "react";
import { Lock, CheckCircle, AlertTriangle, LogOut, RefreshCw, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandingSettings } from "./BrandingSettings";
import { Input } from "@/components/ui/input";
import { api, clearToken } from "@/lib/api";

export function SettingsPanel() {
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [updatingPanel, setUpdatingPanel] = useState(false);
  const [panelMsg, setPanelMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  const pollJob = async (
    jobId: string,
    setMsg: (m: { type: "success" | "error"; text: string }) => void,
    onSuccess?: () => void
  ) => {
    const startedAt = Date.now();
    const maxMs = 15 * 60 * 1000; // 15 min
    while (Date.now() - startedAt < maxMs) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const r = await api.getJobStatus(jobId);
        const job = r.job;
        if (!job) continue;
        if (job.status === "success") {
          setMsg({ type: "success", text: job.message || "Completado" });
          onSuccess?.();
          return;
        }
        if (job.status === "error") {
          const logTail = job.logs ? `\n\nLogs: ${String(job.logs).slice(-500)}` : "";
          setMsg({ type: "error", text: (job.error || "Error en el job") + logTail });
          return;
        }
        const mins = Math.floor((Date.now() - startedAt) / 60000);
        const secs = Math.floor(((Date.now() - startedAt) % 60000) / 1000);
        setMsg({ type: "success", text: `En progreso... ${mins}m ${secs}s` });
      } catch (e: any) {
        // Transient polling error — keep trying
        setMsg({ type: "success", text: `Verificando... (${e?.message || "reintentando"})` });
      }
    }
    setMsg({ type: "error", text: "Tiempo de espera agotado (15 min). El proceso puede seguir en el servidor; recarga en unos minutos." });
  };

  const handleUpdateImages = async () => {
    setUpdating(true);
    setUpdateMsg({ type: "success", text: "Iniciando actualización..." });
    try {
      const result = await api.updateDockerImages();
      if (result.success && result.jobId) {
        setUpdateMsg({ type: "success", text: "En progreso... esto puede tardar 2-5 minutos" });
        await pollJob(result.jobId, setUpdateMsg);
      } else {
        setUpdateMsg({ type: "error", text: result.error || "Error al iniciar" });
      }
    } catch (e: any) {
      setUpdateMsg({ type: "error", text: e?.message || "Error de conexión con el servidor" });
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdatePanel = async () => {
    setUpdatingPanel(true);
    setPanelMsg({ type: "success", text: "Iniciando compilación..." });
    try {
      const result = await api.updatePanel();
      if (result.success && result.jobId) {
        setPanelMsg({ type: "success", text: "Compilando panel... esto tarda 2-5 minutos" });
        await pollJob(result.jobId, setPanelMsg, () => {
          setPanelMsg({ type: "success", text: "Panel actualizado. Recargando..." });
          setTimeout(() => window.location.reload(), 3000);
        });
      } else {
        setPanelMsg({ type: "error", text: result.error || "Error al iniciar la actualización" });
      }
    } catch (e: any) {
      setPanelMsg({ type: "error", text: e?.message || "Error de conexión con el servidor" });
    } finally {
      setUpdatingPanel(false);
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
        <p className="text-sm text-muted-foreground mt-1">Administra la seguridad y actualizaciones del panel</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Change password */}
        <div className="card-glow rounded-lg p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Cambiar Contraseña
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Contraseña actual</label>
              <Input type="password" placeholder="Ingresa tu contraseña actual" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Nueva contraseña</label>
              <Input type="password" placeholder="Mínimo 6 caracteres" value={newPass} onChange={(e) => setNewPass(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Confirmar nueva contraseña</label>
              <Input type="password" placeholder="Repite la nueva contraseña" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleChangePassword()} className="bg-secondary border-border" />
            </div>
            {message && (
              <div className={`flex items-center gap-2 text-xs font-mono p-3 rounded-md ${message.type === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {message.text}
              </div>
            )}
            <Button onClick={handleChangePassword} disabled={loading} className="w-full">
              {loading ? "Actualizando..." : "Cambiar Contraseña"}
            </Button>
          </div>
        </div>

        {/* Updates */}
        <div className="space-y-6">
          {/* Update Docker images */}
          <div className="card-glow rounded-lg p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              Actualizar Servicios Docker
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Descarga las últimas versiones de AdGuard, Uptime Kuma, Unbound y demás servicios. Equivalente a <code className="text-primary">netadmin update</code>.
            </p>
            {updateMsg && (
              <div className={`flex items-center gap-2 text-xs font-mono p-3 rounded-md mb-4 ${updateMsg.type === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                {updateMsg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {updateMsg.text}
              </div>
            )}
            <Button onClick={handleUpdateImages} disabled={updating} className="w-full gap-2">
              {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {updating ? "Actualizando servicios..." : "Actualizar Imágenes Docker"}
            </Button>
          </div>

          {/* Update panel */}
          <div className="card-glow rounded-lg p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              Actualizar Panel + Backend API
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Descarga la última versión desde GitHub, compila el panel web <strong>y reconstruye el backend API</strong> (netadmin-api) automáticamente.
            </p>
            {panelMsg && (
              <div className={`flex items-center gap-2 text-xs font-mono p-3 rounded-md mb-4 ${panelMsg.type === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                {panelMsg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {panelMsg.text}
              </div>
            )}
            <Button onClick={handleUpdatePanel} disabled={updatingPanel} variant="outline" className="w-full gap-2">
              {updatingPanel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {updatingPanel ? "Compilando panel..." : "Actualizar Panel Web"}
            </Button>
          </div>

          {/* Logout */}
          <div className="card-glow rounded-lg p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <LogOut className="h-4 w-4 text-destructive" />
              Sesión
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Cierra sesión en este dispositivo.</p>
            <Button variant="destructive" onClick={handleLogout} className="w-full gap-2">
              <LogOut className="h-4 w-4" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>

      {/* Branding section - full width */}
      <div className="mt-6">
        <BrandingSettings />
      </div>
    </div>
  );
}
