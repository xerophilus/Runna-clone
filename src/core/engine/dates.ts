/**
 * Minimal, timezone-safe ISO date helpers (YYYY-MM-DD), computed in UTC so plan
 * generation is deterministic regardless of where it runs.
 */

const MS_PER_DAY = 86_400_000;

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + days * MS_PER_DAY));
}

export function diffDays(aIso: string, bIso: string): number {
  return Math.round((parseISODate(bIso).getTime() - parseISODate(aIso).getTime()) / MS_PER_DAY);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  // JS getUTCDay: 0 = Sunday … 6 = Saturday. Shift so Monday = 0.
  return (parseISODate(iso).getUTCDay() + 6) % 7;
}

/** The Monday on or before the given date. */
export function mondayOnOrBefore(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}
