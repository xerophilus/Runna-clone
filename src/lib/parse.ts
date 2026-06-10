/**
 * Input parsing for onboarding (spec §5.1). Lenient where possible — every
 * fitness input is skippable, so a parse failure should read as "skipped",
 * never block plan generation.
 */

const KM_PER_MI = 1.609344;

/** "45:30" or "3:25:00" → seconds. Returns null on garbage. */
export function parseClock(input: string): number | null {
  const parts = input.trim().split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [m, s] = nums as [number, number];
    if (s >= 60) return null;
    return m * 60 + s;
  }
  const [h, m, s] = nums as [number, number, number];
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}

/** "9:30" pace in the user's units → sec/km. */
export function parsePaceToSecPerKm(input: string, units: "metric" | "imperial"): number | null {
  const secs = parseClock(input);
  if (secs === null || secs < 120 || secs > 1200) return null;
  return units === "imperial" ? Math.round(secs / KM_PER_MI) : secs;
}

/** "YYYY-MM-DD", must be a real future-ish date. */
export function parseISODateInput(input: string): string | null {
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/** Weekly distance in the user's units → meters. */
export function parseWeeklyDistanceToMeters(
  input: string,
  units: "metric" | "imperial",
): number | null {
  const n = Number(input.trim());
  if (Number.isNaN(n) || n <= 0 || n > 400) return null;
  const km = units === "imperial" ? n * KM_PER_MI : n;
  return Math.round(km * 1000);
}

/** Bodyweight-ish lift number in the user's units → kg. */
export function parseLoadToKg(input: string, units: "metric" | "imperial"): number | null {
  const n = Number(input.trim());
  if (Number.isNaN(n) || n <= 0 || n > 600) return null;
  return units === "imperial" ? Math.round(n / 2.20462) : Math.round(n);
}
