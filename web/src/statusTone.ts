import type { Status } from '../../src/shared/status.ts';

export type Tone = 'ok' | 'changed' | 'warn' | 'neutral';

/** Colour family per status. Only OK, Changed and failures get a colour; the rest stay grey. */
export const STATUS_TONE: Record<Status, Tone> = {
  ok: 'ok',
  changed: 'changed',
  unavailable: 'warn',
  error: 'warn',
  no_baseline: 'neutral',
  baseline_updated: 'neutral',
  unknown: 'neutral',
};

export const TONE_BADGE: Record<Tone, string> = {
  ok: 'border-ok-line bg-ok-soft text-ok',
  changed: 'border-changed-line bg-changed-soft text-changed',
  warn: 'border-warn-line bg-warn-soft text-warn',
  neutral: 'border-neutral-line bg-neutral-soft text-neutral',
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  changed: 'text-changed',
  warn: 'text-warn',
  neutral: 'text-neutral',
};
