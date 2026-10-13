import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, LogOut, RefreshCw, X } from 'lucide-react';
import { DISPLAY_NAME } from '../../../src/shared/app.ts';
import { api, UnauthorizedError } from '../api.ts';
import { countByStatus, formatSimilarity, needsAttention, STATUS_LABELS, type Status } from '../../../src/shared/status.ts';
import type { SiteAction, SitesPayload, SiteView, ViewportView } from '../../../src/shared/types.ts';
import { plural, timeAgo } from '../format.ts';
import { STATUS_TONE, TONE_TEXT } from '../statusTone.ts';
import Button from './Button.tsx';
import ImageViewer, { type ImageKind } from './ImageViewer.tsx';
import Logo from './Logo.tsx';
import SiteRow from './SiteRow.tsx';
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
/** Always shown in the summary bar; other statuses appear only when present. */
const SUMMARY_STATUSES: Status[] = ['ok', 'changed', 'no_baseline', 'unavailable', 'error'];
const OPTIONAL_STATUSES: Status[] = ['baseline_updated', 'unknown'];
const ICON = 'h-3.5 w-3.5';

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
        <p className="text-warn" role="alert">
          Could not load sites: {loadError}
        </p>
      </main>
    );
  }
  if (!payload) return null;

  const sites = payload.groups.flatMap((group) => group.sites);
  const viewports = sites.flatMap((site) => site.viewports.map((viewport) => ({ site, viewport })));
  const attention = viewports.filter(({ viewport }) => needsAttention(viewport.status) || viewport.stale);
  const counts = countByStatus(viewports.map(({ viewport }) => viewport.status));
  const summary = [...SUMMARY_STATUSES, ...OPTIONAL_STATUSES.filter((status) => counts[status] > 0)];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5">
          <div className="mr-auto flex items-center gap-2">
            <Logo />
            <h1 className="text-[15px] font-semibold tracking-tight">{DISPLAY_NAME}</h1>
          </div>
          <Button
            primary
            onClick={() => runBatch('check', sites, 'all groups')}
            disabled={batch !== null}
            icon={<RefreshCw className={ICON} />}
          >
            Check all
          </Button>
          <Button
            onClick={() => runBatch('rebase', sites, 'all groups')}
            disabled={batch !== null}
            icon={<Camera className={ICON} />}
          >
            Rebase all
          </Button>
          {canLogOut && (
            <Button onClick={onLogOut} icon={<LogOut className={ICON} />}>
              Log out
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <section aria-label="Summary" className="rounded-md border border-line bg-surface">
          <dl className="flex flex-wrap">
            <SummaryCell label="Screenshots" value={viewports.length} detail={plural(sites.length, 'site')} />
            {summary.map((status) => (
              <SummaryCell
                key={status}
                label={STATUS_LABELS[status]}
                value={counts[status]}
                tone={counts[status] > 0 && isAlert(status) ? TONE_TEXT[STATUS_TONE[status]] : undefined}
                dot={STATUS_TONE[status]}
              />
            ))}
            <div className="ml-auto flex flex-col justify-center px-4 py-2.5">
              <dt className="text-xs text-muted">Updated</dt>
              <dd className="font-mono text-[13px] tabular-nums">{timeAgo(payload.generatedAt)}</dd>
            </div>
          </dl>
        </section>

        {batch && (
          <div className="mt-4" aria-live="polite">
            <p className="text-[13px] text-muted">
              {batch.verb} <span className="font-mono tabular-nums">{Math.min(batch.done + 1, batch.total)}</span> of{' '}
              {plural(batch.total, 'site')}…
            </p>
            <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-ink transition-[width]" style={{ width: `${(batch.done / batch.total) * 100}%` }} />
            </div>
          </div>
        )}

        {notice && (
          <div
            className="mt-4 flex items-start justify-between gap-4 rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-warn"
            role="alert"
          >
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-warn/10" aria-label="Dismiss">
              <X className={ICON} />
            </button>
          </div>
        )}

        {attention.length > 0 && (
          <section aria-labelledby="attention-heading" className="mt-5 overflow-hidden rounded-md border border-line bg-surface">
            <h2 id="attention-heading" className="flex items-baseline gap-2 border-b border-line px-4 py-2.5 font-semibold">
              Needs attention <span className="font-mono text-xs font-normal text-muted">{attention.length}</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-subtle text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-1.5 font-medium">Site</th>
                    <th scope="col" className="px-3 py-1.5 font-medium">Viewport</th>
                    <th scope="col" className="px-3 py-1.5 font-medium">Status</th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">Similarity</th>
                    <th scope="col" className="px-4 py-1.5 text-right font-medium">Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {attention.map(({ site, viewport }) => (
                    <tr key={`${site.id}-${viewport.name}`} className="border-t border-line hover:bg-subtle">
                      <td className="px-4 py-2">
                        <a href={`#site-${site.id}`} className="font-medium hover:underline">
                          {site.name}
                        </a>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted">{viewport.name}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={viewport.status} />
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono tabular-nums ${
                          viewport.status === 'changed' ? TONE_TEXT.changed : 'text-muted'
                        }`}
                      >
                        {formatSimilarity(viewport.similarity)}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-mono text-xs whitespace-nowrap ${viewport.stale ? 'font-medium text-warn' : 'text-muted'}`}
                      >
                        {timeAgo(viewport.checkedAt)}
                        {viewport.stale && ' (stale)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {payload.groups.map((group) => (
          <section key={group.name} aria-label={group.name} className="mt-7">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto flex items-baseline gap-2 font-semibold">
                {group.name}
                <span className="text-xs font-normal text-muted">{plural(group.sites.length, 'site')}</span>
              </h2>
              <Button
                onClick={() => runBatch('check', group.sites, `"${group.name}"`)}
                disabled={batch !== null}
                icon={<RefreshCw className={ICON} />}
              >
                Check group
              </Button>
              <Button
                onClick={() => runBatch('rebase', group.sites, `"${group.name}"`)}
                disabled={batch !== null}
                icon={<Camera className={ICON} />}
              >
                Rebase group
              </Button>
            </div>
            <ul className="rounded-md border border-line bg-surface">
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

        <p className="mt-6 text-xs text-muted">Checks older than {payload.staleAfterHours} h are marked stale.</p>
      </main>

      {viewer && (
        <ImageViewer site={viewer.site} viewport={viewer.viewport} initial={viewer.kind} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  detail,
  tone,
  dot,
}: {
  label: string;
  value: number;
  detail?: string;
  tone?: string;
  dot?: keyof typeof DOT;
}) {
  return (
    <div className="flex min-w-28 flex-col justify-center border-r border-line px-4 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[dot]}`} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="flex items-baseline gap-2">
        <span className={`font-mono text-lg font-semibold tabular-nums ${tone ?? (value === 0 ? 'text-faint' : 'text-ink')}`}>
          {value}
        </span>
        {detail && <span className="text-xs text-muted">{detail}</span>}
      </dd>
    </div>
  );
}

/** Counts that are coloured in the summary bar; OK and neutral counts stay ink. */
function isAlert(status: Status): boolean {
  const tone = STATUS_TONE[status];
  return tone === 'changed' || tone === 'warn';
}

const DOT = {
  ok: 'bg-ok',
  changed: 'bg-changed',
  warn: 'bg-warn',
  neutral: 'bg-faint',
} as const;
