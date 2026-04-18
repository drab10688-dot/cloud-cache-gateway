import { useState, useEffect, useCallback, useMemo } from "react";
import { Shield, Plus, Trash2, Search, Baby, AlertTriangle, Globe, RefreshCw, Clock, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { NetAdminDomainEditor } from "./NetAdminDomainEditor";
import { AdGuardFiltersManager } from "./AdGuardFiltersManager";
import { MintICReport } from "./MintICReport";

type FilterCategory = "all" | "mintic" | "infantil" | "coljuegos" | "manual";

interface BlockedDomain {
  domain: string;
  reason: string;
  category: FilterCategory;
  active: boolean;
}

interface UpdateStatus {
  timestamp: string | null;
  sources_ok: number;
  sources_fail: number;
  domains_total: number;
  status: string;
}

interface UploadResult {
  total: number;
  added: number;
  duplicates: number;
  invalid: number;
  category: string;
}

const categories: { id: FilterCategory; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "Todos", icon: Globe },
  { id: "infantil", label: "Infantil", icon: Baby },
  { id: "mintic", label: "MinTIC", icon: AlertTriangle },
  { id: "coljuegos", label: "Coljuegos", icon: Shield },
  { id: "manual", label: "Manual", icon: Shield },
];

const catBadgeColors: Record<string, string> = {
  infantil: "bg-destructive/20 text-destructive",
  mintic: "bg-warning/20 text-warning",
  coljuegos: "bg-accent/30 text-accent-foreground",
  manual: "bg-muted text-muted-foreground",
};

// Parse domains from file content (supports TXT, CSV, hosts format)
function parseDomains(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const domains: string[] = [];
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    // hosts file format: "0.0.0.0 domain.com" or "127.0.0.1 domain.com"
    const hostsMatch = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(.+)/);
    if (hostsMatch) {
      const d = hostsMatch[1].trim().split(/\s/)[0];
      if (domainRegex.test(d) && d !== 'localhost') domains.push(d.toLowerCase());
      continue;
    }

    // CSV: could be "domain,category,notes" or just "domain"
    const csvParts = line.split(/[,;\t]/);
    const candidate = csvParts[0].trim().replace(/^["']|["']$/g, '');

    // Plain domain
    if (domainRegex.test(candidate)) {
      domains.push(candidate.toLowerCase());
      continue;
    }

    // URL format: extract domain from URL
    try {
      const url = new URL(candidate.startsWith('http') ? candidate : `http://${candidate}`);
      if (domainRegex.test(url.hostname)) {
        domains.push(url.hostname.toLowerCase());
      }
    } catch {
      // Not a valid domain or URL, skip
    }
  }

  return [...new Set(domains)]; // deduplicate
}

function normalizeDomainInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/:.*$/, "")
    .replace(/^\|\|/, "")
    .replace(/\^(\$important)?$/, "")
    .replace(/\$important$/, "")
    .replace(/^\.+|\.+$/g, "");
}

// Convert a clean domain to an AdGuard blocking rule.
// Format: ||domain^$important — blocks domain + subdomains, overrides allowlists.
function toAdGuardRule(domain: string): string {
  return `||${domain}^$important`;
}

// Extract the bare domain from an AdGuard rule (or return as-is if already plain).
function ruleToDomain(rule: string): string {
  return normalizeDomainInput(rule);
}

