import { useState } from "react";
import { Shield, Plus, Trash2, Search, Baby, AlertTriangle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Category = "all" | "mintic" | "infantil" | "coljuegos" | "manual";

type ItemCategory = "mintic" | "infantil" | "coljuegos" | "manual";

const initialBlocklist: { domain: string; reason: string; category: ItemCategory; active: boolean }[] = [
  { domain: "sitio-ilegal-1.co", reason: "MinTIC", category: "mintic", active: true },
  { domain: "torrent-prohibido.net", reason: "MinTIC", category: "mintic", active: true },
  { domain: "streaming-pirata.co", reason: "DNDA", category: "mintic", active: true },
  { domain: "apuestas-ilegales.com", reason: "Coljuegos", category: "coljuegos", active: true },
  { domain: "casino-sin-licencia.com", reason: "Coljuegos", category: "coljuegos", active: true },
  { domain: "bingo-ilegal.co", reason: "Coljuegos", category: "coljuegos", active: true },
  { domain: "pornhub.com", reason: "Protección infantil", category: "infantil" as const, active: true },
  { domain: "xvideos.com", reason: "Protección infantil", category: "infantil" as const, active: true },
  { domain: "xnxx.com", reason: "Protección infantil", category: "infantil" as const, active: true },
  { domain: "chaturbate.com", reason: "Protección infantil", category: "infantil" as const, active: true },
  { domain: "omegle.com", reason: "Protección infantil", category: "infantil" as const, active: true },
];

const categories: { id: Category; label: string; icon: React.ElementType; color: string }[] = [
  { id: "all", label: "Todos", icon: Globe, color: "text-primary" },
  { id: "infantil", label: "Infantil", icon: Baby, color: "text-destructive" },
  { id: "mintic", label: "MinTIC", icon: AlertTriangle, color: "text-warning" },
  { id: "coljuegos", label: "Coljuegos", icon: Shield, color: "text-accent-foreground" },
  { id: "manual", label: "Manual", icon: Shield, color: "text-muted-foreground" },
];

export function DnsBlocklist() {
  const [blocklist, setBlocklist] = useState(initialBlocklist);
  const [newDomain, setNewDomain] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("manual");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<Category>("all");

  const filtered = blocklist.filter((b) => {
    const matchSearch = b.domain.includes(search.toLowerCase()) || b.reason.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || b.category === filterCat;
    return matchSearch && matchCat;
  });

  const addDomain = () => {
    if (!newDomain.trim()) return;
    const reasons: Record<string, string> = { mintic: "MinTIC", infantil: "Protección infantil", coljuegos: "Coljuegos", manual: "Manual" };
    const cat = newCategory === "all" ? "manual" as const : newCategory;
    setBlocklist([{ domain: newDomain.trim().toLowerCase(), reason: reasons[cat], category: cat, active: true }, ...blocklist]);
    setNewDomain("");
  };

  const removeDomain = (domain: string) => setBlocklist(blocklist.filter((b) => b.domain !== domain));
  const toggleDomain = (domain: string) => setBlocklist(blocklist.map((b) => (b.domain === domain ? { ...b, active: !b.active } : b)));

  const countByCategory = (cat: Category) => cat === "all" ? blocklist.length : blocklist.filter((b) => b.category === cat).length;

  const catColors: Record<string, string> = {
    infantil: "text-destructive",
    mintic: "text-warning",
    coljuegos: "text-accent-foreground",
    manual: "text-muted-foreground",
  };

  const catBadgeColors: Record<string, string> = {
    infantil: "bg-destructive/20 text-destructive",
    mintic: "bg-warning/20 text-warning",
    coljuegos: "bg-accent/30 text-accent-foreground",
    manual: "bg-muted text-muted-foreground",
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">DNS y Bloqueo de URLs</h2>
        <p className="text-sm text-muted-foreground mt-1">AdGuard + Unbound — Bloqueo infantil, MinTIC Colombia, Coljuegos</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total bloqueados", value: blocklist.filter((b) => b.active).length.toString(), color: "text-warning" },
          { label: "Infantil", value: countByCategory("infantil").toString(), color: "text-destructive" },
          { label: "Queries DNS hoy", value: "28,431", color: "text-primary" },
          { label: "Queries bloqueadas", value: "3,812", color: "text-destructive" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setFilterCat(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              filterCat === cat.id
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-secondary text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            <cat.icon className="h-3 w-3" />
            {cat.label}
            <span className="font-mono ml-1 opacity-70">{countByCategory(cat.id)}</span>
          </button>
        ))}
      </div>

      <div className="card-glow rounded-lg p-5">
        {/* Search & Add */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar dominio..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-secondary border-border text-foreground placeholder:text-muted-foreground" />
          </div>
          <div className="flex gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as Category)}
              className="bg-secondary border border-border rounded-md px-2 text-xs text-foreground"
            >
              <option value="manual">Manual</option>
              <option value="infantil">Infantil</option>
              <option value="mintic">MinTIC</option>
              <option value="coljuegos">Coljuegos</option>
            </select>
            <Input placeholder="Agregar dominio..." value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground" />
            <Button onClick={addDomain} size="icon" className="shrink-0"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filtered.map((item) => (
            <div key={item.domain}
              className={`flex items-center justify-between px-4 py-3 rounded-md border transition-all ${
                item.active ? "border-border bg-secondary/50" : "border-border/50 bg-muted/30 opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Shield className={`h-4 w-4 ${catColors[item.category] || "text-muted-foreground"}`} />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono text-foreground">{item.domain}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${catBadgeColors[item.category] || ""}`}>{item.reason}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleDomain(item.domain)}
                  className={`text-xs px-2 py-1 rounded font-mono ${
                    item.active ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                  }`}
                >{item.active ? "Activo" : "Inactivo"}</button>
                <button onClick={() => removeDomain(item.domain)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No se encontraron dominios</p>
        )}
      </div>
    </div>
  );
}
