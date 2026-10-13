import { describe, expect, it } from 'vitest';
import {
  classifySimilarity,
  countByStatus,
  formatSimilarity,
  formatThreshold,
  isFailure,
  isStale,
  isStatus,
  needsAttention,
  STATUSES,
  worstStatus,
} from '../src/shared/status.js';

describe('classifySimilarity', () => {
  it('passes at or above the minimum and fails below it', () => {
    expect(classifySimilarity(0.98, 0.98)).toBe('ok');
    expect(classifySimilarity(1, 0.98)).toBe('ok');
    expect(classifySimilarity(0.9799, 0.98)).toBe('changed');
  });
});

describe('worstStatus', () => {
  it('picks the most urgent status', () => {
    expect(worstStatus(['ok', 'changed', 'baseline_updated'])).toBe('changed');
    expect(worstStatus(['changed', 'unavailable'])).toBe('unavailable');
    expect(worstStatus(['ok', 'unknown'])).toBe('unknown');
    expect(worstStatus(['ok', 'ok'])).toBe('ok');
  });

  it('returns unknown for no statuses', () => {
    expect(worstStatus([])).toBe('unknown');
  });
});

describe('isFailure / needsAttention', () => {
  it('treats changes, outages, errors and missing baselines as failures', () => {
    const failing = STATUSES.filter(isFailure);
    expect(failing.sort()).toEqual(['changed', 'error', 'no_baseline', 'unavailable']);
  });

  it('also lists never-checked items as needing attention', () => {
    expect(needsAttention('unknown')).toBe(true);
    expect(needsAttention('ok')).toBe(false);
    expect(needsAttention('baseline_updated')).toBe(false);
  });
});

describe('isStale', () => {
  const now = new Date('2026-10-13T12:00:00Z');

  it('flags checks older than the limit', () => {
    expect(isStale('2026-10-10T11:59:00Z', now, 72)).toBe(true);
    expect(isStale('2026-10-10T12:01:00Z', now, 72)).toBe(false);
  });

  it('never flags missing or invalid dates', () => {
    expect(isStale(null, now, 72)).toBe(false);
    expect(isStale('not a date', now, 72)).toBe(false);
  });
});

describe('formatSimilarity', () => {
  it('rounds down so near-identical images never show 100.00%', () => {
    expect(formatSimilarity(1)).toBe('100%');
    expect(formatSimilarity(0.99999)).toBe('99.99%');
    expect(formatSimilarity(0.5)).toBe('50.00%');
    expect(formatSimilarity(null)).toBe('–');
  });
});

describe('formatThreshold', () => {
  it('shows the configured minimum without float noise or trailing zeros', () => {
    expect(formatThreshold(0.98)).toBe('98%');
    expect(formatThreshold(0.995)).toBe('99.5%');
    expect(formatThreshold(0.29)).toBe('29%');
    expect(formatThreshold(1)).toBe('100%');
  });
});

describe('countByStatus', () => {
  it('counts every status and reports unused ones as 0', () => {
    const counts = countByStatus(['ok', 'ok', 'changed', 'no_baseline']);
    expect(counts).toMatchObject({ ok: 2, changed: 1, no_baseline: 1, unavailable: 0, error: 0 });
    expect(Object.keys(counts).sort()).toEqual([...STATUSES].sort());
  });
});

describe('isStatus', () => {
  it('accepts known statuses only', () => {
    expect(isStatus('ok')).toBe(true);
    expect(isStatus('base_recreated')).toBe(false);
    expect(isStatus(3)).toBe(false);
  });
});
