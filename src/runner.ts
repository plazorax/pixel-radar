import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { launchBrowser, PageUnavailableError, type BrowserHandle } from './capture.js';
import { compareFiles } from './compare.js';
import type { ResolvedConfig, SiteConfig, Viewport } from './config.js';
import { classifySimilarity, type Status } from './shared/status.js';
import type { SiteAction } from './shared/types.js';
import { screenshotPath, type StateStore, type ViewportState } from './storage.js';
import { mapLimit, sleep } from './util.js';

export interface ViewportResult {
  siteId: string;
  group: string;
  url: string;
  viewport: string;
  status: Status;
  similarity: number | null;
  diffPixels: number | null;
  error: string | null;
  attempts: number;
}

export interface RunnerDeps {
  launch?: () => Promise<BrowserHandle>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export class SiteBusyError extends Error {
  constructor(siteId: string) {
    super(`Site "${siteId}" is already being processed`);
    this.name = 'SiteBusyError';
  }
}

export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectionError';
  }
}

/** Picks the sites a command applies to: all, one group, or one site id. */
export function selectSites(config: ResolvedConfig, filter: { group?: string; site?: string } = {}): SiteConfig[] {
  let sites = config.sites;
  if (filter.group !== undefined) {
    const group = config.groups.find((candidate) => candidate.name === filter.group);
    if (!group) throw new SelectionError(`Unknown group "${filter.group}"`);
    sites = group.sites;
  }
  if (filter.site !== undefined) {
    sites = sites.filter((site) => site.id === filter.site);
    if (sites.length === 0) throw new SelectionError(`Unknown site id "${filter.site}"`);
  }
  return sites;
}

const RETRYABLE: ReadonlySet<Status> = new Set(['changed', 'unavailable', 'error']);

interface Outcome {
  status: Status;
  similarity: number | null;
  diffPixels: number | null;
  error: string | null;
}

export class Runner {
  private readonly busy = new Set<string>();
  private readonly launch: () => Promise<BrowserHandle>;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: (message: string) => void;

  constructor(
    private readonly config: ResolvedConfig,
    private readonly store: StateStore,
    deps: RunnerDeps = {},
  ) {
    this.launch = deps.launch ?? launchBrowser;
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? sleep;
    this.log = deps.log ?? ((message) => console.log(message));
  }

  isBusy(siteId: string): boolean {
    return this.busy.has(siteId);
  }

  /**
   * Runs an action over the given sites. Sites already being processed (for example by a scheduled
   * run) are skipped; asking for a single busy site throws SiteBusyError.
   */
  async run(
    action: SiteAction,
    sites: readonly SiteConfig[],
    onResult?: (result: ViewportResult) => void,
  ): Promise<ViewportResult[]> {
    const runnable = sites.filter((site) => !this.busy.has(site.id));
    if (sites.length === 1 && runnable.length === 0) throw new SiteBusyError(sites[0]!.id);
    for (const site of sites) {
      if (this.busy.has(site.id)) this.log(`skip ${site.id}: already running`);
    }
    runnable.forEach((site) => this.busy.add(site.id));

    let browser: Promise<BrowserHandle> | undefined;
    const getBrowser = () => (browser ??= this.launch());

    try {
      const perSite = await mapLimit(runnable, this.config.concurrency, async (site) => {
        const results: ViewportResult[] = [];
        for (const viewport of site.viewports) {
          const result =
            action === 'accept'
              ? this.accept(site, viewport)
              : action === 'rebase'
                ? await this.rebase(await getBrowser(), site, viewport)
                : await this.check(await getBrowser(), site, viewport);
          results.push(result);
          onResult?.(result);
        }
        return results;
      });
      return perSite.flat();
    } finally {
      runnable.forEach((site) => this.busy.delete(site.id));
      // A failed launch already rejected the run; closing is best effort either way.
      if (browser) await browser.then((handle) => handle.close()).catch(() => undefined);
    }
  }

  private paths(site: SiteConfig, viewport: Viewport) {
    const dir = this.config.storageDir;
    return {
      baseline: screenshotPath(dir, site.id, viewport.name, 'baseline'),
      current: screenshotPath(dir, site.id, viewport.name, 'current'),
      diff: screenshotPath(dir, site.id, viewport.name, 'diff'),
    };
  }

