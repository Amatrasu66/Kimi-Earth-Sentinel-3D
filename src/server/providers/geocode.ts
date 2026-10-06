/**
 * Timezone approximation — port of backend/app/services/geocode.py.
 * Longitude-only, no DST or political boundaries. Always SIMULATED.
 */
import { utcnowIso } from "../provenance";

export const TZ_NAMES: Record<number, string> = {
  [-12]: "Etc/GMT+12",
  [-11]: "Pacific/Pago_Pago",
  [-10]: "Pacific/Honolulu",
  [-9]: "America/Anchorage",
  [-8]: "America/Los_Angeles",
  [-7]: "America/Denver",
  [-6]: "America/Chicago",
  [-5]: "America/New_York",
  [-4]: "America/Halifax",
  [-3]: "America/Sao_Paulo",
  [-2]: "America/Noronha",
  [-1]: "Atlantic/Azores",
  0: "UTC",
  1: "Europe/Berlin",
  2: "Europe/Athens",
  3: "Europe/Moscow",
  4: "Asia/Dubai",
  5: "Asia/Karachi",
  6: "Asia/Dhaka",
  7: "Asia/Bangkok",
  8: "Asia/Shanghai",
  9: "Asia/Tokyo",
  10: "Australia/Sydney",
  11: "Pacific/Noumea",
  12: "Pacific/Auckland",
};

export function getTimezoneInfo(_lat: number, lon: number) {
  let offsetHours = Math.floor((lon + 180) / 15) - 12;
  offsetHours = Math.max(-12, Math.min(12, offsetHours));
  const sign = offsetHours >= 0 ? "+" : "-";
  const abs = Math.abs(offsetHours).toString().padStart(2, "0");
  return {
    timezone: TZ_NAMES[offsetHours] ?? "UTC",
    offset: `UTC${sign}${abs}:00`,
    local_time: utcnowIso(),
    approximate: true,
  };
}
