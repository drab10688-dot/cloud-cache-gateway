import { useState, useEffect, useCallback, useMemo } from "react";
import { Globe, Plus, Trash2, RefreshCw, Loader2, ExternalLink, Copy, Check } from "lucide-react";
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

interface SuggestedList {
  name: string;
  url: string;
  description: string;
  internal?: boolean; // listas NetAdmin servidas localmente
}

// Listas externas recomendadas
const EXTERNAL_LISTS: SuggestedList[] = [
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

// Listas internas NetAdmin (servidas por nginx local en /blocklists/netadmin_<cat>.txt)
const NETADMIN_CATEGORIES: { cat: string; name: string; description: string }[] = [
  { cat: "manual",    name: "NetAdmin · Lista Manual",         description: "Dominios agregados manualmente desde el panel" },
  { cat: "mintic",    name: "NetAdmin · MinTIC Colombia",      description: "Resolución MinTIC — bloqueo obligatorio ISP" },
  { cat: "coljuegos", name: "NetAdmin · Coljuegos Colombia",   description: "Apuestas ilegales según Coljuegos" },
  { cat: "infantil",  name: "NetAdmin · Protección Infantil",  description: "Contenido no apto para menores" },
];

// Construye la URL pública navegable que AdGuard puede descargar
// (mismo origen que el panel — nginx la sirve en /blocklists/)
function buildNetAdminUrl(cat: string): string {
  return `${window.location.protocol}//${window.location.host}/blocklists/netadmin_${cat}.txt`;
}

// Filtros internos NetAdmin (no editables desde aquí — se gestionan en sección de dominios)
const NETADMIN_INTERNAL_PREFIX = "NetAdmin"; // detecta "NetAdmin · ..." y "NetAdmin — ..." (compat)

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

  // Combinar listas externas + internas NetAdmin como chips recomendados
  const suggestedLists: SuggestedList[] = useMemo(() => {
    const internal: SuggestedList[] = NETADMIN_CATEGORIES.map(c => ({
      name: c.name,
      url: buildNetAdminUrl(c.cat),
      description: c.description,
      internal: true,
    }));
    return [...internal, ...EXTERNAL_LISTS];
  }, []);

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

      {/* Sugeridas (NetAdmin internas + externas) */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-2">
          Listas recomendadas <span className="text-foreground/60">(clic para agregar — las "NetAdmin ·" se sirven desde este panel)</span>:
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestedLists.map((s) => {
            // Match por URL exacta o por nombre (las internas pueden cambiar de host)
            const exists = filters.some(f =>
              f.url === s.url ||
              (s.internal && f.name === s.name)
            );
            return (
              <button
                key={s.url}
                onClick={() => !exists && addFromSuggested(s)}
                disabled={exists || adding}
                title={s.description}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  exists
                    ? s.internal
                      ? "bg-primary/10 border-primary/40 text-primary cursor-default"
                      : "bg-success/10 border-success/30 text-success cursor-default"
                    : s.internal
                      ? "bg-primary/5 border-primary/30 text-primary hover:bg-primary/15"
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

// Convierte la URL interna (http://netadmin-nginx/blocklists/...) en la URL pública navegable
// que el operador puede compartir / verificar desde fuera del docker network.
function toPublicUrl(internalUrl: string): string {
  try {
    const u = new URL(internalUrl);
    if (u.hostname === "netadmin-nginx") {
      return `${window.location.protocol}//${window.location.host}${u.pathname}`;
    }
    return internalUrl;
  } catch {
    return internalUrl;
  }
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
  const [copied, setCopied] = useState(false);
  const publicUrl = internal ? toPublicUrl(filter.url) : filter.url;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast({ title: "URL copiada", description: publicUrl });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-3 py-2.5 items-center text-sm border-b border-border last:border-b-0 hover:bg-secondary/40">
      <div className="w-10 flex justify-center">
        <Switch checked={filter.enabled} onCheckedChange={() => onToggle(filter)} />
      </div>
      <div className="min-w-0">
        <p className="text-foreground font-medium truncate">{filter.name}</p>
        <div className="flex items-center gap-1.5 max-w-full">
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 truncate min-w-0"
            title={publicUrl}
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono">{publicUrl}</span>
          </a>
          {internal && (
            <button
              onClick={copyUrl}
              title="Copiar URL pública"
              className="shrink-0 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>
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
