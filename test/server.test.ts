import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createAuth } from '../src/auth.js';
import type { BrowserHandle } from '../src/capture.js';
import { writePng } from '../src/compare.js';
import { parseConfig } from '../src/config.js';
import { Runner } from '../src/runner.js';
import { createApp } from '../src/server.js';
import type { SitesPayload } from '../src/shared/types.js';
import { StateStore } from '../src/storage.js';
import { solid, tempDir } from './helpers.js';

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function start(password?: string) {
  const config = parseConfig({ storageDir: tempDir(), groups: { Main: ['https://example.com/'] } }, '/');
  const store = new StateStore(config.storageDir);
  const browser: BrowserHandle = {
    capture: async (request) => writePng(request.path, solid(20, 10)),
    close: async () => undefined,
  };
  const runner = new Runner(config, store, { launch: async () => browser, log: () => undefined });
  const app = createApp({ config, store, runner, auth: createAuth({ password }) });
  server = app.listen(0);
  await new Promise((resolve) => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base };
}

describe('HTTP API', () => {
  it('works without login when no password is set', async () => {
    const { base } = await start();
    expect(await (await fetch(`${base}/api/session`)).json()).toEqual({ authRequired: false, authenticated: true });
    const payload = (await (await fetch(`${base}/api/sites`)).json()) as SitesPayload;
    expect(payload.groups[0]?.sites[0]).toMatchObject({ id: 'example-com', status: 'unknown' });
  });

  it('requires a session cookie when a password is set', async () => {
    const { base } = await start('secret');
    expect((await fetch(`${base}/api/sites`)).status).toBe(401);

    const login = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret' }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toMatch(/^pr_session=/);
    expect(login.headers.get('set-cookie')).toMatch(/HttpOnly/i);

    const sites = await fetch(`${base}/api/sites`, { headers: { cookie } });
    expect(sites.status).toBe(200);
    const screenshot = await fetch(`${base}/screenshots/example-com/desktop/baseline.png`);
    expect(screenshot.status).toBe(401);
  });

  it('runs actions on a site and serves the screenshots', async () => {
    const { base } = await start();
    const rebase = await fetch(`${base}/api/sites/example-com/rebase`, { method: 'POST' });
    expect(rebase.status).toBe(200);
    const check = (await (await fetch(`${base}/api/sites/example-com/check`, { method: 'POST' })).json()) as {
      site: { status: string; viewports: { images: { diff: string } }[] };
    };
    expect(check.site.status).toBe('ok');
    const diff = await fetch(`${base}${check.site.viewports[0]?.images.diff}`);
    expect(diff.status).toBe(200);
    expect(diff.headers.get('content-type')).toBe('image/png');
  });

  it('returns 404 for unknown sites, actions and screenshots', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/sites/nope/check`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${base}/api/sites/example-com/delete`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${base}/screenshots/example-com/desktop/missing.png`)).status).toBe(404);
  });

  it('accepts the password as a bearer token', async () => {
    const { base } = await start('secret');
    const headers = { authorization: 'Bearer secret' };
    expect((await fetch(`${base}/api/sites`, { headers })).status).toBe(200);
    expect((await fetch(`${base}/api/sites`, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
  });

  it('does not serve files outside the screenshots folder', async () => {
    const { base } = await start();
    await fetch(`${base}/api/sites/example-com/rebase`, { method: 'POST' });
    for (const path of ['/screenshots/../state.json', '/screenshots/%2e%2e/state.json', '/screenshots/..%2fstate.json']) {
      const response = await fetch(`${base}${path}`);
      expect(response.status, path).toBeGreaterThanOrEqual(400);
      expect(await response.text(), path).not.toMatch(/"sites"/);
    }
  });

  it('refuses cross-site POSTs from browsers', async () => {
    const { base } = await start();
    const crossSite = await fetch(`${base}/api/sites/example-com/rebase`, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(crossSite.status).toBe(403);
    const sameOrigin = await fetch(`${base}/api/sites/example-com/rebase`, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(sameOrigin.status).toBe(200);
  });
});
