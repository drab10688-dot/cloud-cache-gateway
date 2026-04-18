import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ListPlus, Plus, Trash2, Search, Upload, Loader2, FileText, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

type Category = "manual" | "mintic" | "coljuegos" | "infantil";

const CATEGORIES: { id: Category; label: string; emoji: string; description: string }[] = [
  { id: "manual",    label: "Lista Manual",       emoji: "📝", description: "Dominios personalizados" },
  { id: "mintic",    label: "MinTIC Colombia",    emoji: "📋", description: "Bloqueo obligatorio ISP" },
  { id: "coljuegos", label: "Coljuegos",          emoji: "🎰", description: "Apuestas ilegales" },
  { id: "infantil",  label: "Protección Infantil", emoji: "👶", description: "Contenido no apto" },
];

// Parser robusto: acepta dominio plano, hosts (0.0.0.0 dom), URL, AdGuard ||dom^
function parseDomains(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  const re = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;
  for (const raw of lines) {
    let line = raw.trim().toLowerCase();
    if (!line || line.startsWith("#") || line.startsWith("!") || line.startsWith("//")) continue;
    const hosts = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(\S+)/);
    if (hosts) line = hosts[1];
    line = line.replace(/^\|\|/, "").replace(/\^.*$/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/:.*$/, "");
    if (re.test(line) && line !== "localhost") out.push(line);
  }
  return [...new Set(out)];
}

function normalize(v: string): string {
  return v.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/:.*$/, "")
    .replace(/^\|\|/, "")
    .replace(/\^.*$/, "")
    .replace(/^\.+|\.+$/g, "");
}

interface DomainItem { domain: string; category: Category; }

