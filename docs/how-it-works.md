# How it works

## Capture

Each site and viewport is opened in a fresh Chromium browser context (Playwright) with
`deviceScaleFactor: 1`, `reducedMotion: "reduce"` and a light colour scheme. pixel-radar then:

1. loads the page and waits for the `load` event; an HTTP status of 400 or higher, a timeout or a
   network error makes the result **Unavailable**;
2. waits up to 5 seconds for the network to go idle (pages that never go idle are not failed);
3. scrolls down in steps (up to `capture.maxScrollPx`) and back to the top so lazy-loaded images
   appear;
4. waits `capture.waitAfterLoadMs`;
5. takes a PNG screenshot with CSS animations stopped, the caret hidden, `hide` selectors hidden and
   `mask` selectors covered.

Screenshots are written through a temporary file, so a failed capture never replaces a good
baseline with a broken image. One browser is shared by all sites in a run.

## Comparison

The baseline and current PNGs are compared with [pixelmatch](https://github.com/mapbox/pixelmatch):

- `pixelThreshold` decides when two pixels count as different (pixelmatch measures colour
  distance; 0.1 is its default). Pixels pixelmatch classifies as anti-aliasing are not counted.
- If the images differ in size (for example a full-page capture got taller), the overlapping area
  is compared and every pixel outside it counts as changed.
- `similarity = 1 - changedPixels / totalPixels`, where `totalPixels` uses the larger width and
  height.
- The diff image shows a faded baseline with changed pixels in magenta.

The dashboard rounds the score down, so a page with a few changed pixels shows 99.99%, not 100%.

## Statuses

| Status | Meaning | Fails `check` |
| --- | --- | --- |
| OK | Similarity is at or above `minSimilarity`. | no |
| Changed | Similarity is below `minSimilarity`. | yes |
| No baseline | The page was captured, but there is no baseline to compare with. Rebase or accept it. | yes |
| Unavailable | The page did not load (network error, timeout, HTTP 4xx/5xx). | yes |
| Error | The capture or comparison failed for another reason. | yes |
| Baseline updated | A new baseline was captured; the next check compares against it. | no |
| Not checked | Nothing has run for this site yet. | no |

A site with several viewports shows its most urgent status. Changed, Unavailable and Error results
are retried `retries` times (after `retryDelayMs`) before they are recorded, which filters out
one-off glitches such as a slow ad or a brief outage.

## Rebase and accept

- **Rebase** captures a fresh screenshot and stores it as the baseline.
- **Accept current** copies the last captured screenshot to the baseline without loading the page
  again. Use it after reviewing a Changed result, so the baseline is exactly what you looked at.

## Limitations

- Pixel comparison is sensitive to anything dynamic: carousels, ads, embeds, dates, A/B tests and
  personalised content. Use `hide`, `mask` and a lower `minSimilarity` for such pages.
- Only Chromium is used; the first screen (or the full page) is captured, not individual elements.
- State lives in one JSON file. It is fine for dozens or a few hundred screenshots, not for
  thousands, and there is no history of past results.
- Thumbnails in the dashboard are the full PNGs scaled down by the browser.
- Running a CLI check and a dashboard action on the same site at the same moment is not
  coordinated between processes; the last writer wins for that site.
- There are no built-in notifications; use the CLI exit code or `--json` output from cron or CI.
