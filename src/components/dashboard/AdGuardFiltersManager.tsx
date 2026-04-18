import { useState, useEffect, useCallback } from "react";
import { Globe, Plus, Trash2, RefreshCw, Loader2, Power, Link2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface AdGuardFilter {
  id?: number;
  name: string;
  url: string;
  enabled: boolean;
  rules_count?: number;
  last_updated?: string;
}

export function AdGuardFiltersManager() {
  const [filters, setFilters] = useState<AdGuardFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [togglingUrl, setTogglingUrl] = useState<string | null>(null);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);

  const fetchFilters = useCallback(async () => {
    try {
      const data: any = await api.getAdGuardFiltering();
      const list: AdGuardFilter[] = (data?.filters || []).map((f: any) => ({
        id: f.id,
        name: f.name || f.url,
        url: f.url,
        enabled: !!f.enabled,
        rules_count: f.rules_count,
        last_updated: f.last_updated,
      }));
      setFilters(list);
    } catch (e: any) {
      toast({
        title: "No se pudieron cargar las listas",
        description: e?.message || "AdGuard no responde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  const toggleFilter = async (filter: AdGuardFilter) => {
    setTogglingUrl(filter.url);
    // Optimistic update
    setFilters(prev => prev.map(f => f.url === filter.url ? { ...f, enabled: !f.enabled } : f));
    try {
      await api.toggleFilter(filter.url, !filter.enabled, filter.name);
      toast({
        title: !filter.enabled ? "✓ Lista activada" : "Lista desactivada",
        description: filter.name,
      });
    } catch (e: any) {
      // Revert on error
      setFilters(prev => prev.map(f => f.url === filter.url ? { ...f, enabled: filter.enabled } : f));
      toast({
        title: "No se pudo cambiar el estado",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setTogglingUrl(null);
    }
  };

  const addFilter = async () => {
    const url = newUrl.trim();
    const name = newName.trim() || url.split("/").pop() || "Lista personalizada";
    if (!url || !/^https?:\/\/.+/.test(url)) {
      toast({
        title: "URL inválida",
        description: "Debe empezar con http:// o https://",
        variant: "destructive",
      });
      return;
    }
    if (filters.some(f => f.url === url)) {
      toast({
        title: "Lista duplicada",
        description: "Esa URL ya está registrada",
        variant: "destructive",
      });
      return;
    }
    setAdding(true);
    try {
      await api.addFilter(url, name);
      toast({ title: "✓ Lista agregada", description: `${name} → AdGuard la descargará` });
      setNewUrl("");
      setNewName("");
      await fetchFilters();
    } catch (e: any) {
      toast({
        title: "No se pudo agregar",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const removeFilter = async (filter: AdGuardFilter) => {
    if (!confirm(`¿Eliminar la lista "${filter.name}"?\n\nURL: ${filter.url}`)) return;
    setRemovingUrl(filter.url);
    try {
      await api.removeFilter(filter.url);
      setFilters(prev => prev.filter(f => f.url !== filter.url));
      toast({ title: "Lista eliminada", description: filter.name });
    } catch (e: any) {
      toast({
        title: "No se pudo eliminar",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setRemovingUrl(null);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await api.refreshFilters();
      toast({ title: "✓ Listas actualizadas", description: "AdGuard descargó las reglas más recientes" });
      await fetchFilters();
    } catch (e: any) {
      toast({
        title: "No se pudieron actualizar",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const isNetAdmin = (url: string) => url.includes("/blocklists/netadmin_");
  const enabledCount = filters.filter(f => f.enabled).length;

  return (
    <div className="card-glow rounded-lg p-5 mb-6 border border-primary/20">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/20">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Listas de Filtros AdGuard</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {enabledCount} activa{enabledCount !== 1 ? "s" : ""} de {filters.length} · Click en el switch para activar/desactivar
            </p>
          </div>
        </div>
        <Button
          onClick={refreshAll}
          disabled={refreshing || loading}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar todas
        </Button>
      </div>

      {/* Add new filter URL */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mb-4 p-3 rounded-md bg-secondary/40 border border-border">
        <Input
          placeholder="Nombre (ej: OISD Big)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          className="bg-background border-border text-sm"
        />
        <Input
          placeholder="https://ejemplo.com/lista.txt"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addFilter()}
          className="bg-background border-border font-mono text-xs"
        />
        <Button onClick={addFilter} disabled={adding} className="gap-2 shrink-0">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Agregar URL
        </Button>
      </div>

      {/* Filters list */}
      <div className="border border-border rounded-md overflow-hidden bg-secondary/30">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Cargando listas...
          </div>
        ) : filters.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No hay listas configuradas. Agrega una URL arriba.
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
            {filters.map(f => {
              const native = isNetAdmin(f.url);
              const isToggling = togglingUrl === f.url;
              const isRemoving = removingUrl === f.url;
              return (
                <div
                  key={f.url}
                  className={`flex items-center gap-3 px-3 py-3 hover:bg-secondary/60 transition-colors ${
                    f.enabled ? "" : "opacity-60"
                  }`}
                >
                  <div className="shrink-0">
                    {isToggling ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Switch
                        checked={f.enabled}
                        onCheckedChange={() => toggleFilter(f)}
                        aria-label={`Activar ${f.name}`}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Power className={`h-3 w-3 shrink-0 ${f.enabled ? "text-success" : "text-muted-foreground"}`} />
                      <span className="text-sm font-semibold text-foreground truncate">{f.name}</span>
                      {native && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono shrink-0">
                          NetAdmin
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono truncate hover:text-primary hover:underline flex items-center gap-1"
                        title={f.url}
                      >
                        {f.url}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono text-foreground">
                      {f.rules_count?.toLocaleString() ?? "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">reglas</div>
                  </div>

                  <button
                    onClick={() => removeFilter(f)}
                    disabled={isRemoving || native}
                    title={native ? "Las listas NetAdmin no se pueden eliminar desde aquí" : "Eliminar lista"}
                    className="p-2 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  >
                    {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        💡 Las listas marcadas como <span className="text-primary font-mono">NetAdmin</span> se gestionan desde el editor de arriba.
        Puedes activarlas/desactivarlas pero no eliminarlas para no romper la integración.
      </p>
    </div>
  );
}
