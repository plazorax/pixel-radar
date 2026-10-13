import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium, type Browser } from 'playwright';
import type { CaptureSettings, Viewport } from './config.js';

export interface CaptureRequest {
  url: string;
  viewport: Viewport;
  settings: CaptureSettings;
  /** CSS selectors hidden (visibility: hidden) before the screenshot, e.g. cookie banners. */
  hide: string[];
  /** CSS selectors covered with a solid box in the screenshot, e.g. rotating ads or dates. */
  mask: string[];
  /** Where the PNG is written. */
  path: string;
}

/** Thrown when a page cannot be loaded (network error, timeout, HTTP 4xx/5xx). */
export class PageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageUnavailableError';
  }
}

export interface BrowserHandle {
  capture(request: CaptureRequest): Promise<void>;
  close(): Promise<void>;
}

export async function launchBrowser(): Promise<BrowserHandle> {
  const browser = await chromium.launch({ args: ['--disable-notifications'] });
  return {
    capture: (request) => capturePage(browser, request),
    close: () => browser.close(),
  };
}

/** CSS that hides the given selectors; injected only while the screenshot is taken. */
export function hideCss(selectors: readonly string[]): string | undefined {
  if (selectors.length === 0) return undefined;
  return `${selectors.join(',\n')} { visibility: hidden !important; }`;
}

async function capturePage(browser: Browser, request: CaptureRequest): Promise<void> {
  const { settings } = request;
  const context = await browser.newContext({
    viewport: { width: request.viewport.width, height: request.viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  try {
    const page = await context.newPage();
    let response;
    try {
      response = await page.goto(request.url, { waitUntil: 'load', timeout: settings.timeoutMs });
    } catch (error) {
      throw new PageUnavailableError(firstLine((error as Error).message));
    }
    if (response && response.status() >= 400) {
      throw new PageUnavailableError(`HTTP ${response.status()} ${response.statusText()}`.trim());
    }

    // Give late requests a moment to settle; long-polling pages never reach idle, so do not fail on it.
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    if (settings.scroll && settings.maxScrollPx > 0) {
      // Scroll down in steps to trigger lazy-loaded images, then return to the top.
      await page.evaluate(async (maxScroll) => {
        const step = 250;
        for (let y = 0; y < Math.min(document.body.scrollHeight, maxScroll); y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        window.scrollTo(0, 0);
      }, settings.maxScrollPx);
    }

    if (settings.waitAfterLoadMs > 0) await page.waitForTimeout(settings.waitAfterLoadMs);

    const image = await page.screenshot({
      fullPage: settings.fullPage,
      animations: 'disabled',
      caret: 'hide',
      mask: request.mask.map((selector) => page.locator(selector)),
      style: hideCss(request.hide),
    });

    // Write via a temp file so a failed capture never leaves a truncated PNG behind.
    mkdirSync(dirname(request.path), { recursive: true });
    const tmp = `${request.path}.tmp`;
    writeFileSync(tmp, image);
    renameSync(tmp, request.path);
  } finally {
    await context.close();
  }
}

function firstLine(message: string): string {
  return message.split('\n')[0]?.trim() ?? message;
}