  private async check(browser: BrowserHandle, site: SiteConfig, viewport: Viewport): Promise<ViewportResult> {
    let attempts = 0;
    let outcome: Outcome;
    for (;;) {
      attempts++;
      outcome = await this.checkOnce(browser, site, viewport);
      if (!RETRYABLE.has(outcome.status) || attempts > this.config.retries) break;
      this.log(`retry ${site.id} [${viewport.name}]: ${outcome.status}, attempt ${attempts + 1}`);
      await this.sleep(this.config.retryDelayMs);
    }
    this.store.update(site.id, viewport.name, { ...outcome, checkedAt: this.now().toISOString() });
    return this.result(site, viewport, outcome, attempts);
  }

  private async checkOnce(browser: BrowserHandle, site: SiteConfig, viewport: Viewport): Promise<Outcome> {
    const paths = this.paths(site, viewport);
    const failed = await this.capture(browser, site, viewport, paths.current);
    if (failed) {
      rmSync(paths.current, { force: true });
      rmSync(paths.diff, { force: true });
      return { ...failed, similarity: null, diffPixels: null };
    }
    if (!existsSync(paths.baseline)) {
      rmSync(paths.diff, { force: true });
      return { status: 'no_baseline', similarity: null, diffPixels: null, error: null };
    }
    try {
      const comparison = compareFiles(paths.baseline, paths.current, paths.diff, {
        pixelThreshold: this.config.pixelThreshold,
      });
      return {
        status: classifySimilarity(comparison.similarity, site.minSimilarity),
        similarity: comparison.similarity,
        diffPixels: comparison.diffPixels,
        error: null,
      };
    } catch (error) {
      return { status: 'error', similarity: null, diffPixels: null, error: (error as Error).message };
    }
  }

  private async rebase(browser: BrowserHandle, site: SiteConfig, viewport: Viewport): Promise<ViewportResult> {
    const paths = this.paths(site, viewport);
    let attempts = 0;
    let failed: { status: Status; error: string } | null;
    for (;;) {
      attempts++;
      failed = await this.capture(browser, site, viewport, paths.baseline);
      if (!failed || attempts > this.config.retries) break;
      await this.sleep(this.config.retryDelayMs);
    }
    if (failed) {
      // The previous baseline (if any) is kept: capture writes through a temp file.
      const outcome = { ...failed, similarity: null, diffPixels: null };
      this.store.update(site.id, viewport.name, { ...outcome, checkedAt: this.now().toISOString() });
      return this.result(site, viewport, outcome, attempts);
    }
    rmSync(paths.current, { force: true });
    rmSync(paths.diff, { force: true });
    const outcome: Outcome = { status: 'baseline_updated', similarity: null, diffPixels: null, error: null };
    this.store.update(site.id, viewport.name, { ...outcome, checkedAt: null, baselineAt: this.now().toISOString() });
    return this.result(site, viewport, outcome, attempts);
  }

  /** Promotes the last captured screenshot to baseline without capturing again. */
  private accept(site: SiteConfig, viewport: Viewport): ViewportResult {
    const paths = this.paths(site, viewport);
    if (!existsSync(paths.current)) {
      const existing: ViewportState = this.store.get(site.id, viewport.name);
      return this.result(
        site,
        viewport,
        { ...existing, error: 'No current screenshot to accept; run a check first' },
        0,
      );
    }
    copyFileSync(paths.current, paths.baseline);
    rmSync(paths.diff, { force: true });
    const outcome: Outcome = { status: 'ok', similarity: 1, diffPixels: 0, error: null };
    this.store.update(site.id, viewport.name, { ...outcome, baselineAt: this.now().toISOString() });
    return this.result(site, viewport, outcome, 0);
  }

  private async capture(
    browser: BrowserHandle,
    site: SiteConfig,
    viewport: Viewport,
    path: string,
  ): Promise<{ status: Status; error: string } | null> {
    try {
      await browser.capture({
        url: site.url,
        viewport,
        settings: this.config.capture,
        hide: site.hide,
        mask: site.mask,
        path,
      });
      return null;
    } catch (error) {
      const status: Status = error instanceof PageUnavailableError ? 'unavailable' : 'error';
      return { status, error: (error as Error).message };
    }
  }

  private result(site: SiteConfig, viewport: Viewport, outcome: Outcome, attempts: number): ViewportResult {
    return {
      siteId: site.id,
      group: site.group,
      url: site.url,
      viewport: viewport.name,
      status: outcome.status,
      similarity: outcome.similarity,
      diffPixels: outcome.diffPixels,
      error: outcome.error,
      attempts,
    };
  }
}
