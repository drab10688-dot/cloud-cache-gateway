/**
 * REST command sets for WISP QoS tuning improvements.
 * Each improvement has apply / rollback / detect commands formatted as
 * string aliases understood by the VPS backend `/api/mikrotik/execute`
 * endpoint — same format used by the Installer/DockerPanel panels:
 *   "METHOD /rest/path BODY_JSON"
 *
 * Example: 'PUT /rest/ip/firewall/mangle {"chain":"forward",...}'
 *
 * This replaces the previous "wisp:apply:*" aliases that the backend
 * did not recognize ("Comando no soportado por este endpoint").
 */

export type ImprovementKey = "mss" | "quic" | "conntrack" | "fqcodel";

const TAG_MSS_FWD = "NetAdmin WISP: MSS Clamp forward";
const TAG_MSS_POST = "NetAdmin WISP: MSS Clamp postrouting";
const TAG_QUIC_443 = "NetAdmin WISP: Block QUIC 443";
const TAG_QUIC_80 = "NetAdmin WISP: Block HTTP/3 alt 80";
const TAG_FQCODEL_TYPE = "NetAdmin WISP: FQ_CODEL type";

const enc = (obj: Record<string, unknown>) => JSON.stringify(obj);

// ── APPLY ──
export const APPLY_COMMANDS: Record<ImprovementKey, string[]> = {
  mss: [
    `PUT /rest/ip/firewall/mangle ${enc({
      chain: "forward",
      protocol: "tcp",
      "tcp-flags": "syn",
      action: "change-mss",
      "new-mss": "clamp-to-pmtu",
      passthrough: "yes",
      comment: TAG_MSS_FWD,
    })}`,
    `PUT /rest/ip/firewall/mangle ${enc({
      chain: "postrouting",
      protocol: "tcp",
      "tcp-flags": "syn",
      action: "change-mss",
      "new-mss": "clamp-to-pmtu",
      passthrough: "yes",
      comment: TAG_MSS_POST,
    })}`,
  ],
  quic: [
    `PUT /rest/ip/firewall/filter ${enc({
      chain: "forward",
      protocol: "udp",
      "dst-port": "443",
      action: "drop",
      comment: TAG_QUIC_443,
    })}`,
    `PUT /rest/ip/firewall/filter ${enc({
      chain: "forward",
      protocol: "udp",
      "dst-port": "80",
      action: "drop",
      comment: TAG_QUIC_80,
    })}`,
  ],
  conntrack: [
    `POST /rest/ip/firewall/connection/tracking/set ${enc({
      "udp-timeout": "30s",
      "udp-stream-timeout": "120s",
      "icmp-timeout": "10s",
      "generic-timeout": "120s",
      "tcp-close-timeout": "10s",
      "tcp-close-wait-timeout": "10s",
      "tcp-fin-wait-timeout": "10s",
      "tcp-last-ack-timeout": "10s",
      "tcp-time-wait-timeout": "10s",
      "tcp-syn-sent-timeout": "30s",
      "tcp-syn-received-timeout": "10s",
      "tcp-established-timeout": "7200s",
    })}`,
  ],
  fqcodel: [
    // Create queue type fq-codel (kind=pfifo wrapped inside kind=fq-codel). RouterOS v7 syntax.
    `PUT /rest/queue/type ${enc({
      name: "fq-codel-wan",
      kind: "fq-codel",
      "fq-codel-target": "5ms",
      "fq-codel-interval": "100ms",
      "fq-codel-quantum": "1514",
      "fq-codel-limit": "10240",
      "fq-codel-flows": "1024",
      comment: TAG_FQCODEL_TYPE,
    })}`,
  ],
};

// ── ROLLBACK ──
// Uses `find` semantics through the REST helper path `:remove-by-comment` / `:remove-by-name`
// which the VPS backend translates into a print+remove call. If the backend does not yet
// implement these helpers, it will return a clear error (no longer "Comando no soportado").
export const ROLLBACK_COMMANDS: Record<ImprovementKey, string[]> = {
  mss: [
    `DELETE /rest/ip/firewall/mangle?comment=${encodeURIComponent(TAG_MSS_FWD)}`,
    `DELETE /rest/ip/firewall/mangle?comment=${encodeURIComponent(TAG_MSS_POST)}`,
  ],
  quic: [
    `DELETE /rest/ip/firewall/filter?comment=${encodeURIComponent(TAG_QUIC_443)}`,
    `DELETE /rest/ip/firewall/filter?comment=${encodeURIComponent(TAG_QUIC_80)}`,
  ],
  conntrack: [
    // Restore RouterOS defaults
    `POST /rest/ip/firewall/connection/tracking/set ${enc({
      "udp-timeout": "10s",
      "udp-stream-timeout": "3m",
      "icmp-timeout": "10s",
      "generic-timeout": "10m",
      "tcp-close-timeout": "10s",
      "tcp-close-wait-timeout": "10s",
      "tcp-fin-wait-timeout": "10s",
      "tcp-last-ack-timeout": "10s",
      "tcp-time-wait-timeout": "10s",
      "tcp-syn-sent-timeout": "5s",
      "tcp-syn-received-timeout": "5s",
      "tcp-established-timeout": "1d",
    })}`,
  ],
  fqcodel: [
    `DELETE /rest/queue/type?name=${encodeURIComponent("fq-codel-wan")}`,
  ],
};

// ── DETECT ──
// GET endpoints that return an array — non-empty with matching tag/name = active.
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
    match: (rows) => hasCommentFlexible(rows, "Block QUIC") || hasCommentFlexible(rows, "Bloquear QUIC"),
  },
  {
    key: "conntrack",
    cmd: "GET /rest/ip/firewall/connection/tracking",
    match: (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return false;
      const row = rows[0] as Record<string, string> | null;
      // Our applied value uses 7200s (2h) for tcp-established — default is 1d (86400s).
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
      rows.some((r) => (r as { name?: string } | null)?.name === "fq-codel-wan"),
  },
];
