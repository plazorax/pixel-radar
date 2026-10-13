import { existsSync } from 'node:fs';
import type { ResolvedConfig, SiteConfig } from './config.js';
import { isStale, worstStatus } from './shared/status.js';
import type { SitesPayload, SiteView } from './shared/types.js';
import { emptyViewportState, screenshotPath, screenshotRelPath, type ImageKind, type StateFile } from './storage.js';

export interface ViewOptions {
  now?: Date;
  fileExists?: (path: string) => boolean;
}

/** Builds the dashboard view of one site from config + stored state. */
export function buildSiteView(
  config: ResolvedConfig,
  site: SiteConfig,
  state: StateFile,
  options: ViewOptions = {},
): SiteView {
  const now = options.now ?? new Date();
  const fileExists = options.fileExists ?? existsSync;

  const viewports = site.viewports.map((viewport) => {
    const entry = state.sites[site.id]?.[viewport.name] ?? emptyViewportState();
    const image = (kind: ImageKind) => {
      if (!fileExists(screenshotPath(config.storageDir, site.id, viewport.name, kind))) return null;
      // The version query busts browser caches after a new capture.
      const version = encodeURIComponent((kind === 'baseline' ? entry.baselineAt : entry.checkedAt) ?? '0');
      return `/screenshots/${screenshotRelPath(site.id, viewport.name, kind)}?v=${version}`;
    };
    return {
      ...viewport,
      ...entry,
      stale: isStale(entry.checkedAt, now, config.staleAfterHours),
      images: { baseline: image('baseline'), current: image('current'), diff: image('diff') },
    };
  });

  return {
    id: site.id,
    name: site.name,
    url: site.url,
    group: site.group,
    minSimilarity: site.minSimilarity,
    status: worstStatus(viewports.map((viewport) => viewport.status)),
    viewports,
  };
}

export function buildSitesPayload(config: ResolvedConfig, state: StateFile, options: ViewOptions = {}): SitesPayload {
  const now = options.now ?? new Date();
  return {
    generatedAt: now.toISOString(),
    staleAfterHours: config.staleAfterHours,
    groups: config.groups.map((group) => ({
      name: group.name,
      sites: group.sites.map((site) => buildSiteView(config, site, state, { ...options, now })),
    })),
  };
}
