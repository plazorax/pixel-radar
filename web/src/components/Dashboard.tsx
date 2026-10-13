import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, LogOut, RefreshCw } from 'lucide-react';
import { APP_NAME } from '../../../src/shared/app.ts';
import { api, UnauthorizedError } from '../api.ts';
import { formatSimilarity, needsAttention, STATUS_LABELS } from '../../../src/shared/status.ts';
import type { SiteAction, SitesPayload, SiteView, ViewportView } from '../../../src/shared/types.ts';
import { plural, timeAgo } from '../format.ts';
import ImageViewer, { type ImageKind } from './ImageViewer.tsx';
import Logo from './Logo.tsx';
import SiteRow, { ActionButton } from './SiteRow.tsx';
import StatusBadge from './StatusBadge.tsx';

interface Props {
  canLogOut: boolean;
  onLogOut: () => void;
  onUnauthorized: () => void;
}

interface Batch {
  verb: string;
  done: number;
  total: number;
}

const BATCH_CONCURRENCY = 2;
const REFRESH_MS = 60_000;
const VERBS: Record<SiteAction, string> = { check: 'Checking', rebase: 'Rebasing', accept: 'Accepting' };

export default function Dashboard({ canLogOut, onLogOut, onUnauthorized }: Props) {
  const [payload, setPayload] = useState<SitesPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [batch, setBatch] = useState<Batch | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ site: SiteView; viewport: ViewportView; kind: ImageKind } | null>(null);
  const batchRunning = useRef(false);

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof UnauthorizedError) onUnauthorized();
      else setNotice((error as Error).message);
    },
    [onUnauthorized],
  );

  const load = useCallback(() => {
    api
      .sites()
      .then((data) => {
        setPayload(data);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof UnauthorizedError) onUnauthorized();
        else setLoadError((error as Error).message);
      });
  }, [onUnauthorized]);

  useEffect(() => {
    load();
    // Picks up results from scheduled runs or the CLI while the page is open.
    const timer = window.setInterval(() => {
      if (!batchRunning.current) load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const replaceSite = (site: SiteView) =>
    setPayload((current) =>
      current && {
        ...current,
        groups: current.groups.map((group) => ({
          ...group,
          sites: group.sites.map((candidate) => (candidate.id === site.id ? site : candidate)),
        })),
      },
    );

  const setSiteBusy = (id: string, value: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  const runOne = async (site: SiteView, action: SiteAction) => {
    setSiteBusy(site.id, true);
    try {
      const response = await api.run(site.id, action);
      replaceSite(response.site);
    } catch (error) {
      handleError(error);
    } finally {
      setSiteBusy(site.id, false);
    }
  };

  const runBatch = async (action: SiteAction, sites: SiteView[], scope: string) => {
    if (sites.length === 0 || batchRunning.current) return;
    if (action === 'rebase' && !window.confirm(`Replace the baselines of ${plural(sites.length, 'site')} in ${scope}?`)) {
      return;
    }
    batchRunning.current = true;
    setNotice(null);
    setBatch({ verb: VERBS[action], done: 0, total: sites.length });
    const queue = [...sites];
    const worker = async () => {
      for (let site = queue.shift(); site; site = queue.shift()) {
        await runOne(site, action);
        setBatch((current) => current && { ...current, done: current.done + 1 });
      }
    };
    await Promise.all(Array.from({ length: BATCH_CONCURRENCY }, worker));
    batchRunning.current = false;
    setBatch(null);
  };

  if (loadError) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <p className="text-warn">Could not load sites: {loadError}</p>
      </main>
    );
  }
  if (!payload) return null;

  const sites = payload.groups.flatMap((group) => group.sites);
  const viewports = sites.flatMap((site) => site.viewports.map((viewport) => ({ site, viewport })));
  const attention = viewports.filter(({ viewport }) => needsAttention(viewport.status) || viewport.stale);
  const counts = viewports.reduce<Record<string, number>>((acc, { viewport }) => {
    acc[viewport.status] = (acc[viewport.status] ?? 0) + 1;
    return acc;
  }, {});
  const countText = Object.entries(counts)
    .map(([status, count]) => `${count} ${STATUS_LABELS[status as keyof typeof STATUS_LABELS].toLowerCase()}`)
    .join(', ');

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <Logo />
          <h1 className="mr-auto text-xl font-semibold">{APP_NAME}</h1>
          <ActionButton
            primary
            onClick={() => runBatch('check', sites, 'all groups')}
            disabled={batch !== null}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Check all
          </ActionButton>
          <ActionButton
            onClick={() => runBatch('rebase', sites, 'all groups')}
            disabled={batch !== null}
            icon={<Camera className="h-4 w-4" />}
          >
            Rebase all
          </ActionButton>
          {canLogOut && (
            <ActionButton onClick={onLogOut} icon={<LogOut className="h-4 w-4" />}>
              Log out
            </ActionButton>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <p className="text-muted">
          {plural(viewports.length, 'screenshot')} across {plural(sites.length, 'site')}
          {countText && `: ${countText}`}.
        </p>

        {batch && (
          <div className="mt-4" aria-live="polite">
            <p className="text-sm font-medium">
              {batch.verb} {Math.min(batch.done + 1, batch.total)} of {plural(batch.total, 'site')}…
            </p>
            <div className="mt-1 h-1 overflow-hidden rounded bg-line">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${(batch.done / batch.total) * 100}%` }} />
            </div>
          </div>
        )}

        {notice && (
          <div className="mt-4 flex items-start justify-between gap-4 rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn" role="alert">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="font-medium underline">
              Dismiss
            </button>
          </div>
        )}

        {attention.length > 0 && (
          <section className="mt-6 rounded-lg border border-accent/30 bg-surface">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Needs attention</h2>
            <ul>
              {attention.map(({ site, viewport }) => (
                <li key={`${site.id}-${viewport.name}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-sm first:border-t-0">
                  <a href={`#site-${site.id}`} className="mr-auto font-medium hover:text-accent">
                    {site.name} <span className="font-normal text-muted">{viewport.name}</span>
                  </a>
                  <span className="tabular-nums text-muted">{formatSimilarity(viewport.similarity)}</span>
                  <StatusBadge status={viewport.status} />
                  <span className={`w-28 text-right ${viewport.stale ? 'font-semibold text-accent' : 'text-muted'}`}>
                    {timeAgo(viewport.checkedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {payload.groups.map((group) => (
          <section key={group.name} className="mt-8">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="mr-auto text-lg font-semibold">
                {group.name} <span className="text-sm font-normal text-muted">{plural(group.sites.length, 'site')}</span>
              </h2>
              <ActionButton
                onClick={() => runBatch('check', group.sites, `"${group.name}"`)}
                disabled={batch !== null}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Check group
              </ActionButton>
              <ActionButton
                onClick={() => runBatch('rebase', group.sites, `"${group.name}"`)}
                disabled={batch !== null}
                icon={<Camera className="h-3.5 w-3.5" />}
              >
                Rebase group
              </ActionButton>
            </div>
            <ul className="rounded-lg border border-line bg-surface">
              {group.sites.map((site) => (
                <SiteRow
                  key={site.id}
                  site={site}
                  busy={busy.has(site.id)}
                  onAction={runOne}
                  onOpenImage={(s, viewport, kind) => setViewer({ site: s, viewport, kind })}
                />
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-8 text-xs text-muted">
          Checks older than {payload.staleAfterHours} h are marked in pink. Updated {timeAgo(payload.generatedAt)}.
        </p>
      </main>

      {viewer && (
        <ImageViewer site={viewer.site} viewport={viewer.viewport} initial={viewer.kind} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}
