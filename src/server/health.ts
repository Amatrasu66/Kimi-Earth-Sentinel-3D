import { utcnowIso } from "./provenance";

export const SERVICE = "kimi-earth-sentinel-api";
export const VERSION = "1.0.0";
// Instance-local start time, captured at module load. On serverless this is
// the isolate's boot — NOT the deployment time. Never present it as such.
const STARTED_AT_ISO = utcnowIso();

/** Honest liveness payload — no fabricated per-provider claims. */
export function healthPayload() {
  return {
    status: "ok",
    service: SERVICE,
    version: VERSION,
    timestamp: utcnowIso(),
    started_at: STARTED_AT_ISO,
  };
}
