import { utcnowIso } from "./provenance";

export const SERVICE = "kimi-earth-sentinel-api";
export const VERSION = "1.0.0";
const STARTED_AT = Date.now();

/** Honest liveness payload — no fabricated per-provider claims. */
export function healthPayload() {
  return {
    status: "ok",
    service: SERVICE,
    version: VERSION,
    timestamp: utcnowIso(),
    uptime_seconds: Math.round((Date.now() - STARTED_AT) / 100) / 10,
  };
}
