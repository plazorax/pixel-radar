import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseConfig } from '../src/config.js';
import { tempDir } from './helpers.js';

const minimal = { groups: { Main: ['https://example.com/'] } };

function issuesOf(raw: unknown): string[] {
  try {
    parseConfig(raw, '/base');
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }
  throw new Error('expected a ConfigError');
}

describe('parseConfig', () => {
  it('fills defaults for a minimal config', () => {
    const config = parseConfig(minimal, '/base');
    expect(config.storageDir).toBe(resolve('/base', 'data'));
    expect(config.minSimilarity).toBe(0.98);
    expect(config.pixelThreshold).toBe(0.1);
    expect(config.retries).toBe(1);
    expect(config.concurrency).toBe(2);
    expect(config.staleAfterHours).toBe(72);
    expect(config.schedule).toBeNull();
    expect(config.capture).toEqual({ fullPage: false, timeoutMs: 30000, waitAfterLoadMs: 1000, scroll: true, maxScrollPx: 5000 });
    expect(config.sites).toEqual([
      {
        id: 'example-com',
        url: 'https://example.com/',
        name: 'example.com',
        group: 'Main',
        viewports: [{ name: 'desktop', width: 1440, height: 900 }],
        minSimilarity: 0.98,
        hide: [],
        mask: [],
      },
    ]);
  });

  it('resolves storageDir against the config folder and keeps absolute paths', () => {
    expect(parseConfig({ ...minimal, storageDir: '../shots' }, '/srv/app').storageDir).toBe(resolve('/srv/app/../shots'));
    expect(parseConfig({ ...minimal, storageDir: '/var/lib/vd' }, '/srv/app').storageDir).toBe(resolve('/var/lib/vd'));
  });

  it('applies per-site overrides and viewport selection', () => {
    const config = parseConfig(
      {
        minSimilarity: 0.9,
        viewports: { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } },
        groups: {
          Shop: [
            'https://example.com/',
            { url: 'https://example.org/cart', id: 'cart', name: 'Cart', viewports: ['mobile'], minSimilarity: 0.99, hide: ['.chat'], mask: ['.price'] },
          ],
        },
      },
      '/base',
    );
    const [first, second] = config.sites;
    expect(first?.viewports.map((viewport) => viewport.name)).toEqual(['desktop', 'mobile']);
    expect(first?.minSimilarity).toBe(0.9);
    expect(second).toMatchObject({ id: 'cart', name: 'Cart', minSimilarity: 0.99, hide: ['.chat'], mask: ['.price'] });
    expect(second?.viewports).toEqual([{ name: 'mobile', width: 390, height: 844 }]);
    expect(config.groups).toHaveLength(1);
  });

  it('rejects unknown keys (catches typos)', () => {
    expect(issuesOf({ ...minimal, minSimilarty: 0.9 }).join()).toMatch(/minSimilarty/);
  });

  it('rejects non-http URLs and out-of-range numbers', () => {
    expect(issuesOf({ groups: { Main: ['ftp://example.com'] } }).join()).toMatch(/groups\.Main\.0/);
    expect(issuesOf({ ...minimal, minSimilarity: 1.5 }).join()).toMatch(/minSimilarity/);
    expect(issuesOf({ ...minimal, viewports: { desktop: { width: 10, height: 900 } } }).join()).toMatch(/width/);
  });

  it('rejects duplicate site ids across groups', () => {
    const issues = issuesOf({ groups: { A: ['https://example.com/'], B: ['https://www.example.com/'] } });
    expect(issues.join()).toMatch(/duplicate site id "example-com"/);
  });

  it('rejects unknown viewports and unsafe ids', () => {
    expect(issuesOf({ groups: { A: [{ url: 'https://example.com/', viewports: ['tablet'] }] } }).join()).toMatch(
      /unknown viewport "tablet"/,
    );
    expect(issuesOf({ groups: { A: [{ url: 'https://example.com/', id: '../etc' }] } }).join()).toMatch(/id/);
  });

  it('validates the cron schedule', () => {
    expect(parseConfig({ ...minimal, schedule: '0 * * * *' }, '/base').schedule).toBe('0 * * * *');
    expect(issuesOf({ ...minimal, schedule: 'every hour' }).join()).toMatch(/schedule/);
  });

  it('rejects empty groups and missing groups', () => {
    expect(issuesOf({ groups: { A: [] } }).join()).toMatch(/groups\.A/);
    expect(issuesOf({}).join()).toMatch(/groups/);
  });
});

describe('loadConfig', () => {
  it('reads a JSON file relative to its own folder', () => {
    const dir = tempDir();
    const file = join(dir, 'sites.json');
    writeFileSync(file, JSON.stringify(minimal));
    const config = loadConfig(file);
    expect(config.configPath).toBe(file);
    expect(config.storageDir).toBe(join(dir, 'data'));
  });

  it('explains how to create a missing config file', () => {
    expect(() => loadConfig(join(tempDir(), 'missing.json'))).toThrow(/sites\.example\.json/);
  });

  it('reports invalid JSON', () => {
    const file = join(tempDir(), 'sites.json');
    writeFileSync(file, '{ nope');
    expect(() => loadConfig(file)).toThrow(ConfigError);
  });
});
