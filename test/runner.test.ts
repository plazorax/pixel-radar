import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { PageUnavailableError, type BrowserHandle, type CaptureRequest } from '../src/capture.js';
import { writePng, type RawImage } from '../src/compare.js';
import { parseConfig, type ResolvedConfig } from '../src/config.js';
import { Runner, SiteBusyError, selectSites } from '../src/runner.js';
import { screenshotPath, StateStore } from '../src/storage.js';
import { setPixel, solid, tempDir } from './helpers.js';

/** Fake browser: "renders" whatever image `page` currently holds, or throws `failure`. */
class FakeBrowser implements BrowserHandle {
  page: RawImage = solid(40, 30);
  failure: Error | null = null;
  calls: CaptureRequest[] = [];
  launches = 0;
  closed = 0;

  async capture(request: CaptureRequest) {
    this.calls.push(request);
    if (this.failure) throw this.failure;
    writePng(request.path, this.page);
  }

  async close() {
    this.closed++;
  }
}

let config: ResolvedConfig;
let store: StateStore;
let browser: FakeBrowser;
let runner: Runner;
let clock: number;

beforeEach(() => {
  config = parseConfig(
    {
      storageDir: tempDir(),
      retries: 1,
      retryDelayMs: 0,
      groups: {
        A: ['https://example.com/', { url: 'https://example.org/', minSimilarity: 0.5 }],
        B: ['https://example.net/'],
      },
    },
    '/',
  );
  store = new StateStore(config.storageDir);
  browser = new FakeBrowser();
  clock = Date.parse('2026-10-13T10:00:00Z');
  runner = new Runner(config, store, {
    launch: async () => {
      browser.launches++;
      return browser;
    },
    now: () => new Date((clock += 1000)),
    sleep: async () => undefined,
    log: () => undefined,
  });
});

const site = (id: string) => selectSites(config, { site: id });

describe('Runner', () => {
  it('reports no_baseline but keeps the capture so it can be accepted', async () => {
    const [result] = await runner.run('check', site('example-com'));
    expect(result).toMatchObject({ status: 'no_baseline', similarity: null, attempts: 1 });
    expect(existsSync(screenshotPath(config.storageDir, 'example-com', 'desktop', 'current'))).toBe(true);
    expect(browser.closed).toBe(1);
  });

  it('goes rebase -> ok -> changed -> accept -> ok', async () => {
    const [rebased] = await runner.run('rebase', site('example-com'));
    expect(rebased?.status).toBe('baseline_updated');
    expect(store.get('example-com', 'desktop')).toMatchObject({ status: 'baseline_updated', checkedAt: null });

    const [ok] = await runner.run('check', site('example-com'));
    expect(ok).toMatchObject({ status: 'ok', similarity: 1, diffPixels: 0 });

    browser.page = solid(40, 30, [0, 0, 0]);
    const [changed] = await runner.run('check', site('example-com'));
    expect(changed).toMatchObject({ status: 'changed', similarity: 0, attempts: 2 });
    expect(existsSync(screenshotPath(config.storageDir, 'example-com', 'desktop', 'diff'))).toBe(true);

    const [accepted] = await runner.run('accept', site('example-com'));
    expect(accepted).toMatchObject({ status: 'ok', similarity: 1 });
    const [again] = await runner.run('check', site('example-com'));
    expect(again?.status).toBe('ok');
  });

  it('uses the per-site minimum similarity', async () => {
    await runner.run('rebase', site('example-org'));
    let page = solid(40, 30);
    for (let x = 0; x < 40; x++) page = setPixel(page, x, 0, [0, 0, 0]); // 1 of 30 rows changes
    browser.page = page;
    const [result] = await runner.run('check', site('example-org'));
    expect(result?.status).toBe('ok');
    expect(result?.similarity).toBeCloseTo(29 / 30, 10);
  });

  it('marks unreachable pages as unavailable after retrying and removes stale images', async () => {
    await runner.run('rebase', site('example-com'));
    await runner.run('check', site('example-com'));
    browser.failure = new PageUnavailableError('HTTP 503');
    const [result] = await runner.run('check', site('example-com'));
    expect(result).toMatchObject({ status: 'unavailable', error: 'HTTP 503', attempts: 2 });
    expect(existsSync(screenshotPath(config.storageDir, 'example-com', 'desktop', 'current'))).toBe(false);
    expect(existsSync(screenshotPath(config.storageDir, 'example-com', 'desktop', 'baseline'))).toBe(true);
  });

  it('reports other capture failures as error', async () => {
    browser.failure = new Error('browser crashed');
    const [result] = await runner.run('check', site('example-com'));
    expect(result?.status).toBe('error');
  });

  it('keeps the old baseline when a rebase capture fails', async () => {
    await runner.run('rebase', site('example-com'));
    browser.failure = new PageUnavailableError('timeout');
    const [result] = await runner.run('rebase', site('example-com'));
    expect(result?.status).toBe('unavailable');
    expect(existsSync(screenshotPath(config.storageDir, 'example-com', 'desktop', 'baseline'))).toBe(true);
  });

  it('refuses to accept when there is no current screenshot', async () => {
    const [result] = await runner.run('accept', site('example-com'));
    expect(result?.error).toMatch(/run a check first/);
    expect(browser.launches).toBe(0);
  });

  it('runs batches with one browser and returns results in site order', async () => {
    const results = await runner.run('check', config.sites);
    expect(results.map((result) => result.siteId)).toEqual(['example-com', 'example-org', 'example-net']);
    expect(browser.launches).toBe(1);
    expect(browser.closed).toBe(1);
  });

  it('releases sites when the browser cannot be launched', async () => {
    const failing = new Runner(config, store, {
      launch: async () => {
        throw new Error('Chromium is not installed');
      },
      log: () => undefined,
    });
    await expect(failing.run('check', config.sites)).rejects.toThrow(/not installed/);
    expect(failing.isBusy('example-com')).toBe(false);
  });

  it('rejects a second run on a busy site', async () => {
    const first = runner.run('check', site('example-com'));
    await expect(runner.run('check', site('example-com'))).rejects.toBeInstanceOf(SiteBusyError);
    await first;
    expect(runner.isBusy('example-com')).toBe(false);
  });
});

describe('selectSites', () => {
  it('filters by group and site id', () => {
    expect(selectSites(config).length).toBe(3);
    expect(selectSites(config, { group: 'A' }).map((s) => s.id)).toEqual(['example-com', 'example-org']);
    expect(selectSites(config, { site: 'example-net' }).map((s) => s.id)).toEqual(['example-net']);
  });

  it('throws on unknown names', () => {
    expect(() => selectSites(config, { group: 'Z' })).toThrow(/Unknown group/);
    expect(() => selectSites(config, { group: 'A', site: 'example-net' })).toThrow(/Unknown site/);
  });
});
