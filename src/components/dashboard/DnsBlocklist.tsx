import { useState } from "react";
import { Shield, Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialBlocklist = [
  { domain: "example-blocked.com", reason: "MinTIC Colombia", active: true },
  { domain: "sitio-ilegal-1.co", reason: "MinTIC Colombia", active: true },
  { domain: "apuestas-ilegales.com", reason: "Coljuegos", active: true },
  { domain: "torrent-prohibido.net", reason: "MinTIC Colombia", active: true },
  { domain: "streaming-pirata.co", reason: "DNDA", active: true },
  { domain: "casino-sin-licencia.com", reason: "Coljuegos", active: false },
];

export function DnsBlocklist() {
  const [blocklist, setBlocklist] = useState(initialBlocklist);
  const [newDomain, setNewDomain] = useState("");
  const [search, setSearch] = useState("");

  const filtered = blocklist.filter((b) => b.domain.includes(search.toLowerCase()));

  const addDomain = () => {
    if (!newDomain.trim()) return;
    setBlocklist([{ domain: newDomain.trim().toLowerCase(), reason: "Manual", active: true }, ...blocklist]);
    setNewDomain("");
  };

  const removeDomain = (domain: string) => {
    setBlocklist(blocklist.filter((b) => b.domain !== domain));
  };

  const toggleDomain = (domain: string) => {
    setBlocklist(blocklist.map((b) => (b.domain === domain ? { ...b, active: !b.active } : b)));
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">DNS y Bloqueo de URLs</h2>
        <p className="text-sm text-muted-foreground mt-1">Unbound DNS con lista de bloqueo — URLs exigidas por MinTIC Colombia</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Dominios bloqueados", value: blocklist.filter((b) => b.active).length.toString(), color: "text-warning" },
          { label: "Queries DNS hoy", value: "14,832", color: "text-primary" },
          { label: "Queries bloqueadas", value: "312", color: "text-destructive" },
        ].map((s) => (
          <div key={s.label} className="card-glow rounded-lg p-4 text-center">
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card-glow rounded-lg p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar dominio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Agregar dominio..."
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
            <Button onClick={addDomain} size="icon" className="shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.domain}
              className={`flex items-center justify-between px-4 py-3 rounded-md border transition-all ${
                item.active ? "border-border bg-secondary/50" : "border-border/50 bg-muted/30 opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Shield className={`h-4 w-4 ${item.active ? "text-warning" : "text-muted-foreground"}`} />
                <div>
                  <span className="text-sm font-mono text-foreground">{item.domain}</span>
                  <span className="text-xs text-muted-foreground ml-3">{item.reason}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleDomain(item.domain)}
                  className={`text-xs px-2 py-1 rounded font-mono ${
                    item.active ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {item.active ? "Activo" : "Inactivo"}
                </button>
                <button onClick={() => removeDomain(item.domain)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