export function DnsBlocklist() {
  const [blocklist, setBlocklist] = useState<BlockedDomain[]>([]);
  const [adguardStats, setAdguardStats] = useState<any>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newCategory, setNewCategory] = useState<FilterCategory>("manual");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterCat, setFilterCat] = useState<FilterCategory>("all");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [visibleCount, setVisibleCount] = useState(200);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseReport, setDiagnoseReport] = useState<any>(null);



  // Bulk selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Debounce search input to avoid filtering huge lists on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Reset pagination when filter or search changes
  useEffect(() => {
    setVisibleCount(200);
  }, [debouncedSearch, filterCat]);

  const fetchData = useCallback(async () => {
    try {
      const [full, stats, updStatus] = await Promise.all([
        api.getBlocklistFull().catch(async () => {
          const list = await api.getBlocklist();
          return (list as string[]).map(d => ({ domain: ruleToDomain(d), category: "manual" }));
        }),
        api.getAdGuardStats().catch(() => null),
        api.getBlocklistUpdateStatus().catch(() => null),
      ]);
      const reasons: Record<string, string> = { mintic: "MinTIC", infantil: "Protección infantil", coljuegos: "Coljuegos", manual: "Manual" };
      const mapped: BlockedDomain[] = (full as Array<{ domain: string; category: string }>).map(item => {
        const cat = (["manual", "mintic", "coljuegos", "infantil"].includes(item.category) ? item.category : "manual") as FilterCategory;
        return { domain: item.domain, reason: reasons[cat] || "Manual", category: cat, active: true };
      });
      setBlocklist(mapped);
      setAdguardStats(stats);
      if (updStatus) setUpdateStatus(updStatus);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addDomain = async () => {
    const normalized = normalizeDomainInput(newDomain);
    if (!normalized) {
      toast({ title: "Dominio inválido", description: "Escribe un dominio válido (ej: ejemplo.com)", variant: "destructive" });
      return;
    }
    try {
      await api.addToBlocklist(normalized, newCategory);
      setNewDomain("");
      toast({ title: "Dominio agregado", description: `${normalized} → AdGuard recargado` });
      // Re-fetch desde el backend para que el dominio quede visible y persistente
      await fetchData();
      // Si el filtro actual oculta la nueva categoría, cambia a "all" para que el usuario lo vea
      if (filterCat !== "all" && filterCat !== newCategory) {
        setFilterCat("all");
      }
    } catch (e: any) {
      toast({
        title: "No se pudo agregar el dominio",
        description: e?.message || "Verifica que el backend esté corriendo y autenticado.",
        variant: "destructive",
      });
    }
  };

  const removeDomain = async (domain: string) => {
    try {
      await api.removeFromBlocklist(domain);
      setBlocklist(blocklist.filter(b => b.domain !== domain));
      setSelected(prev => { const n = new Set(prev); n.delete(domain); return n; });
    } catch (e: any) {
      toast({
        title: "No se pudo eliminar",
        description: e?.message || "Error de conexión con el backend",
        variant: "destructive",
      });
    }
  };

  const toggleSelect = (domain: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain); else next.add(domain);
      return next;
    });
  };

  const toggleSelectAll = (visible: BlockedDomain[]) => {
    const allSelected = visible.length > 0 && visible.every(v => selected.has(v.domain));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) visible.forEach(v => next.delete(v.domain));
      else visible.forEach(v => next.add(v.domain));
      return next;
    });
  };

  const bulkRemove = async () => {
    if (selected.size === 0) return;
    if (!confirm(`¿Eliminar ${selected.size} dominio(s) seleccionado(s)?`)) return;
    setBulkDeleting(true);
    try {
      const res: any = await api.bulkRemoveFromBlocklist(Array.from(selected));
      toast({ title: "Eliminados", description: `${res.removed || 0} dominios borrados de AdGuard` });
      setSelected(new Set());
      await fetchData();
    } catch (e: any) {
      toast({ title: "No se pudieron eliminar", description: e?.message || "Error", variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const triggerUpdate = async () => {
    setUpdating(true);
    try {
      await api.triggerBlocklistUpdate();
      toast({ title: "Actualización iniciada", description: "Descargando listas remotas..." });
      setTimeout(async () => {
        try { const s = await api.getBlocklistUpdateStatus(); setUpdateStatus(s); } catch {}
        setUpdating(false);
      }, 10000);
    } catch (e: any) {
      setUpdating(false);
      toast({
        title: "No se pudo iniciar la actualización",
        description: e?.message || "Error de conexión",
        variant: "destructive",
      });
    }
  };

  // Diagnóstico: pregunta al backend por qué un dominio no se bloquea
  const runDiagnose = async () => {
    setDiagnosing(true);
    setDiagnoseReport(null);
    try {
      const report: any = await api.diagnoseBlocklist();
      setDiagnoseReport(report);
      const issues = (report.issues || []) as string[];
      const ok = issues.length === 1 && issues[0].startsWith("✅");
      // Auto-reparar si AdGuard no tiene los filtros registrados
      if (!ok && issues.some(i => i.includes("NO está registrado") || i.includes("DESACTIVADO"))) {
        toast({ title: "Reparando...", description: "Re-registrando filtros en AdGuard" });
        try {
          await api.repairBlocklist();
          const fixed: any = await api.diagnoseBlocklist();
          setDiagnoseReport(fixed);
          toast({ title: "✅ Reparado", description: "Filtros re-registrados. Refresca AdGuard para verlos." });
        } catch (e: any) {
          toast({ title: "No se pudo reparar", description: e?.message || "Error", variant: "destructive" });
        }
      } else if (ok) {
        toast({ title: "✅ Bloqueo OK", description: "AdGuard está configurado correctamente" });
      } else {
        toast({ title: `⚠️ ${issues.length} problema(s)`, description: issues[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Diagnóstico falló", description: e?.message || "Backend no responde", variant: "destructive" });
    } finally {
      setDiagnosing(false);
    }
  };



  // Memoized filter — avoids re-computing across thousands of items on every render
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return blocklist.filter((b) => {
      const matchSearch = !q || b.domain.includes(q);
      const matchCat = filterCat === "all" || b.category === filterCat;
      return matchSearch && matchCat;
    });
  }, [blocklist, debouncedSearch, filterCat]);

  const visibleItems = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const totalQueries = adguardStats?.num_dns_queries || "—";
  const blockedQueries = adguardStats?.num_blocked_filtering || "—";

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">DNS y Bloqueo de URLs</h2>
        <p className="text-sm text-muted-foreground mt-1">AdGuard + Unbound — Cumplimiento ISP Colombia (MinTIC / Coljuegos)</p>
      </div>

      {/* Editor unificado NetAdmin — agregar/subir/listar/eliminar por categoría */}
      <NetAdminDomainEditor />

      {/* Gestor de listas remotas AdGuard — toggle on/off + agregar URLs públicas */}
      <AdGuardFiltersManager />

      {/* Auto-update status */}
      <div className="card-glow rounded-lg p-5 mb-6 border border-primary/20">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-md ${updateStatus?.status === 'success' ? 'bg-success/20' : updateStatus?.status === 'partial' ? 'bg-warning/20' : 'bg-secondary'}`}>
              {updateStatus?.status === 'success' ? (
                <CheckCircle className="h-5 w-5 text-success" />
              ) : updateStatus?.status === 'partial' ? (
                <AlertTriangle className="h-5 w-5 text-warning" />
              ) : (
                <Clock className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Actualización Automática — Cron 24h</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {updateStatus?.timestamp ? (
                  <>Última: <span className="text-primary font-mono">{updateStatus.timestamp}</span> — {updateStatus.sources_ok} fuentes OK, {updateStatus.domains_total.toLocaleString()} dominios</>
                ) : (
                  "Sin actualizaciones aún — se ejecutará automáticamente"
                )}
                {updateStatus?.sources_fail ? (
                  <span className="text-destructive ml-1">({updateStatus.sources_fail} fuentes fallidas)</span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={runDiagnose} disabled={diagnosing} variant="outline" className="gap-2">
              {diagnosing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Diagnosticando...</>
              ) : (
                <><Shield className="h-4 w-4" /> Diagnosticar</>
              )}
            </Button>
            <Button onClick={triggerUpdate} disabled={updating} variant="outline" className="gap-2">
              {updating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Actualizando...</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> Actualizar ahora</>
              )}
            </Button>
          </div>
        </div>

        {/* Reporte de diagnóstico */}
        {diagnoseReport && (
          <div className="mt-4 p-4 rounded-md bg-secondary/50 border border-border text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Reporte de diagnóstico</span>
              <button onClick={() => setDiagnoseReport(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>AdGuard accesible: <span className={diagnoseReport.adguard_reachable ? "text-success" : "text-destructive"}>{diagnoseReport.adguard_reachable ? "Sí" : "No"}</span></div>
              <div>Protección activa: <span className={diagnoseReport.protection_enabled ? "text-success" : "text-destructive"}>{String(diagnoseReport.protection_enabled)}</span></div>
              <div>Filtrado activo: <span className={diagnoseReport.filtering_enabled ? "text-success" : "text-destructive"}>{String(diagnoseReport.filtering_enabled)}</span></div>
              <div>Filtros registrados: <span className="font-mono text-foreground">{diagnoseReport.registered_filters?.length || 0}</span></div>
            </div>
            {diagnoseReport.files_on_disk && (
              <div className="space-y-1 pt-2 border-t border-border">
                {Object.entries(diagnoseReport.files_on_disk).map(([cat, info]: [string, any]) => {
                  const reg = diagnoseReport.registered_filters?.find((f: any) => f.url?.endsWith(`netadmin_${cat}.txt`));
                  return (
                    <div key={cat} className="flex justify-between font-mono">
                      <span className="text-muted-foreground">{cat}:</span>
                      <span className="text-foreground">
                        disco: {info.domain_count} · adguard: {reg?.rules_count ?? "—"} {reg?.enabled === false && <span className="text-destructive">(off)</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="space-y-1 pt-2 border-t border-border">
              {(diagnoseReport.issues || []).map((issue: string, i: number) => (
                <p key={i} className={issue.startsWith("✅") ? "text-success" : "text-destructive"}>• {issue}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Dominios bloqueados", value: (updateStatus?.domains_total || blocklist.length).toLocaleString(), color: "text-warning" },
          { label: "Queries DNS", value: totalQueries.toLocaleString?.() || totalQueries, color: "text-primary" },
          { label: "Queries bloqueadas", value: blockedQueries.toLocaleString?.() || blockedQueries, color: "text-destructive" },
          { label: "Categorías", value: categories.length.toString(), color: "text-accent-foreground" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((cat) => (
          <button key={cat.id} onClick={() => setFilterCat(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              filterCat === cat.id ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary text-muted-foreground hover:text-foreground border border-transparent"
            }`}>
            <cat.icon className="h-3 w-3" />
            {cat.label}
          </button>
        ))}
      </div>

      <div className="card-glow rounded-lg p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar dominio..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-secondary border-border text-foreground placeholder:text-muted-foreground" />
          </div>
          <div className="flex gap-2">
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as FilterCategory)}
              className="bg-secondary border border-border rounded-md px-2 text-xs text-foreground">
              <option value="manual">Manual</option>
              <option value="infantil">Infantil</option>
              <option value="mintic">MinTIC</option>
              <option value="coljuegos">Coljuegos</option>
            </select>
            <Input placeholder="Agregar dominio..." value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDomain()} className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" />
            <Button onClick={addDomain} size="icon" className="shrink-0"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Bulk action bar — visible cuando hay selección o hay items para seleccionar */}
        {visibleItems.length > 0 && (
          <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-md bg-secondary/40 border border-border">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={visibleItems.length > 0 && visibleItems.every(v => selected.has(v.domain))}
                onCheckedChange={() => toggleSelectAll(visibleItems)}
                aria-label="Seleccionar todos los visibles"
              />
              <span className="text-xs text-muted-foreground">
                {selected.size > 0
                  ? <><span className="text-foreground font-semibold">{selected.size}</span> seleccionado(s)</>
                  : `Seleccionar los ${visibleItems.length} visibles`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="text-xs h-7">
                  Limpiar
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={bulkRemove}
                disabled={selected.size === 0 || bulkDeleting}
                className="gap-1.5 h-7 text-xs"
              >
                {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Eliminar seleccionados
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {visibleItems.map((item) => {
            const isSelected = selected.has(item.domain);
            return (
              <div
                key={item.domain}
                className={`flex items-center justify-between px-4 py-3 rounded-md border transition-colors ${
                  isSelected
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-secondary/50"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(item.domain)}
                    aria-label={`Seleccionar ${item.domain}`}
                  />
                  <Shield className="h-4 w-4 text-warning shrink-0" />
                  <span className="text-sm font-mono text-foreground truncate">{item.domain}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${catBadgeColors[item.category] || "bg-muted text-muted-foreground"}`}>{item.reason}</span>
                </div>
                <button
                  onClick={() => removeDomain(item.domain)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                  aria-label={`Eliminar ${item.domain}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay dominios bloqueados. Agrega uno arriba.</p>}
          {visibleItems.length < filtered.length && (
            <div className="flex flex-col items-center gap-2 py-3 border-t border-border mt-2">
              <p className="text-xs text-muted-foreground">
                Mostrando <span className="font-mono text-foreground">{visibleItems.length.toLocaleString()}</span> de <span className="font-mono text-foreground">{filtered.length.toLocaleString()}</span> dominios
              </p>
              <Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + 500)}>
                Cargar 500 más
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
