/**
 * WISP QoS tuning commands.
 *
 * APPLY uses backend step aliases (`step:N:serverIp`) — same mechanism as
 * MikroTikPanel, which is confirmed to work on both RouterOS v6 and v7.
 *
 * ROLLBACK / DETECT use REST GET/DELETE which only work on v7 with the
 * generic REST passthrough on the backend. On v6 they fail silently and
 * the UI keeps the previous state — apply still works.
 */

export type ImprovementKey = "mss" | "quic" | "conntrack" | "fqcodel";

const TAG_MSS_FWD = "NetAdmin: MSS Clamp forward";
const TAG_MSS_POST = "NetAdmin: MSS Clamp postrouting";
const TAG_QUIC_443 = "NetAdmin: Bloquear QUIC";
const TAG_QUIC_80 = "NetAdmin: Bloquear HTTP/3 alt";
const TAG_FQCODEL_NAME = "fq-codel-wan";

// Map each improvement to the backend step alias that already works.
// `serverIp` is unused by these particular steps but the backend accepts
// the format `step:N:<anything>` and ignores it for steps 3, 7, 8.
const STEP_FOR: Record<ImprovementKey, number> = {
  mss: 7,        // MSS Clamping
  quic: 3,       // Bloquear QUIC + HTTP/3
  conntrack: 8,  // Connection Tracking tuning
  fqcodel: 10,   // FQ_CODEL queue type
};

const enc = (obj: Record<string, unknown>) => JSON.stringify(obj);

// Build apply command list for a given improvement, given a serverIp.
// All keys use backend step aliases (works on RouterOS v6 + v7).
export function buildApplyCommands(key: ImprovementKey, serverIp: string): string[] {
  const step = STEP_FOR[key];
  return [`step:${step}:${serverIp || "127.0.0.1"}`];
}

// Rollback: REST-based. Will work on v7; on v6 the UI surfaces the error.
export function buildRollbackCommands(key: ImprovementKey): string[] {
  switch (key) {
    case "mss":
      return [
        `DELETE /rest/ip/firewall/mangle?comment=${encodeURIComponent(TAG_MSS_FWD)}`,
        `DELETE /rest/ip/firewall/mangle?comment=${encodeURIComponent(TAG_MSS_POST)}`,
      ];
    case "quic":
      return [
        `DELETE /rest/ip/firewall/filter?comment=${encodeURIComponent(TAG_QUIC_443)}`,
        `DELETE /rest/ip/firewall/filter?comment=${encodeURIComponent(TAG_QUIC_80)}`,
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

// Backwards-compat exports (for any code still importing the old constants).
export const APPLY_COMMANDS: Record<ImprovementKey, string[]> = {
  mss: buildApplyCommands("mss", "127.0.0.1"),
  quic: buildApplyCommands("quic", "127.0.0.1"),
  conntrack: buildApplyCommands("conntrack", "127.0.0.1"),
  fqcodel: buildApplyCommands("fqcodel", "127.0.0.1"),
};

export const ROLLBACK_COMMANDS: Record<ImprovementKey, string[]> = {
  mss: buildRollbackCommands("mss"),
  quic: buildRollbackCommands("quic"),
  conntrack: buildRollbackCommands("conntrack"),
  fqcodel: buildRollbackCommands("fqcodel"),
};
