import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { LOG_PREFIX } from './shared/app.js';
import { isStatus, type Status } from './shared/status.js';

export type ImageKind = 'baseline' | 'current' | 'diff';

const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Turns a URL into a stable, filesystem-safe id: host without "www.", path and query,
 * lowercased, with everything else collapsed to dashes. Example:
 * "https://www.example.com/blog/?page=2" -> "example-com-blog-page-2".
 */
export function slugFromUrl(url: string): string {
  const parsed = new URL(url);
  const raw = `${parsed.host.replace(/^www\./, '')}${parsed.pathname}${parsed.search}`;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '');
  return slug || 'site';
}

export function screenshotsDir(storageDir: string): string {
  return join(storageDir, 'screenshots');
}

export function statePath(storageDir: string): string {
  return join(storageDir, 'state.json');
}

/** Path of an image relative to the screenshots directory, e.g. "example-com/desktop/diff.png". */
export function screenshotRelPath(siteId: string, viewport: string, kind: ImageKind): string {
  for (const segment of [siteId, viewport]) {
    if (!SEGMENT_PATTERN.test(segment)) throw new Error(`Unsafe path segment: "${segment}"`);
  }
  return `${siteId}/${viewport}/${kind}.png`;
}

/** Absolute path of an image; guaranteed to stay inside the screenshots directory. */
export function screenshotPath(storageDir: string, siteId: string, viewport: string, kind: ImageKind): string {
  const root = resolve(screenshotsDir(storageDir));
  const full = resolve(root, screenshotRelPath(siteId, viewport, kind));
  const rel = relative(root, full);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) throw new Error(`Path escapes storage: ${full}`);
  return full;
}

export interface ViewportState {
  status: Status;
  similarity: number | null;
  diffPixels: number | null;
  checkedAt: string | null;
  baselineAt: string | null;
  error: string | null;
}

export interface StateFile {
  version: 1;
  sites: Record<string, Record<string, ViewportState>>;
}

export function emptyViewportState(): ViewportState {
  return { status: 'unknown', similarity: null, diffPixels: null, checkedAt: null, baselineAt: null, error: null };
}

/**
 * Persists per-site, per-viewport results in a single JSON file. Every update re-reads the file and
 * writes it back atomically (temp file + rename), so a crash never leaves half-written JSON. Re-reading
 * keeps a CLI run and a server process sharing the same storage from overwriting each other's results
 * in the common case; it is not a lock, so two writes at the same instant can still race.
 */
export class StateStore {
  readonly file: string;

  constructor(storageDir: string) {
    this.file = statePath(storageDir);
  }

  read(): StateFile {
    if (!existsSync(this.file)) return { version: 1, sites: {} };
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StateFile>;
      return { version: 1, sites: sanitizeSites(parsed.sites) };
    } catch {
      console.warn(`${LOG_PREFIX} ${this.file} is not valid JSON; starting with an empty state.`);
      return { version: 1, sites: {} };
    }
  }

  get(siteId: string, viewport: string): ViewportState {
    return this.read().sites[siteId]?.[viewport] ?? emptyViewportState();
  }

  update(siteId: string, viewport: string, patch: Partial<ViewportState>): ViewportState {
    const state = this.read();
    const site = (state.sites[siteId] ??= {});
    const next = { ...(site[viewport] ?? emptyViewportState()), ...patch };
    site[viewport] = next;
    this.write(state);
    return next;
  }

  private write(state: StateFile): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.file);
  }
}

function sanitizeSites(input: unknown): StateFile['sites'] {
  const sites: StateFile['sites'] = {};
  if (!input || typeof input !== 'object') return sites;
  for (const [siteId, viewports] of Object.entries(input as Record<string, unknown>)) {
    if (!viewports || typeof viewports !== 'object') continue;
    sites[siteId] = {};
    for (const [name, value] of Object.entries(viewports as Record<string, unknown>)) {
      const entry = { ...emptyViewportState(), ...(value as Partial<ViewportState>) };
      if (!isStatus(entry.status)) entry.status = 'unknown';
      sites[siteId][name] = entry;
    }
  }
  return sites;
}