export function NetAdminDomainEditor() {
  const [activeCat, setActiveCat] = useState<Category>("manual");
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [visible, setVisible] = useState(300);
  const [counts, setCounts] = useState<Record<Category, number>>({ manual: 0, mintic: 0, coljuegos: 0, infantil: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setVisible(300); }, [debounced, activeCat]);

  const fetchDomains = useCallback(async () => {
    try {
      const full: any = await api.getBlocklistFull();
      console.log("[NetAdminEditor] getBlocklistFull response:", full);

      // Soporte defensivo:
      //  - formato nuevo: [{ domain, category }, ...]
      //  - formato viejo: ["dom1", "dom2", ...]  (todo cae a "manual")
      //  - error / no array: avisamos al usuario
      if (!Array.isArray(full)) {
        console.error("[NetAdminEditor] respuesta inesperada:", full);
        toast({
          title: "Backend desactualizado",
          description: "El endpoint /api/blocklist/full no devolvió un array. Reinstala el backend con install-netadmin.sh.",
          variant: "destructive",
        });
        setDomains([]);
        setCounts({ manual: 0, mintic: 0, coljuegos: 0, infantil: 0 });
        return;
      }

      const list: DomainItem[] = full
        .map((it: any): DomainItem | null => {
          if (typeof it === "string") {
            return it ? { domain: it.toLowerCase(), category: "manual" } : null;
          }
          if (it && typeof it.domain === "string" && it.domain) {
            const cat = (["manual", "mintic", "coljuegos", "infantil"].includes(it.category)
              ? it.category
              : "manual") as Category;
            return { domain: it.domain.toLowerCase(), category: cat };
          }
          return null;
        })
        .filter((x): x is DomainItem => x !== null);

      console.log(`[NetAdminEditor] ${list.length} dominios parseados de ${full.length} items`);
      setDomains(list);
      const c: Record<Category, number> = { manual: 0, mintic: 0, coljuegos: 0, infantil: 0 };
      for (const d of list) c[d.category]++;
      setCounts(c);
    } catch (e: any) {
      console.error("[NetAdminEditor] fetchDomains error:", e);
      toast({ title: "No se pudieron cargar dominios", description: e?.message || "Backend offline", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  const addOne = async () => {
    const d = normalize(newDomain);
    if (!d || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(d)) {
      toast({ title: "Dominio inválido", description: "Ejemplo: ejemplo.com", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const resp: any = await api.addToBlocklist(d, activeCat);
      console.log("[NetAdminEditor] addToBlocklist response:", resp);
      setNewDomain("");
      toast({ title: "✓ Guardado en backend", description: `${d} → ${activeCat}. Recargando lista...` });
      await fetchDomains();
    } catch (e: any) {
      console.error("[NetAdminEditor] addOne error:", e);
      toast({ title: "No se pudo agregar", description: e?.message || "Error", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const removeOne = async (domain: string) => {
    try {
      await api.removeFromBlocklist(domain);
      setDomains(prev => prev.filter(x => x.domain !== domain));
      setCounts(prev => ({ ...prev, [activeCat]: Math.max(0, prev[activeCat] - 1) }));
    } catch (e: any) {
      toast({ title: "No se pudo eliminar", description: e?.message || "Error", variant: "destructive" });
    }
  };

  const clearCategory = async () => {
    if (!confirm(`¿Eliminar TODOS los dominios de "${activeCat}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.clearBlocklist(activeCat);
      toast({ title: "Categoría vaciada", description: `${activeCat} ahora está vacía` });
      await fetchDomains();
    } catch (e: any) {
      toast({ title: "No se pudo vaciar", description: e?.message || "Error", variant: "destructive" });
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let totalParsed = 0, totalAdded = 0, totalDup = 0, totalInvalid = 0;
    const all: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const content = await file.text();
        const parsed = parseDomains(content);
        totalParsed += parsed.length;
        all.push(...parsed);
      } catch { totalInvalid++; }
    }
    if (all.length > 0) {
      const CHUNK = 5000;
      try {
        for (let i = 0; i < all.length; i += CHUNK) {
          const chunk = all.slice(i, i + CHUNK);
          const r: any = await api.bulkAddToBlocklist(chunk, activeCat);
          totalAdded += r.added || 0;
          totalDup += r.duplicates || 0;
          totalInvalid += r.invalid || 0;
        }
      } catch (e: any) {
        toast({ title: "Error subiendo", description: e?.message || "Error", variant: "destructive" });
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    toast({
      title: totalAdded > 0 ? "✓ Archivo cargado" : "Sin nuevos dominios",
      description: `${totalParsed} leídos · ${totalAdded} nuevos · ${totalDup} duplicados · ${totalInvalid} inválidos`,
    });
    await fetchDomains();
  };

  const filtered = useMemo(() => {
    const q = debounced.toLowerCase();
    return domains.filter(d => d.category === activeCat && (!q || d.domain.includes(q)));
  }, [domains, activeCat, debounced]);

  const visibleItems = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  return (
    <div className="card-glow rounded-lg p-5 mb-6 border border-primary/20">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-md bg-primary/20">
          <ListPlus className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Editor de Dominios NetAdmin</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Selecciona categoría → agrega dominio o sube archivo → edita y elimina abajo
          </p>
        </div>
      </div>

      {/* Selector de categoría */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {CATEGORIES.map(c => {
          const isActive = activeCat === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`p-3 rounded-md border text-left transition-all ${
                isActive
                  ? "bg-primary/15 border-primary text-foreground shadow-md"
                  : "bg-secondary border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{c.emoji}</span>
                <span className={`text-xs font-mono ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {counts[c.id]}
                </span>
              </div>
              <p className="text-xs font-semibold">{c.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{c.description}</p>
            </button>
          );
        })}
      </div>

      {/* Acciones: agregar dominio + subir archivo */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-4">
        <div className="flex gap-2">
          <Input
            placeholder={`Dominio para ${activeCat} (ej: ejemplo.com)`}
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addOne()}
            className="bg-secondary border-border font-mono text-sm"
          />
          <Button onClick={addOne} disabled={adding} className="gap-2 shrink-0">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Agregar
          </Button>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.lst,.hosts,.text"
            multiple
            className="hidden"
            onChange={e => handleUpload(e.target.files)}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            variant="outline"
            className="gap-2 w-full md:w-auto"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Subir archivo .txt
          </Button>
        </div>
      </div>

      {/* Buscador + acciones de lista */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Buscar en ${activeCat} (${counts[activeCat]} dominios)`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-secondary border-border pl-9 text-sm"
          />
        </div>
        <Button
          onClick={clearCategory}
          variant="outline"
          size="sm"
          disabled={counts[activeCat] === 0}
          className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
        >
          <Eraser className="h-4 w-4" />
          Vaciar todo
        </Button>
      </div>

      {/* Lista */}
      <div className="border border-border rounded-md overflow-hidden bg-secondary/30">
        <div className="px-3 py-2 bg-secondary/70 text-xs font-semibold text-muted-foreground flex items-center justify-between">
          <span>Dominios bloqueados — {filtered.length.toLocaleString()} {debounced && `(de ${counts[activeCat]})`}</span>
          {filtered.length > visible && (
            <button onClick={() => setVisible(v => v + 300)} className="text-primary hover:underline">
              Mostrar más (+300)
            </button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Cargando dominios...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {debounced
                ? `Sin resultados para "${debounced}" en ${activeCat}`
                : `Aún no hay dominios en "${activeCat}". Agrega uno arriba o sube un archivo.`}
            </div>
          ) : (
            visibleItems.map(d => (
              <div
                key={d.domain}
                className="flex items-center justify-between px-3 py-2 border-b border-border last:border-b-0 hover:bg-secondary/60 group"
              >
                <span className="font-mono text-xs text-foreground truncate">{d.domain}</span>
                <button
                  onClick={() => removeOne(d.domain)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all shrink-0"
                  title="Eliminar dominio"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
