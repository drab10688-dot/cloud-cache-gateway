import { useState, useEffect, useCallback } from "react";
import { Shield, Plus, Trash2, Search, Baby, AlertTriangle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type FilterCategory = "all" | "mintic" | "infantil" | "coljuegos" | "manual";

interface BlockedDomain {
  domain: string;
  reason: string;
  category: FilterCategory;
  active: boolean;
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

export function DnsBlocklist() {
  const [blocklist, setBlocklist] = useState<BlockedDomain[]>([]);
  const [adguardStats, setAdguardStats] = useState<any>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newCategory, setNewCategory] = useState<FilterCategory>("manual");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<FilterCategory>("all");

  const fetchData = useCallback(async () => {
    try {
      const [domains, stats] = await Promise.all([
        api.getBlocklist(),
        api.getAdGuardStats().catch(() => null),
      ]);
      // Map plain domain strings to BlockedDomain objects
      const mapped: BlockedDomain[] = (domains as string[]).map((d: string) => ({
        domain: d,
        reason: "Lista local",
        category: "manual" as FilterCategory,
        active: true,
      }));
      setBlocklist(mapped);
      setAdguardStats(stats);
    } catch { /* offline fallback */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addDomain = async () => {
    if (!newDomain.trim()) return;
    try {
      await api.addToBlocklist(newDomain.trim().toLowerCase());
      const reasons: Record<string, string> = { mintic: "MinTIC", infantil: "Protección infantil", coljuegos: "Coljuegos", manual: "Manual" };
      setBlocklist([{ domain: newDomain.trim().toLowerCase(), reason: reasons[newCategory] || "Manual", category: newCategory, active: true }, ...blocklist]);
      setNewDomain("");
    } catch { /* error */ }
  };

  const removeDomain = async (domain: string) => {
    try {
      await api.removeFromBlocklist(domain);
      setBlocklist(blocklist.filter(b => b.domain !== domain));
    } catch { /* error */ }
  };

  const filtered = blocklist.filter((b) => {
    const matchSearch = b.domain.includes(search.toLowerCase());
    const matchCat = filterCat === "all" || b.category === filterCat;
    return matchSearch && matchCat;
  });

  const totalQueries = adguardStats?.num_dns_queries || "—";
  const blockedQueries = adguardStats?.num_blocked_filtering || "—";

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">DNS y Bloqueo de URLs</h2>
        <p className="text-sm text-muted-foreground mt-1">AdGuard + Unbound — Datos reales del servidor</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Dominios bloqueados", value: blocklist.length.toString(), color: "text-warning" },
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

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filtered.map((item) => (
            <div key={item.domain} className="flex items-center justify-between px-4 py-3 rounded-md border border-border bg-secondary/50">
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-warning" />
                <span className="text-sm font-mono text-foreground">{item.domain}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${catBadgeColors[item.category] || "bg-muted text-muted-foreground"}`}>{item.reason}</span>
              </div>
              <button onClick={() => removeDomain(item.domain)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay dominios bloqueados. Agrega uno arriba.</p>}
        </div>
      </div>
    </div>
  );
}
