/**
 * WISP QoS tuning commands.
 *
 * Strategy: try `step:N:serverIp` first (same proven mechanism MikroTikPanel
 * uses). If the backend doesn't know that step ("no definido"), fall back to
 * the equivalent raw REST commands. This works on any backend version
 * without needing reinstall.
 */

import type { MikroTikCommand } from "./mikrotik-commands";
import { getStepCommands } from "./mikrotik-commands";

export type ImprovementKey = "mss" | "quic" | "conntrack" | "fqcodel";

const TAG_MSS_FWD = "NetAdmin: MSS Clamp forward";
const TAG_MSS_POST = "NetAdmin: MSS Clamp postrouting";
const TAG_QUIC_443 = "NetAdmin: Bloquear QUIC";
const TAG_QUIC_80 = "NetAdmin: Bloquear HTTP/3 alt";
const TAG_FQCODEL_NAME = "fq-codel-wan";

// Map each improvement to the backend step alias.
const STEP_FOR: Record<ImprovementKey, number> = {
  mss: 7,
  quic: 3,
  conntrack: 8,
  fqcodel: 10,
};

const enc = (obj: Record<string, unknown>) => JSON.stringify(obj);

// Convert a MikroTikCommand to the raw REST string the backend passthrough understands.
function cmdToRest(c: MikroTikCommand): string {
  if (c.method === "GET" || c.method === "DELETE") {
    return `${c.method} ${c.endpoint}`;
  }
  return `${c.method} ${c.endpoint} ${enc(c.body || {})}`;
}

// Primary apply: step alias (same as MikroTikPanel uses).
export function buildApplyCommands(key: ImprovementKey, serverIp: string): string[] {
  const step = STEP_FOR[key];
  return [`step:${step}:${serverIp || "127.0.0.1"}`];
}

// Fallback apply: raw REST commands equivalent to the step.
// Used when the backend reports the step is not defined.
export function buildApplyFallbackCommands(key: ImprovementKey, serverIp: string): string[] {
  const step = STEP_FOR[key];
  const cmds = getStepCommands(step, serverIp || "127.0.0.1");
  return cmds.map(cmdToRest);
}

// Detect if an error message means "step not implemented in backend"
export function isStepNotDefinedError(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes("no definido") ||
    m.includes("not defined") ||
    m.includes("not implemented") ||
    m.includes("desconocido") ||
    m.includes("unknown step") ||
    m.includes("paso") && m.includes("no")
  );
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

// Backwards-compat exports
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
