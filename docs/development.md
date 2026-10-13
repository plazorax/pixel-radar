# Development

```sh
npm install
npx playwright install chromium   # only needed to capture real pages
cp sites.example.json sites.json
npm run dev                       # server + dashboard with hot reload on http://127.0.0.1:3000
```

`npm run dev` runs the Node server with `tsx watch` and mounts Vite in middleware mode, so the API
and the dashboard share one origin and no proxy or CORS setup is needed.

## Layout

```
src/
  cli.ts          command-line entry point (check, rebase, accept, status, serve)
  config.ts       config schema (zod), defaults and normalisation
  capture.ts      Playwright screenshots
  compare.ts      pixelmatch comparison and diff images
  runner.ts       check / rebase / accept over many sites, retries, concurrency
  storage.ts      file paths, URL slugs, state.json
  server.ts       Express API, auth, static files
  auth.ts         password check and signed session tokens
  scheduler.ts    optional cron schedule
  shared/         project name, status rules and API types used by both server and dashboard
web/              React + TypeScript + Tailwind CSS dashboard (Vite)
test/             Vitest unit tests
```

## Checks

```sh
npm run typecheck   # tsc for the server and the dashboard
npm run lint        # ESLint
npm test            # Vitest
npm run build       # Vite production build into dist/web
```

The unit tests do not start a browser: the runner and API tests use a fake browser that writes
synthetic PNGs, and the comparison tests build images in memory. CI runs the same four commands on
Node 20, 22 and 24.

## README images

`docs/screenshot.png` and `docs/viewer.png` are a demo run against public websites (python.org,
php.net, rust-lang.org, w3.org, debian.org, wikipedia.org) with desktop and mobile viewports. The
"Changed" result is induced on purpose: the php.net baselines were captured first, then the check
ran with `hide` selectors on the page's logo and tagline and a per-site `minSimilarity` of 0.995.
wikipedia.org was added after the baselines were taken, so it shows "No baseline". The state was
kept in a scratch folder outside the repository.
