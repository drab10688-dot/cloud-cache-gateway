import { useState, useCallback } from "react";
import { FileDown, FileText, Loader2, ShieldCheck, Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getBranding } from "@/lib/branding";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type RangePreset = "24h" | "7d" | "30d" | "90d";

const RANGE_LABELS: Record<RangePreset, { label: string; hours: number }> = {
  "24h": { label: "Últimas 24 horas", hours: 24 },
  "7d":  { label: "Últimos 7 días",  hours: 24 * 7 },
  "30d": { label: "Últimos 30 días", hours: 24 * 30 },
  "90d": { label: "Últimos 90 días", hours: 24 * 90 },
};

const CATEGORY_LABELS: Record<string, string> = {
  manual: "Manual",
  mintic: "MinTIC Colombia",
  coljuegos: "Coljuegos",
  infantil: "Protección Infantil",
};

// CSV helpers
function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

interface ReportData {
  generatedAt: Date;
  rangeHours: number;
  rangeLabel: string;
  ispName: string;
  blocked: { domain: string; category: string }[];
  blockedByCategory: Record<string, number>;
  queryLog: { time: string; client: string; domain: string; reason: string; status: string }[];
  stats: {
    totalQueries: number | string;
    blockedQueries: number | string;
    blockPercent: string;
    avgTimeMs: string;
  };
}

