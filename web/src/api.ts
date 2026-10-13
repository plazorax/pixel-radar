import type { ActionResponse, SessionInfo, SiteAction, SitesPayload } from '../../src/shared/types.ts';

export class UnauthorizedError extends Error {
  constructor() {
    super('Log in to continue');
    this.name = 'UnauthorizedError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (response.status === 401 && path !== '/api/login') throw new UnauthorizedError();
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed with HTTP ${response.status}`);
  return body as T;
}

export const api = {
  session: () => request<SessionInfo>('/api/session'),
  login: (password: string) => request<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),
  sites: () => request<SitesPayload>('/api/sites'),
  run: (siteId: string, action: SiteAction) =>
    request<ActionResponse>(`/api/sites/${encodeURIComponent(siteId)}/${action}`, { method: 'POST' }),
};
