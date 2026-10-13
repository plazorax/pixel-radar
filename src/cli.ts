import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createAuth } from './auth.js';
import { ConfigError, loadConfig, type ResolvedConfig } from './config.js';
import { Runner, selectSites, SelectionError, type ViewportResult } from './runner.js';
import { startSchedule } from './scheduler.js';
import { createApp } from './server.js';
import { APP_NAME, ENV, LOG_PREFIX } from './shared/app.js';
import { formatSimilarity, isFailure, isStale, STATUS_LABELS } from './shared/status.js';
import type { SiteAction } from './shared/types.js';
import { StateStore } from './storage.js';

const USAGE = `Usage: ${APP_NAME} <command> [options]

Commands:
  check     Capture every site and compare it with its baseline
  rebase    Capture new baselines
  accept    Promote the last captured screenshots to baselines (no new capture)
  status    Print the stored results without capturing anything
  serve     Start the dashboard and API

Options:
  -c, --config <file>  Sites config (default: $${ENV.config} or ./sites.json)
  -g, --group <name>   Only sites in this group
  -s, --site <id>      Only this site id
      --json           Print results as JSON
  -p, --port <port>    Port for "serve" (default: $${ENV.port} or 3000)
      --dev            "serve" with the Vite dev server (hot reload)
  -h, --help           Show this help

Exit codes: 0 = all OK, 1 = changes or failures found, 2 = usage, config or setup error.`;

const EXIT_OK = 0;
const EXIT_FAILURES = 1;
const EXIT_USAGE = 2;

/** Reads an environment variable; empty values (e.g. copied from .env.example) count as unset. */
function env(name: string): string | undefined {
  return process.env[name] || undefined;
}

class UsageError extends Error {}

const COMMANDS = ['check', 'rebase', 'accept', 'status', 'serve'];

async function main(argv: string[]): Promise<number> {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c' },
      group: { type: 'string', short: 'g' },
      site: { type: 'string', short: 's' },
      json: { type: 'boolean', default: false },
      port: { type: 'string', short: 'p' },
      dev: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const command = positionals[0];
  if (values.help || !command) {
    console.log(USAGE);
    return values.help ? EXIT_OK : EXIT_USAGE;
  }
  if (!COMMANDS.includes(command)) {
    console.error(`Unknown command "${command}".\n\n${USAGE}`);
    return EXIT_USAGE;
  }

  const config = loadConfig(values.config ?? env(ENV.config) ?? 'sites.json');
  const store = new StateStore(config.storageDir);

  switch (command) {
    case 'check':
    case 'rebase':
    case 'accept':
      return runAction(command, config, store, values);
    case 'status':
      return printStatus(config, store, values);
    case 'serve':
      await serve(config, store, values);
      return EXIT_OK;
  }
  return EXIT_USAGE;
}

interface Filters {
  group?: string;
  site?: string;
  json?: boolean;
}

async function runAction(action: SiteAction, config: ResolvedConfig, store: StateStore, options: Filters) {
  const sites = selectSites(config, options);
  const runner = new Runner(config, store, { log: options.json ? () => undefined : undefined });
  const results = await runner.run(action, sites, options.json ? undefined : (result) => console.log(formatResult(result)));

  const failing = results.filter((result) => (action === 'check' ? isFailure(result.status) : result.error !== null));
  if (options.json) {
    console.log(JSON.stringify({ action, results }, null, 2));
  } else {
    console.log(`\n${results.length} screenshot(s) processed, ${failing.length} need attention.`);
    if (action === 'check' && results.some((result) => result.status === 'no_baseline')) {
      console.log('Sites without a baseline: run "npm run rebase" (or "npm run accept" to keep this capture).');
    }
  }
  return failing.length > 0 ? EXIT_FAILURES : EXIT_OK;
}

function formatResult(result: ViewportResult): string {
  const label = STATUS_LABELS[result.status].padEnd(16);
  const similarity = formatSimilarity(result.similarity).padStart(7);
  const error = result.error ? `  (${result.error})` : '';
  return `${label} ${similarity}  ${result.siteId} [${result.viewport}]  ${result.url}${error}`;
}

function printStatus(config: ResolvedConfig, store: StateStore, options: Filters): number {
  const sites = selectSites(config, options);
  const state = store.read();
  const now = new Date();
  const rows = sites.flatMap((site) =>
    site.viewports.map((viewport) => {
      const entry = state.sites[site.id]?.[viewport.name];
      return {
        siteId: site.id,
        group: site.group,
        url: site.url,
        viewport: viewport.name,
        status: entry?.status ?? 'unknown',
        similarity: entry?.similarity ?? null,
        checkedAt: entry?.checkedAt ?? null,
        stale: isStale(entry?.checkedAt ?? null, now, config.staleAfterHours),
      } as const;
    }),
  );
  if (options.json) {
    console.log(JSON.stringify({ rows }, null, 2));
  } else {
    for (const row of rows) {
      const checked = row.checkedAt ? `${row.checkedAt}${row.stale ? ' (stale)' : ''}` : 'never checked';
      console.log(
        `${STATUS_LABELS[row.status].padEnd(16)} ${formatSimilarity(row.similarity).padStart(7)}  ${row.siteId} [${row.viewport}]  ${checked}`,
      );
    }
  }
  return rows.some((row) => isFailure(row.status)) ? EXIT_FAILURES : EXIT_OK;
}

async function serve(config: ResolvedConfig, store: StateStore, options: { port?: string; dev?: boolean }) {
  const portText = options.port ?? env(ENV.port) ?? '3000';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError(`Invalid port "${portText}"`);
  const host = env(ENV.host) ?? '127.0.0.1';

  const auth = createAuth({ password: env(ENV.password), secret: env(ENV.sessionSecret) });
  const runner = new Runner(config, store);

  let devMiddleware;
  if (options.dev) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    devMiddleware = vite.middlewares;
  }

  const app = createApp({
    config,
    store,
    runner,
    auth,
    webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    devMiddleware,
    trustProxy: parseTrustProxy(env(ENV.trustProxy)),
  });

  await new Promise<void>((resolve, reject) => {
    // Express 5 passes listen errors (e.g. EADDRINUSE) to this callback.
    app.listen(port, host, (error?: Error) => (error ? reject(error) : resolve()));
  });
  startSchedule(config, runner);

  console.log(`${LOG_PREFIX} dashboard on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`${LOG_PREFIX} ${config.sites.length} site(s), storage in ${config.storageDir}`);
  if (config.schedule) console.log(`${LOG_PREFIX} scheduled checks: ${config.schedule}`);
  if (!auth.enabled) {
    const local = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    console.warn(
      `${LOG_PREFIX} ${ENV.password} is not set: login is disabled${local ? '' : ' and the server is reachable from the network'}.`,
    );
  }
}

/** TRUST_PROXY: "true", a hop count ("1") or an Express trust-proxy list such as "loopback". */
function parseTrustProxy(value: string | undefined): boolean | number | string | undefined {
  if (value === undefined) return undefined;
  if (value === 'true' || value === 'false') return value === 'true';
  return /^\d+$/.test(value) ? Number(value) : value;
}

// "serve" keeps running because the HTTP server holds the event loop open.
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Argument errors and system errors such as EADDRINUSE carry a `code`; their message is enough.
    const hasCode = typeof (error as { code?: unknown } | null)?.code === 'string';
    if (error instanceof ConfigError || error instanceof SelectionError || error instanceof UsageError || hasCode) {
      console.error((error as Error).message);
    } else {
      console.error(error);
    }
    process.exitCode = EXIT_USAGE;
  },
);