export function MintICReport() {
  const [range, setRange] = useState<RangePreset>("7d");
  const [generating, setGenerating] = useState<"csv" | "pdf" | null>(null);

  const collectData = useCallback(async (rangeHours: number, rangeLabel: string): Promise<ReportData> => {
    const branding = getBranding();
    const since = Date.now() - rangeHours * 60 * 60 * 1000;

    // Parallel fetches — gracefully degrade if any fail
    const [fullRes, statsRes, queryLogRes] = await Promise.allSettled([
      api.getBlocklistFull(),
      api.getAdGuardStats(),
      api.getAdGuardQueryLog(),
    ]);

    // Blocked domains
    const blocked: { domain: string; category: string }[] = [];
    const blockedByCategory: Record<string, number> = {
      manual: 0, mintic: 0, coljuegos: 0, infantil: 0,
    };
    if (fullRes.status === "fulfilled" && Array.isArray(fullRes.value)) {
      for (const item of fullRes.value as any[]) {
        if (item && typeof item.domain === "string") {
          const cat = (["manual", "mintic", "coljuegos", "infantil"].includes(item.category)
            ? item.category : "manual") as string;
          blocked.push({ domain: item.domain, category: cat });
          blockedByCategory[cat] = (blockedByCategory[cat] || 0) + 1;
        }
      }
    }

    // Stats
    const stats = statsRes.status === "fulfilled" ? (statsRes.value as any) : null;
    const totalQueries = stats?.num_dns_queries ?? 0;
    const blockedQueries = stats?.num_blocked_filtering ?? 0;
    const blockPercent = totalQueries
      ? ((blockedQueries / totalQueries) * 100).toFixed(2) + "%"
      : "0%";
    const avgTimeMs = stats?.avg_processing_time
      ? (stats.avg_processing_time * 1000).toFixed(1) + "ms"
      : "—";

    // Query log — filter to blocked only and within range
    const queryLog: ReportData["queryLog"] = [];
    if (queryLogRes.status === "fulfilled") {
      const raw = (queryLogRes.value as any)?.data || (queryLogRes.value as any) || [];
      const arr = Array.isArray(raw) ? raw : [];
      for (const entry of arr) {
        const t = entry?.time ? new Date(entry.time).getTime() : 0;
        if (t < since) continue;
        const reason = entry?.reason || "";
        // Only include blocked entries
        const isBlocked = /Filtered|Blocked|Rule/i.test(String(reason));
        if (!isBlocked) continue;
        queryLog.push({
          time: entry.time ? formatDate(new Date(entry.time)) : "—",
          client: entry?.client || entry?.client_id || "—",
          domain: entry?.question?.name?.replace(/\.$/, "") || entry?.domain || "—",
          reason: String(reason).replace(/^Filtered/, "").replace(/By(Rule)?/, "").trim() || "Bloqueado",
          status: entry?.status || "NXDOMAIN",
        });
      }
    }

    return {
      generatedAt: new Date(),
      rangeHours,
      rangeLabel,
      ispName: branding.ispName,
      blocked,
      blockedByCategory,
      queryLog,
      stats: {
        totalQueries: typeof totalQueries === "number" ? totalQueries : 0,
        blockedQueries: typeof blockedQueries === "number" ? blockedQueries : 0,
        blockPercent,
        avgTimeMs,
      },
    };
  }, []);

  const exportCSV = async () => {
    setGenerating("csv");
    try {
      const cfg = RANGE_LABELS[range];
      const data = await collectData(cfg.hours, cfg.label);
      const lines: string[] = [];

      // Header section
      lines.push("# REPORTE DE BLOQUEO DNS - Cumplimiento MinTIC Colombia");
      lines.push(`# ISP: ${data.ispName}`);
      lines.push(`# Generado: ${formatDate(data.generatedAt)}`);
      lines.push(`# Rango: ${data.rangeLabel}`);
      lines.push("");

      // Section 1: Stats
      lines.push("## ESTADISTICAS GLOBALES");
      lines.push("metrica,valor");
      lines.push(`Total consultas DNS,${data.stats.totalQueries}`);
      lines.push(`Total bloqueadas,${data.stats.blockedQueries}`);
      lines.push(`Porcentaje bloqueado,${data.stats.blockPercent}`);
      lines.push(`Tiempo promedio,${data.stats.avgTimeMs}`);
      lines.push(`Total dominios en lista,${data.blocked.length}`);
      lines.push("");

      // Section 2: Blocked by category
      lines.push("## DOMINIOS BLOQUEADOS POR CATEGORIA");
      lines.push("categoria,cantidad");
      for (const [cat, count] of Object.entries(data.blockedByCategory)) {
        lines.push(`${csvEscape(CATEGORY_LABELS[cat] || cat)},${count}`);
      }
      lines.push("");

      // Section 3: Full blocked list
      lines.push("## LISTA COMPLETA DE DOMINIOS BLOQUEADOS");
      lines.push("dominio,categoria,fundamento_legal");
      const legalReason: Record<string, string> = {
        mintic: "Resolucion MinTIC - Bloqueo obligatorio ISP",
        coljuegos: "Coljuegos - Apuestas no autorizadas",
        infantil: "Proteccion infantil - Ley 1336/2009",
        manual: "Lista personalizada del ISP",
      };
      for (const b of data.blocked) {
        lines.push(`${csvEscape(b.domain)},${csvEscape(CATEGORY_LABELS[b.category] || b.category)},${csvEscape(legalReason[b.category] || "")}`);
      }
      lines.push("");

      // Section 4: Query log (blocked only)
      lines.push("## CONSULTAS DNS BLOQUEADAS (LOG)");
      lines.push("fecha_hora,ip_cliente,dominio,razon,estado");
      for (const q of data.queryLog) {
        lines.push([q.time, q.client, q.domain, q.reason, q.status].map(csvEscape).join(","));
      }

      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      downloadFile(blob, `reporte_mintic_${data.ispName.replace(/\s+/g, "_")}_${todayStamp()}.csv`);

      toast({
        title: "✓ CSV generado",
        description: `${data.blocked.length} dominios + ${data.queryLog.length} consultas bloqueadas`,
      });
    } catch (e: any) {
      toast({ title: "Error generando CSV", description: e?.message || "Error", variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const exportPDF = async () => {
    setGenerating("pdf");
    try {
      const cfg = RANGE_LABELS[range];
      const data = await collectData(cfg.hours, cfg.label);
      const branding = getBranding();

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      // ── Header bar
      doc.setFillColor(20, 184, 166); // teal/cyan brand
      doc.rect(0, 0, pageWidth, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(data.ispName, 14, 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Reporte de Bloqueo DNS — Cumplimiento MinTIC Colombia", 14, 21);

      // ── Metadata block
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(9);
      let y = 36;
      doc.text(`Generado: ${formatDate(data.generatedAt)}`, 14, y);
      doc.text(`Rango: ${data.rangeLabel}`, 14, y + 5);
      doc.text(`Marco legal: Resolución MinTIC, Ley 1336/2009 (protección infantil), Coljuegos`, 14, y + 10);

      // ── Section: Statistics
      y += 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 184, 166);
      doc.text("1. Estadísticas Globales", 14, y);
      doc.setTextColor(60, 60, 60);

      autoTable(doc, {
        startY: y + 3,
        head: [["Métrica", "Valor"]],
        body: [
          ["Total consultas DNS",      String(data.stats.totalQueries.toLocaleString?.() ?? data.stats.totalQueries)],
          ["Consultas bloqueadas",     String(data.stats.blockedQueries.toLocaleString?.() ?? data.stats.blockedQueries)],
          ["Porcentaje bloqueado",     data.stats.blockPercent],
          ["Tiempo promedio respuesta", data.stats.avgTimeMs],
          ["Total dominios en lista",   data.blocked.length.toLocaleString()],
        ],
        theme: "grid",
        headStyles: { fillColor: [20, 184, 166], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        styles: { cellPadding: 2 },
      });

      // ── Section: Blocked by category
      y = (doc as any).lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 184, 166);
      doc.text("2. Dominios Bloqueados por Categoría", 14, y);
      doc.setTextColor(60, 60, 60);

      autoTable(doc, {
        startY: y + 3,
        head: [["Categoría", "Cantidad", "Fundamento"]],
        body: Object.entries(data.blockedByCategory).map(([cat, count]) => [
          CATEGORY_LABELS[cat] || cat,
          count.toLocaleString(),
          cat === "mintic" ? "Resolución MinTIC"
          : cat === "coljuegos" ? "Coljuegos — apuestas"
          : cat === "infantil" ? "Ley 1336/2009"
          : "Lista personalizada ISP",
        ]),
        theme: "grid",
        headStyles: { fillColor: [20, 184, 166], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9 },
      });

      // ── Section: Blocked domains list (paginated)
      y = (doc as any).lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 184, 166);
      doc.text(`3. Lista de Dominios Bloqueados (${data.blocked.length.toLocaleString()})`, 14, y);
      doc.setTextColor(60, 60, 60);

      // Limit to 1500 rows in PDF (CSV has all). PDFs of 100k+ rows are useless.
      const MAX_PDF_DOMAINS = 1500;
      const pdfDomains = data.blocked.slice(0, MAX_PDF_DOMAINS);

      autoTable(doc, {
        startY: y + 3,
        head: [["#", "Dominio", "Categoría"]],
        body: pdfDomains.map((b, i) => [
          String(i + 1),
          b.domain,
          CATEGORY_LABELS[b.category] || b.category,
        ]),
        theme: "striped",
        headStyles: { fillColor: [20, 184, 166], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 7 },
        columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 35 } },
      });

      if (data.blocked.length > MAX_PDF_DOMAINS) {
        y = (doc as any).lastAutoTable.finalY + 4;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.text(
          `Mostrando ${MAX_PDF_DOMAINS.toLocaleString()} de ${data.blocked.length.toLocaleString()} dominios. Lista completa en el CSV.`,
          14, y,
        );
      }

      // ── Section: Query log (blocked only)
      doc.addPage();
      y = 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 184, 166);
      doc.text(`4. Consultas DNS Bloqueadas (${data.queryLog.length})`, 14, y);
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Eventos reales registrados por AdGuard Home en el rango seleccionado.", 14, y + 5);

      if (data.queryLog.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Sin eventos registrados en el rango. AdGuard puede tener retención corta del query log.", 14, y + 14);
      } else {
        const MAX_LOG = 800;
        const logRows = data.queryLog.slice(0, MAX_LOG);
        autoTable(doc, {
          startY: y + 9,
          head: [["Fecha", "Cliente", "Dominio", "Razón"]],
          body: logRows.map(q => [q.time, q.client, q.domain, q.reason]),
          theme: "striped",
          headStyles: { fillColor: [20, 184, 166], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 7 },
          columnStyles: {
            0: { cellWidth: 38 },
            1: { cellWidth: 32 },
            3: { cellWidth: 35 },
          },
        });
      }

      // ── Footer with page numbers
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        const pageH = doc.internal.pageSize.getHeight();
        doc.text(
          `${data.ispName} — Reporte MinTIC — Página ${i} de ${totalPages}`,
          pageWidth / 2, pageH - 8, { align: "center" },
        );
      }

      doc.save(`reporte_mintic_${data.ispName.replace(/\s+/g, "_")}_${todayStamp()}.pdf`);

      toast({
        title: "✓ PDF generado",
        description: `${data.blocked.length} dominios + ${data.queryLog.length} consultas`,
      });
    } catch (e: any) {
      toast({ title: "Error generando PDF", description: e?.message || "Error", variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="card-glow rounded-lg p-5 mb-6 border border-primary/20">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-md bg-primary/20">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Reporte de Cumplimiento MinTIC</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Descarga evidencia formal de bloqueo DNS para auditorías regulatorias (MinTIC / Coljuegos / Ley 1336)
          </p>
        </div>
      </div>

      {/* Range selector */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Rango del reporte</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-2 rounded-md border text-xs font-medium transition-all ${
                range === r
                  ? "bg-primary/15 border-primary text-foreground"
                  : "bg-secondary border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {RANGE_LABELS[r].label}
            </button>
          ))}
        </div>
      </div>

      {/* Content preview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-xs">
        <div className="flex items-start gap-2 p-3 rounded-md bg-secondary/40 border border-border">
          <Filter className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground mb-0.5">Incluye</p>
            <p className="text-muted-foreground">Estadísticas globales, dominios por categoría, lista completa y consultas bloqueadas</p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-md bg-secondary/40 border border-border">
          <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground mb-0.5">Marco legal</p>
            <p className="text-muted-foreground">Resolución MinTIC, Ley 1336/2009, Coljuegos — fundamento citado por dominio</p>
          </div>
        </div>
      </div>

      {/* Download buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          onClick={exportCSV}
          disabled={generating !== null}
          variant="outline"
          className="gap-2"
        >
          {generating === "csv" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          Descargar CSV (todos los datos)
        </Button>
        <Button
          onClick={exportPDF}
          disabled={generating !== null}
          className="gap-2"
        >
          {generating === "pdf" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          Descargar PDF (formal con branding)
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        💡 El PDF se firma con el nombre del ISP configurado en <strong className="text-foreground">Configuración → Branding</strong>.
        El CSV contiene la lista completa sin truncar; el PDF muestra los primeros 1.500 dominios para mantener el archivo manejable.
      </p>
    </div>
  );
}
