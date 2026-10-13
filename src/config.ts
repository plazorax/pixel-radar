import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import cron from 'node-cron';
import { z } from 'zod';
import { slugFromUrl } from './storage.js';

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const viewportSchema = z
  .object({
    width: z.int().min(200).max(5000),
    height: z.int().min(200).max(5000),
  })
  .strict();

const httpUrl = z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' });

const siteObjectSchema = z
  .object({
    url: httpUrl,
    id: z.string().regex(NAME_PATTERN, 'use lowercase letters, digits and dashes').max(100).optional(),
    name: z.string().min(1).optional(),
    viewports: z.array(z.string()).min(1).optional(),
    minSimilarity: z.number().min(0).max(1).optional(),
    hide: z.array(z.string().min(1)).optional(),
    mask: z.array(z.string().min(1)).optional(),
  })
  .strict();

const siteSchema = z.union([httpUrl, siteObjectSchema]);

const captureSchema = z
  .object({
    fullPage: z.boolean().default(false),
    timeoutMs: z.int().min(1000).default(30_000),
    waitAfterLoadMs: z.int().min(0).default(1000),
    scroll: z.boolean().default(true),
    maxScrollPx: z.int().min(0).default(5000),
  })
  .strict();

export const configSchema = z
  .object({
    storageDir: z.string().min(1).default('./data'),
    minSimilarity: z.number().min(0).max(1).default(0.98),
    pixelThreshold: z.number().min(0).max(1).default(0.1),
    viewports: z
      .record(z.string().regex(NAME_PATTERN, 'viewport names use lowercase letters, digits and dashes'), viewportSchema)
      .default({ desktop: { width: 1440, height: 900 } }),
    capture: captureSchema.default(captureSchema.parse({})),
    retries: z.int().min(0).max(10).default(1),
    retryDelayMs: z.int().min(0).default(5000),
    concurrency: z.int().min(1).max(16).default(2),
    staleAfterHours: z.number().positive().default(72),
    schedule: z.string().min(1).optional(),
    groups: z.record(z.string().min(1), z.array(siteSchema).min(1)),
  })
  .strict();

export type RawConfig = z.input<typeof configSchema>;

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export interface SiteConfig {
  id: string;
  url: string;
  name: string;
  group: string;
  viewports: Viewport[];
  minSimilarity: number;
  hide: string[];
  mask: string[];
}

export interface CaptureSettings {
  fullPage: boolean;
  timeoutMs: number;
  waitAfterLoadMs: number;
  scroll: boolean;
  maxScrollPx: number;
}

export interface ResolvedConfig {
  configPath: string | null;
  storageDir: string;
  minSimilarity: number;
  pixelThreshold: number;
  capture: CaptureSettings;
  retries: number;
  retryDelayMs: number;
  concurrency: number;
  staleAfterHours: number;
  schedule: string | null;
  groups: { name: string; sites: SiteConfig[] }[];
  sites: SiteConfig[];
}

export class ConfigError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}\n${issues.map((issue) => `  - ${issue}`).join('\n')}` : message);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Validates a raw config object and normalises it: fills defaults, turns plain URL strings into
 * site objects, assigns ids and resolves `storageDir` against `baseDir` (the config file's folder).
 */
export function parseConfig(raw: unknown, baseDir: string, configPath: string | null = null): ResolvedConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${where}: ${issue.message}`;
    });
    throw new ConfigError('Invalid configuration:', issues);
  }

  const config = parsed.data;
  const issues: string[] = [];
  const viewportNames = Object.keys(config.viewports);
  if (viewportNames.length === 0) issues.push('viewports: define at least one viewport');
  if (config.schedule !== undefined && !cron.validate(config.schedule)) {
    issues.push(`schedule: "${config.schedule}" is not a valid cron expression`);
  }

  const seenIds = new Map<string, string>();
  const groups: ResolvedConfig['groups'] = [];

  for (const [groupName, entries] of Object.entries(config.groups)) {
    const sites: SiteConfig[] = [];
    entries.forEach((entry, index) => {
      const site = typeof entry === 'string' ? { url: entry } : entry;
      const id = site.id ?? slugFromUrl(site.url);
      const where = `groups.${groupName}.${index}`;

      const previous = seenIds.get(id);
      if (previous) {
        issues.push(`${where}: duplicate site id "${id}" (also used by ${previous}); set a unique "id"`);
      }
      seenIds.set(id, where);

      const names = site.viewports ?? viewportNames;
      const viewports: Viewport[] = [];
      for (const name of names) {
        const viewport = config.viewports[name];
        if (viewport) viewports.push({ name, ...viewport });
        else issues.push(`${where}.viewports: unknown viewport "${name}"`);
      }

      sites.push({
        id,
        url: site.url,
        name: site.name ?? defaultSiteName(site.url),
        group: groupName,
        viewports,
        minSimilarity: site.minSimilarity ?? config.minSimilarity,
        hide: site.hide ?? [],
        mask: site.mask ?? [],
      });
    });
    groups.push({ name: groupName, sites });
  }

  if (issues.length > 0) throw new ConfigError('Invalid configuration:', issues);

  return {
    configPath,
    storageDir: resolve(baseDir, config.storageDir),
    minSimilarity: config.minSimilarity,
    pixelThreshold: config.pixelThreshold,
    capture: config.capture,
    retries: config.retries,
    retryDelayMs: config.retryDelayMs,
    concurrency: config.concurrency,
    staleAfterHours: config.staleAfterHours,
    schedule: config.schedule ?? null,
    groups,
    sites: groups.flatMap((group) => group.sites),
  };
}

/** Reads and validates a JSON config file. */
export function loadConfig(path: string): ResolvedConfig {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    throw new ConfigError(
      `Config file not found: ${absolute}\nCopy sites.example.json to sites.json, or pass --config <file>.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new ConfigError(`Could not parse ${absolute}: ${(error as Error).message}`);
  }
  return parseConfig(raw, dirname(absolute), absolute);
}

function defaultSiteName(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  return parsed.host.replace(/^www\./, '') + path;
}
