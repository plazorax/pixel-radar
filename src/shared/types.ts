// JSON shapes exchanged between the server and the dashboard.
import type { Status } from './status.js';

export interface SessionInfo {
  authRequired: boolean;
  authenticated: boolean;
}

export interface ViewportView {
  name: string;
  width: number;
  height: number;
  status: Status;
  similarity: number | null;
  diffPixels: number | null;
  checkedAt: string | null;
  baselineAt: string | null;
  error: string | null;
  stale: boolean;
  images: {
    baseline: string | null;
    current: string | null;
    diff: string | null;
  };
}

export interface SiteView {
  id: string;
  name: string;
  url: string;
  group: string;
  minSimilarity: number;
  status: Status;
  viewports: ViewportView[];
}

export interface GroupView {
  name: string;
  sites: SiteView[];
}

export interface SitesPayload {
  generatedAt: string;
  staleAfterHours: number;
  groups: GroupView[];
}

export type SiteAction = 'check' | 'rebase' | 'accept';

export interface ActionResponse {
  site: SiteView;
}
