import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { buildSiteView, buildSitesPayload } from './api.js';
import { SESSION_COOKIE, type Auth } from './auth.js';
import type { ResolvedConfig } from './config.js';
import { SiteBusyError, type Runner } from './runner.js';
import { LOG_PREFIX } from './shared/app.js';
import type { SessionInfo, SiteAction } from './shared/types.js';
import { screenshotsDir, type StateStore } from './storage.js';
import { sleep } from './util.js';

export interface AppOptions {
  config: ResolvedConfig;
  store: StateStore;
  runner: Runner;
  auth: Auth;
  /** Built dashboard (dist/web). Served when present. */
  webDir?: string;
  /** Extra middleware mounted last, e.g. Vite's dev server. */
  devMiddleware?: express.RequestHandler;
  /** Express "trust proxy" setting, needed for Secure cookies behind a TLS-terminating proxy. */
  trustProxy?: boolean | number | string;
}

const ACTIONS: readonly SiteAction[] = ['check', 'rebase', 'accept'];

export function createApp({ config, store, runner, auth, webDir, devMiddleware, trustProxy }: AppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  // Browsers label every request with Sec-Fetch-Site. Refusing cross-site POSTs stops other web
  // pages from triggering captures or replacing baselines, including when login is disabled.
  // Non-browser clients (curl, scripts) do not send the header and are not affected.
  app.post('/api/{*path}', (req, res, next) => {
    const site = req.headers['sec-fetch-site'];
    if (site === undefined || site === 'same-origin' || site === 'none') return next();
    res.status(403).json({ error: 'Cross-site requests are not allowed' });
  });

  app.use(express.json({ limit: '10kb' }));

  const isAuthorized = (req: Request) =>
    auth.isAuthorized({ cookie: req.headers.cookie, authorization: req.headers.authorization });

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (isAuthorized(req)) return next();
    res.status(401).json({ error: 'Log in to continue' });
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/session', (req, res) => {
    const info: SessionInfo = { authRequired: auth.enabled, authenticated: isAuthorized(req) };
    res.json(info);
  });

  app.post('/api/login', async (req, res) => {
    if (!auth.enabled) {
      res.json({ ok: true });
      return;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!auth.checkPassword(password)) {
      await sleep(1000); // Slows down password guessing.
      res.status(401).json({ error: 'Wrong password' });
      return;
    }
    res.cookie(SESSION_COOKIE, auth.issueToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: auth.maxAgeMs,
      path: '/',
    });
    res.json({ ok: true });
  });

  app.post('/api/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/sites', requireAuth, (_req, res) => {
    res.json(buildSitesPayload(config, store.read()));
  });

  app.post('/api/sites/:id/:action', requireAuth, async (req, res) => {
    const action = req.params.action as SiteAction;
    const site = config.sites.find((candidate) => candidate.id === req.params.id);
    if (!ACTIONS.includes(action)) {
      res.status(404).json({ error: `Unknown action "${String(req.params.action)}"` });
      return;
    }
    if (!site) {
      res.status(404).json({ error: `Unknown site "${String(req.params.id)}"` });
      return;
    }
    try {
      await runner.run(action, [site]);
    } catch (error) {
      if (error instanceof SiteBusyError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
    res.json({ site: buildSiteView(config, site, store.read()) });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(
    '/screenshots',
    requireAuth,
    express.static(screenshotsDir(config.storageDir), { index: false, maxAge: 0, fallthrough: false }),
  );

  if (devMiddleware) {
    app.use(devMiddleware);
  } else if (webDir && existsSync(join(webDir, 'index.html'))) {
    app.use(express.static(webDir, { index: 'index.html' }));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(join(webDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .type('text')
        .send('The dashboard is not built yet. Run "npm run build", or use "npm run dev" during development.');
    });
  }

  app.use((error: Error & { status?: number }, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const status = error.status ?? 500;
    if (status >= 500) console.error(LOG_PREFIX, error);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message });
  });

  return app;
}
