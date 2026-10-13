# CLI, cron and CI

All commands are npm scripts that run `src/cli.ts` with tsx; extra options go after `--`.

```sh
npm run check                         # capture every site and compare
npm run check -- --group Storefront   # one group
npm run check -- --site cart --json   # one site, JSON output
npm run rebase -- --group Docs        # new baselines for a group
npm run accept -- --site cart         # keep the last capture as the baseline
npm run status                        # print stored results, capture nothing
npm start                             # dashboard and API
```

| Option | Meaning |
| --- | --- |
| `-c, --config <file>` | Config file (default `$PIXEL_RADAR_CONFIG` or `./sites.json`). |
| `-g, --group <name>` | Only sites in this group. |
| `-s, --site <id>` | Only this site. |
| `--json` | Machine-readable output. |
| `-p, --port <port>` | Port for `serve`. |
| `--dev` | `serve` with the Vite dev server. |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Everything checked is OK (for `rebase`/`accept`: no errors). |
| 1 | At least one screenshot is Changed, Unavailable, Error or has no baseline. |
| 2 | Usage, configuration or setup error (for example Chromium is not installed or the port is in use). |

`status` uses the same codes based on stored results, without capturing.

## Cron

```cron
# Every hour; mail or log the output only when something needs attention.
0 * * * * cd /opt/pixel-radar && npm run --silent check > /tmp/pixel-radar.log 2>&1 || cat /tmp/pixel-radar.log
```

The dashboard reads the same `storageDir`, so results from cron show up there (the page refreshes
every minute). Alternatively set `"schedule"` in the config and let `npm start` run the checks.

## CI

Baselines must persist between runs, so keep `storageDir` in a cache, an artifact or a volume.
A GitHub Actions job could look like this:

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- uses: actions/cache@v6
  with:
    path: data
    key: pixel-radar-${{ github.run_id }}
    restore-keys: pixel-radar-
- run: npm run check
```

The job fails when `check` exits with 1. To create baselines in a pipeline, run `npm run rebase`
once (for example from a manually triggered workflow).
