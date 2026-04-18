import { useState, useEffect, useCallback } from "react";
import { Globe, Plus, Trash2, RefreshCw, Loader2, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface RemoteFilter {
  id?: number;
  enabled: boolean;
  url: string;
  name: string;
  rules_count?: number;
  last_updated?: string;
}

// Listas recomendadas (sugerencias rápidas)
const SUGGESTED_LISTS: { name: string; url: string; description: string }[] = [
  {
    name: "AdGuard DNS filter",
    url: "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt",
    description: "Lista oficial AdGuard — bloqueo general de publicidad y trackers",
  },
  {
    name: "AdAway Default Blocklist",
    url: "https://adaway.org/hosts.txt",
    description: "AdAway — bloqueo de publicidad móvil",
  },
  {
    name: "Steven Black Hosts",
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    description: "Lista unificada de adware + malware (~80k dominios)",
  },
  {
    name: "OISD Big",
    url: "https://big.oisd.nl/",
    description: "OISD Big — bloqueo amplio recomendado para ISP",
  },
  {
    name: "Hagezi Multi PRO",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt",
    description: "Hagezi PRO — anti-ads + tracking (sin romper sitios)",
  },
  {
    name: "Phishing Army",
    url: "https://phishing.army/download/phishing_army_blocklist_extended.txt",
    description: "Phishing Army — protección anti-phishing",
  },
];

// Filtros internos NetAdmin (no editables desde aquí — se gestionan en sección de dominios)
const NETADMIN_INTERNAL_PREFIX = "NetAdmin";

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export function RemoteBlocklists() {
  const [filters, setFilters] = useState<RemoteFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchFilters = useCallback(async () => {
    try {
      const data: any = await api.getAdGuardFiltering();
      const list: RemoteFilter[] = (data?.filters || []).map((f: any) => ({
        id: f.id,
        enabled: !!f.enabled,
        url: f.url,
        name: f.name || f.url,
        rules_count: f.rules_count ?? 0,
        last_updated: f.last_updated,
      }));
      setFilters(list);
    } catch (e: any) {
      toast({ title: "No se pudo cargar AdGuard", description: e?.message || "Backend offline", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  const addFromSuggested = async (s: { name: string; url: string }) => {
    if (filters.some(f => f.url === s.url)) {
      toast({ title: "Ya existe", description: `${s.name} ya está en la lista` });
      return;
    }
    setAdding(true);
    try {
      await api.addFilter(s.url, s.name);
      toast({ title: "Lista agregada", description: `${s.name} → AdGuard la descargará` });
      await fetchFilters();
    } catch (e: any) {
      toast({ title: "No se pudo agregar", description: e?.message || "Error", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const addCustom = async () => {
    const url = newUrl.trim();
    const name = newName.trim() || url;
    if (!url || !/^https?:\/\//i.test(url)) {
      toast({ title: "URL inválida", description: "Debe empezar con http:// o https://", variant: "destructive" });
      return;
    }
    if (filters.some(f => f.url === url)) {
      toast({ title: "Ya existe esa URL" });
      return;
    }
    setAdding(true);
    try {
      await api.addFilter(url, name);
      toast({ title: "Lista agregada", description: `${name} en cola de descarga` });
      setNewName("");
      setNewUrl("");
      await fetchFilters();
    } catch (e: any) {
      toast({ title: "No se pudo agregar", description: e?.message || "Error", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const removeFilter = async (f: RemoteFilter) => {
    if (f.name?.startsWith(NETADMIN_INTERNAL_PREFIX)) {
      toast({
        title: "No se puede eliminar",
        description: "Las listas internas NetAdmin se gestionan desde la sección de dominios. Limpia la categoría desde allí.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`¿Eliminar "${f.name}"?`)) return;
    try {
      await api.removeFilter(f.url);
      toast({ title: "Lista eliminada", description: f.name });
      await fetchFilters();
    } catch (e: any) {
      toast({ title: "No se pudo eliminar", description: e?.message || "Error", variant: "destructive" });
    }
  };

  const toggleFilter = async (f: RemoteFilter) => {
    try {
      await api.toggleFilter(f.url, !f.enabled, f.name);
      await fetchFilters();
    } catch (e: any) {
      toast({ title: "No se pudo cambiar estado", description: e?.message || "Error", variant: "destructive" });
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await api.refreshFilters();
      toast({ title: "Refrescando listas", description: "AdGuard descargará las URLs nuevamente" });
      setTimeout(fetchFilters, 3000);
    } catch (e: any) {
      toast({ title: "Error al refrescar", description: e?.message || "Error", variant: "destructive" });
    } finally {
      setTimeout(() => setRefreshing(false), 3000);
    }
  };

  // Fuerza el registro de las 4 listas internas NetAdmin en AdGuard.
  // Útil tras una reinstalación o si AdGuard fue reseteado y perdió la config.
  const publishNetAdminLists = async () => {
    setPublishing(true);
    try {
      await api.repairBlocklist();
      toast({
        title: "✅ Listas NetAdmin publicadas",
        description: "Las 4 listas internas (Manual, MinTIC, Coljuegos, Infantil) están registradas y activas en AdGuard",
      });
      await fetchFilters();
    } catch (e: any) {
      toast({ title: "No se pudo publicar", description: e?.message || "Error", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  // Separar internas vs externas para mostrar en orden
  const externalFilters = filters.filter(f => !f.name?.startsWith(NETADMIN_INTERNAL_PREFIX));
  const internalFilters = filters.filter(f => f.name?.startsWith(NETADMIN_INTERNAL_PREFIX));

  const totalRules = filters.reduce((sum, f) => sum + (f.enabled ? (f.rules_count || 0) : 0), 0);

  return (
    <div className="card-glow rounded-lg p-5 mb-6 border border-primary/20">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/20">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Listas Remotas (URLs)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filters.length} listas registradas · {totalRules.toLocaleString()} reglas activas
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={publishNetAdminLists} disabled={publishing} variant="default" size="sm" className="gap-2">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Publicar listas NetAdmin
          </Button>
          <Button onClick={refreshAll} disabled={refreshing} variant="outline" size="sm" className="gap-2">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refrescar todas
          </Button>
        </div>
      </div>

      {/* Form: agregar URL personalizada */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 mb-4">
        <Input
          placeholder="Nombre (opcional)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="bg-secondary border-border"
        />
        <Input
          placeholder="https://ejemplo.com/blocklist.txt"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          className="bg-secondary border-border font-mono text-xs"
        />
        <Button onClick={addCustom} disabled={adding} className="gap-2">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Agregar URL
        </Button>
      </div>

      {/* Sugeridas */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-2">Listas recomendadas (clic para agregar):</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_LISTS.map((s) => {
            const exists = filters.some(f => f.url === s.url);
            return (
              <button
                key={s.url}
                onClick={() => !exists && addFromSuggested(s)}
                disabled={exists || adding}
                title={s.description}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  exists
                    ? "bg-success/10 border-success/30 text-success cursor-default"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {exists ? "✓ " : "+ "}
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabla de filtros */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-3 py-2 bg-secondary/70 text-xs font-semibold text-muted-foreground">
          <div className="w-10 text-center">Activo</div>
          <div>Nombre / URL</div>
          <div className="text-right w-24">Reglas</div>
          <div className="text-right w-32 hidden md:block">Última actualización</div>
          <div className="w-10"></div>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Cargando listas de AdGuard...
            </div>
          ) : filters.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No hay listas registradas. Agrega una sugerida arriba.
            </div>
          ) : (
            <>
              {externalFilters.map((f) => (
                <FilterRow key={f.url} filter={f} onToggle={toggleFilter} onRemove={removeFilter} internal={false} />
              ))}
              {internalFilters.length > 0 && (
                <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground border-y border-border">
                  Listas internas NetAdmin (gestionar dominios desde la sección de abajo)
                </div>
              )}
              {internalFilters.map((f) => (
                <FilterRow key={f.url} filter={f} onToggle={toggleFilter} onRemove={removeFilter} internal={true} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterRow({
  filter,
  onToggle,
  onRemove,
  internal,
}: {
  filter: RemoteFilter;
  onToggle: (f: RemoteFilter) => void;
  onRemove: (f: RemoteFilter) => void;
  internal: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-3 py-2.5 items-center text-sm border-b border-border last:border-b-0 hover:bg-secondary/40">
      <div className="w-10 flex justify-center">
        <Switch checked={filter.enabled} onCheckedChange={() => onToggle(filter)} />
      </div>
      <div className="min-w-0">
        <p className="text-foreground font-medium truncate">{filter.name}</p>
        <a
          href={filter.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 truncate max-w-full"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{filter.url}</span>
        </a>
      </div>
      <div className="text-right w-24 font-mono text-xs">
        {filter.rules_count ? (
          <span className="text-foreground">{filter.rules_count.toLocaleString()}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className="text-right w-32 hidden md:block text-xs text-muted-foreground font-mono">
        {formatDate(filter.last_updated)}
      </div>
      <button
        onClick={() => onRemove(filter)}
        disabled={internal}
        title={internal ? "Lista interna — gestionar desde dominios" : "Eliminar lista"}
        className={`w-10 flex justify-center ${
          internal ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-destructive"
        } transition-colors`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
