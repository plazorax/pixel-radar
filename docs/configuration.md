# Configuration

Pixel Radar reads one JSON file. By default that is `sites.json` in the current directory; use
`--config <file>` or `PIXEL_RADAR_CONFIG` to point somewhere else. Start from the example:

```sh
cp sites.example.json sites.json
```

The sites in `sites.example.json` (example.com, example.org, example.net) are placeholders for a
first run. Those pages ask not to be relied on for monitoring, so replace them with your own sites.

## Full example

```json
{
  "storageDir": "./data",
  "minSimilarity": 0.98,
  "pixelThreshold": 0.1,
  "viewports": {
    "desktop": { "width": 1440, "height": 900 },
    "mobile": { "width": 390, "height": 844 }
  },
  "capture": { "fullPage": false, "timeoutMs": 30000, "waitAfterLoadMs": 1000, "scroll": true, "maxScrollPx": 5000 },
  "retries": 1,
  "retryDelayMs": 5000,
  "concurrency": 2,
  "staleAfterHours": 72,
  "schedule": "0 * * * *",
  "groups": {
    "Storefront": [
      "https://shop.example.com/",
      {
        "url": "https://shop.example.com/cart",
        "id": "cart",
        "name": "Cart page",
        "viewports": ["mobile"],
        "minSimilarity": 0.95,
        "hide": ["#cookie-banner", ".chat-widget"],
        "mask": [".countdown", "time"]
      }
    ],
    "Docs": ["https://docs.example.com/"]
  }
}
```

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `storageDir` | `./data` | Where screenshots and `state.json` live. Relative paths are resolved against the config file's folder. |
| `minSimilarity` | `0.98` | A check passes when similarity is at or above this value (0 to 1). |
| `pixelThreshold` | `0.1` | pixelmatch colour threshold per pixel (0 to 1). Higher ignores subtler colour differences. |
| `viewports` | `{ "desktop": 1440×900 }` | Named viewport sizes. Names use lowercase letters, digits and dashes. |
| `capture.fullPage` | `false` | Capture the whole scrollable page instead of the first screen. |
| `capture.timeoutMs` | `30000` | Page load timeout. |
| `capture.waitAfterLoadMs` | `1000` | Extra wait before the screenshot, for fonts and late scripts. |
| `capture.scroll` | `true` | Scroll down and back up before capturing, to trigger lazy-loaded images. |
| `capture.maxScrollPx` | `5000` | How far to scroll for lazy loading. |
| `retries` | `1` | Extra attempts when a check comes back changed, unavailable or error. |
| `retryDelayMs` | `5000` | Pause between attempts. |
| `concurrency` | `2` | Sites captured in parallel by the CLI and the scheduler. |
| `staleAfterHours` | `72` | Checks older than this are highlighted in the dashboard and `status`. |
| `schedule` | none | Cron expression for checks run by `serve` (for example `"0 * * * *"` for hourly). |
| `groups` | required | Group name to list of sites. |

## Sites

A site is either a URL string or an object:

| Key | Meaning |
| --- | --- |
| `url` | Required. `http` or `https` URL. |
| `id` | Folder name and API id. Defaults to a slug of the URL (`https://www.example.com/blog` becomes `example-com-blog`). Must be unique. |
| `name` | Label in the dashboard. Defaults to host and path. |
| `viewports` | Subset of the global viewport names. Defaults to all of them. |
| `minSimilarity` | Overrides the global value for this site. |
| `hide` | CSS selectors set to `visibility: hidden` while the screenshot is taken (cookie banners, chat widgets). The element keeps its space in the layout. |
| `mask` | CSS selectors covered with a solid box (rotating banners, dates, prices). The layout stays the same. |

The file is validated on load. Unknown keys (usually typos), non-http URLs, out-of-range numbers,
duplicate ids and unknown viewport names stop the command with a list of problems.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `PIXEL_RADAR_PASSWORD` | Dashboard password. When unset, login is disabled. |
| `PIXEL_RADAR_SESSION_SECRET` | Signs session cookies. When unset, a random key is used and sessions end on restart. |
| `PIXEL_RADAR_CONFIG` | Config path when `--config` is not given. |
| `HOST`, `PORT` | Server bind address (default `127.0.0.1`) and port (default `3000`). |
| `TRUST_PROXY` | Express `trust proxy` value behind a reverse proxy: `true`, a hop count such as `1`, or a list such as `loopback`. Unset by default. |

A `.env` file in the working directory is loaded automatically; see `.env.example`. Variables
already set in the environment win over `.env`, and empty values count as unset.

## Storage layout

```
data/
  state.json                         # last result per site and viewport
  screenshots/<site-id>/<viewport>/
    baseline.png
    current.png
    diff.png
```

Deleting a site's folder removes its baseline; the next check reports "No baseline". Removing a
site from the config leaves its files in place.
