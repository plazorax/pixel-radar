# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-13

### Added

- Screenshot capture with Playwright (Chromium): one or more named viewports per site, optional
  full-page capture, lazy-load scrolling, `hide` and `mask` selectors for noisy elements, and
  HTTP 4xx/5xx detection.
- Pixel comparison with pixelmatch: similarity score, changed-pixel count and a diff image;
  size changes count as changed pixels.
- Statuses `ok`, `changed`, `no_baseline`, `unavailable`, `error`, `baseline_updated` and
  `unknown`, with a per-site or global `minSimilarity` and a configurable stale-check warning.
- Retries for changed or unreachable pages before a result is recorded.
- `sites.json` config with groups, validated on load (unknown keys, bad URLs, duplicate ids and
  unknown viewports are reported).
- CLI: `check`, `rebase`, `accept`, `status` and `serve`, with `--group`, `--site` and `--json`;
  `check` exits with code 1 when anything needs attention.
- Dashboard (React, TypeScript, Tailwind CSS): grouped sites, baseline/current/diff thumbnails and
  viewer, "Needs attention" list, check/rebase per site, group or all, and "Accept current".
- Optional password login via `PIXEL_RADAR_PASSWORD` (disabled when unset) with signed
  HTTP-only session cookies, `TRUST_PROXY` for Secure cookies behind a reverse proxy, and a
  guard against cross-site `POST` requests to the API.
- Optional in-process schedule (`"schedule"` cron expression).
