import { useState, useEffect, useCallback, useRef } from "react";
import { Shield, Plus, Trash2, Search, Baby, AlertTriangle, Globe, RefreshCw, Clock, CheckCircle, Loader2, Upload, FileText, XCircle } from "lucide-react";
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
    .replace(/\^$/, "")
    .replace(/^\.+|\.+$/g, "");
}

export function DnsBlocklist() {
  const [blocklist, setBlocklist] = useState<BlockedDomain[]>([]);
  const [adguardStats, setAdguardStats] = useState<any>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newCategory, setNewCategory] = useState<FilterCategory>("manual");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<FilterCategory>("all");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updating, setUpdating] = useState(false);

  // Upload state
  const [uploadCategory, setUploadCategory] = useState<FilterCategory>("mintic");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [domains, stats, updStatus] = await Promise.all([
        api.getBlocklist(),
        api.getAdGuardStats().catch(() => null),
        api.getBlocklistUpdateStatus().catch(() => null),
      ]);
      const mapped: BlockedDomain[] = (domains as string[]).map((d: string) => ({
        domain: d, reason: "Lista local", category: "manual" as FilterCategory, active: true,
      }));
      setBlocklist(mapped);
      setAdguardStats(stats);
      if (updStatus) setUpdateStatus(updStatus);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addDomain = async () => {
    const normalized = normalizeDomainInput(newDomain);
    if (!normalized) return;
    try {
      await api.addToBlocklist(normalized);
      const reasons: Record<string, string> = { mintic: "MinTIC", infantil: "Protección infantil", coljuegos: "Coljuegos", manual: "Manual" };
      setBlocklist([{ domain: normalized, reason: reasons[newCategory] || "Manual", category: newCategory, active: true }, ...blocklist.filter(item => item.domain !== normalized)]);
      setNewDomain("");
    } catch {}
  };

  const removeDomain = async (domain: string) => {
    try {
      await api.removeFromBlocklist(domain);
      setBlocklist(blocklist.filter(b => b.domain !== domain));
    } catch {}
  };

  const triggerUpdate = async () => {
    setUpdating(true);
    try {
      await api.triggerBlocklistUpdate();
      setTimeout(async () => {
        try { const s = await api.getBlocklistUpdateStatus(); setUpdateStatus(s); } catch {}
        setUpdating(false);
      }, 10000);
    } catch { setUpdating(false); }
  };

  // File upload handler
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadResult(null);

    let totalAdded = 0;
    let totalDuplicates = 0;
    let totalInvalid = 0;
    let totalParsed = 0;
    const existingDomains = new Set(blocklist.map(b => b.domain));

    for (const file of Array.from(files)) {
      try {
        const content = await file.text();
        const domains = parseDomains(content);
        totalParsed += domains.length;

        const reasons: Record<string, string> = { mintic: "MinTIC", infantil: "Protección infantil", coljuegos: "Coljuegos", manual: "Manual" };

        for (const domain of domains) {
          if (existingDomains.has(domain)) {
            totalDuplicates++;
            continue;
          }
          try {
            await api.addToBlocklist(domain);
            existingDomains.add(domain);
            totalAdded++;
          } catch {
            totalInvalid++;
          }
        }
      } catch {
        totalInvalid += 1;
      }
    }

    setUploadResult({
      total: totalParsed,
      added: totalAdded,
      duplicates: totalDuplicates,
      invalid: totalInvalid,
      category: uploadCategory,
    });
    setUploading(false);
    fetchData(); // Refresh list
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
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
        <p className="text-sm text-muted-foreground mt-1">AdGuard + Unbound — Cumplimiento ISP Colombia (MinTIC / Coljuegos)</p>
      </div>

      {/* Upload MinTIC/Coljuegos lists */}
      <div className="card-glow rounded-lg p-5 mb-6 border-2 border-dashed border-warning/40">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-warning/20">
            <Upload className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Cargar Listas MinTIC / Coljuegos</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sube los archivos TXT o CSV que entrega el MinTIC con los dominios a bloquear para cumplir la normativa ISP
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <select
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value as FilterCategory)}
            className="bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground"
          >
            <option value="mintic">📋 MinTIC — Resolución de bloqueo</option>
            <option value="coljuegos">🎰 Coljuegos — Apuestas ilegales</option>
            <option value="infantil">👶 Protección infantil</option>
            <option value="manual">📝 Lista personalizada</option>
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50 hover:bg-secondary/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.text,.lst,.hosts"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-foreground font-medium">Procesando dominios...</p>
              <p className="text-xs text-muted-foreground">Limpiando, deduplicando y aplicando a AdGuard</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-foreground font-medium">
                Arrastra archivos aquí o haz clic para seleccionar
              </p>
              <p className="text-xs text-muted-foreground">
                Soporta: TXT, CSV, formato hosts (0.0.0.0 dominio.com), un dominio por línea
              </p>
            </div>
          )}
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className="mt-4 p-4 rounded-md bg-secondary/50 border border-border animate-slide-in">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span className="text-sm font-semibold text-foreground">Lista procesada</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-foreground">{uploadResult.total}</p>
                <p className="text-xs text-muted-foreground">Dominios leídos</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-success">{uploadResult.added}</p>
                <p className="text-xs text-muted-foreground">Agregados</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-warning">{uploadResult.duplicates}</p>
                <p className="text-xs text-muted-foreground">Duplicados</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-destructive">{uploadResult.invalid}</p>
                <p className="text-xs text-muted-foreground">Inválidos</p>
              </div>
            </div>
            <button onClick={() => setUploadResult(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
              Cerrar
            </button>
          </div>
        )}
      </div>

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
          <Button onClick={triggerUpdate} disabled={updating} variant="outline" className="gap-2">
            {updating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Actualizando...</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Actualizar ahora</>
            )}
          </Button>
        </div>
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
