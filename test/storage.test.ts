import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { screenshotPath, screenshotRelPath, slugFromUrl, StateStore, statePath } from '../src/storage.js';
import { tempDir } from './helpers.js';

describe('slugFromUrl', () => {
  it('builds stable, filesystem-safe ids', () => {
    expect(slugFromUrl('https://example.com/')).toBe('example-com');
    expect(slugFromUrl('https://www.Example.com/Blog/Post/')).toBe('example-com-blog-post');
    expect(slugFromUrl('https://example.com/search?q=shoes&page=2')).toBe('example-com-search-q-shoes-page-2');
    expect(slugFromUrl('http://localhost:8080/')).toBe('localhost-8080');
  });

  it('caps the length', () => {
    expect(slugFromUrl(`https://example.com/${'a'.repeat(300)}`).length).toBeLessThanOrEqual(100);
  });
});

describe('screenshot paths', () => {
  it('places images under <storage>/screenshots/<site>/<viewport>/', () => {
    expect(screenshotRelPath('example-com', 'desktop', 'diff')).toBe('example-com/desktop/diff.png');
    expect(screenshotPath('/data', 'example-com', 'mobile', 'baseline')).toBe(
      resolve('/data/screenshots/example-com/mobile/baseline.png'),
    );
    expect(statePath('/data')).toBe(join('/data', 'state.json'));
  });

  it('rejects path traversal and unsafe segments', () => {
    expect(() => screenshotPath('/data', '../etc', 'desktop', 'baseline')).toThrow(/Unsafe/);
    expect(() => screenshotPath('/data', 'site', 'desk/top', 'baseline')).toThrow(/Unsafe/);
    expect(() => screenshotPath('/data', 'Site', 'desktop', 'baseline')).toThrow(/Unsafe/);
  });
});

describe('StateStore', () => {
  it('returns defaults when nothing is stored', () => {
    const store = new StateStore(tempDir());
    expect(store.read()).toEqual({ version: 1, sites: {} });
    expect(store.get('a', 'desktop').status).toBe('unknown');
  });

  it('merges updates and persists them as JSON', () => {
    const dir = tempDir();
    const store = new StateStore(dir);
    store.update('a', 'desktop', { status: 'ok', similarity: 1 });
    store.update('a', 'desktop', { checkedAt: '2026-10-13T00:00:00.000Z' });
    store.update('a', 'mobile', { status: 'changed' });

    const reopened = new StateStore(dir);
    expect(reopened.get('a', 'desktop')).toMatchObject({ status: 'ok', similarity: 1, checkedAt: '2026-10-13T00:00:00.000Z' });
    expect(reopened.get('a', 'mobile').status).toBe('changed');
    expect(JSON.parse(readFileSync(statePath(dir), 'utf8')).version).toBe(1);
  });

  it('recovers from a corrupt file and drops unknown statuses', () => {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(statePath(dir), 'not json');
    const store = new StateStore(dir);
    expect(store.read().sites).toEqual({});

    writeFileSync(statePath(dir), JSON.stringify({ sites: { a: { desktop: { status: 'weird', similarity: 0.5 } } } }));
    expect(store.get('a', 'desktop')).toMatchObject({ status: 'unknown', similarity: 0.5 });
  });
});
