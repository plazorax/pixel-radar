// Status rules shared by the server, the CLI and the dashboard.
// This module must stay free of Node.js imports so the browser bundle can use it.

export const STATUSES = [
  'unknown',
  'no_baseline',
  'baseline_updated',
  'ok',
  'changed',
  'unavailable',
  'error',
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  unknown: 'Not checked',
  no_baseline: 'No baseline',
  baseline_updated: 'Baseline updated',
  ok: 'OK',
  changed: 'Changed',
  unavailable: 'Unavailable',
  error: 'Error',
};

// Higher number = more urgent. Used to pick the status shown for a site with several viewports.
const SEVERITY: Record<Status, number> = {
  ok: 0,
  baseline_updated: 1,
  unknown: 2,
  no_baseline: 3,
  changed: 4,
  unavailable: 5,
  error: 6,
};

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** A comparison passes when the similarity is at or above the configured minimum. */
export function classifySimilarity(similarity: number, minSimilarity: number): 'ok' | 'changed' {
  return similarity >= minSimilarity ? 'ok' : 'changed';
}

/** The most urgent status of a list; `unknown` for an empty list. */
export function worstStatus(statuses: readonly Status[]): Status {
  let worst: Status | undefined;
  for (const status of statuses) {
    if (worst === undefined || SEVERITY[status] > SEVERITY[worst]) worst = status;
  }
  return worst ?? 'unknown';
}

/** Statuses that make `npm run check` exit non-zero. */
export function isFailure(status: Status): boolean {
  return status === 'changed' || status === 'unavailable' || status === 'error' || status === 'no_baseline';
}

/** Statuses listed under "Needs attention" in the dashboard. */
export function needsAttention(status: Status): boolean {
  return isFailure(status) || status === 'unknown';
}

/** True when the last check is older than `staleAfterHours`. Never-checked items are not stale. */
export function isStale(checkedAt: string | null, now: Date, staleAfterHours: number): boolean {
  if (!checkedAt) return false;
  const time = Date.parse(checkedAt);
  if (Number.isNaN(time)) return false;
  return now.getTime() - time > staleAfterHours * 3_600_000;
}

/**
 * Formats a 0..1 similarity as a percentage. Rounds down, so a page with a handful of
 * changed pixels shows 99.99% instead of a misleading 100.00%.
 */
export function formatSimilarity(similarity: number | null): string {
  if (similarity === null) return '–';
  if (similarity >= 1) return '100%';
  return `${(Math.floor(similarity * 10_000) / 100).toFixed(2)}%`;
}

/** Formats a 0..1 `minSimilarity` threshold as a percentage without trailing zeros, e.g. 99.5%. */
export function formatThreshold(minSimilarity: number): string {
  return `${Number((minSimilarity * 100).toFixed(2))}%`;
}

/** Number of items per status; every status is present, with 0 when unused. */
export function countByStatus(statuses: readonly Status[]): Record<Status, number> {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>;
  for (const status of statuses) counts[status] += 1;
  return counts;
}
