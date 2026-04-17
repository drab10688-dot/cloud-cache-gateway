/**
 * WISP QoS tuning commands.
 *
 * Usa EXACTAMENTE el mismo mecanismo que MikroTikPanel: `step:N:serverIp`.
 * Esto garantiza que el backend ejecute los mismos comandos que ya funcionan
 * en los pasos numerados de la sección principal.
 */

export type ImprovementKey = "mss" | "quic" | "conntrack" | "fqcodel";

const TAG_FQCODEL_NAME = "fq-codel-wan";

// Map each improvement to the backend step alias.
// Estos steps ya están definidos en el backend (server.js) y funcionan.
const STEP_FOR: Record<ImprovementKey, number> = {
  mss: 7,
  quic: 3,
  conntrack: 8,
  fqcodel: 10,
};

// Apply: usa step alias — mismo mecanismo que MikroTikPanel (que sí funciona).
export function buildApplyCommands(key: ImprovementKey, serverIp: string): string[] {
  const step = STEP_FOR[key];
  return [`step:${step}:${serverIp || "127.0.0.1"}`];
}

// Rollback: REST-based. El backend ya conoce este passthrough.
export function buildRollbackCommands(key: ImprovementKey): string[] {
  const enc = (obj: Record<string, unknown>) => JSON.stringify(obj);
  switch (key) {
    case "mss":
      return [
        `DELETE /rest/ip/firewall/mangle?comment=${encodeURIComponent("NetAdmin: MSS Clamp forward")}`,
        `DELETE /rest/ip/firewall/mangle?comment=${encodeURIComponent("NetAdmin: MSS Clamp postrouting")}`,
      ];
    case "quic":
      return [
        `DELETE /rest/ip/firewall/filter?comment=${encodeURIComponent("NetAdmin: Bloquear QUIC")}`,
        `DELETE /rest/ip/firewall/filter?comment=${encodeURIComponent("NetAdmin: Bloquear HTTP/3 alt")}`,
      ];
    case "conntrack":
      return [
        `POST /rest/ip/firewall/connection/tracking/set ${enc({
          "udp-timeout": "10s",
          "udp-stream-timeout": "3m",
          "icmp-timeout": "10s",
          "generic-timeout": "10m",
          "tcp-established-timeout": "1d",
        })}`,
      ];
    case "fqcodel":
      return [`DELETE /rest/queue/type?name=${encodeURIComponent(TAG_FQCODEL_NAME)}`];
  }
}

// ── DETECT ──
export interface DetectProbe {
  key: ImprovementKey;
  cmd: string;
  match: (rows: unknown[]) => boolean;
}

const hasCommentFlexible = (rows: unknown[], needle: string) =>
  Array.isArray(rows) &&
  rows.some((r) => {
    const comment = (r as { comment?: string } | null)?.comment;
    return typeof comment === "string" && comment.includes(needle);
  });

export const DETECT_PROBES: DetectProbe[] = [
  {
    key: "mss",
    cmd: "GET /rest/ip/firewall/mangle",
    match: (rows) => hasCommentFlexible(rows, "MSS Clamp"),
  },
  {
    key: "quic",
    cmd: "GET /rest/ip/firewall/filter",
    match: (rows) => hasCommentFlexible(rows, "QUIC") || hasCommentFlexible(rows, "HTTP/3"),
  },
  {
    key: "conntrack",
    cmd: "GET /rest/ip/firewall/connection/tracking",
    match: (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return false;
      const row = rows[0] as Record<string, string> | null;
      const val = row?.["tcp-established-timeout"];
      if (!val) return false;
      return val.includes("2h") || val === "7200s" || val.startsWith("2h");
    },
  },
  {
    key: "fqcodel",
    cmd: "GET /rest/queue/type",
    match: (rows) =>
      Array.isArray(rows) &&
      rows.some((r) => (r as { name?: string } | null)?.name === TAG_FQCODEL_NAME),
  },
];
