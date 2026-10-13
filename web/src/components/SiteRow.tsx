import { Check, ExternalLink, RefreshCw, Camera } from 'lucide-react';
import { formatSimilarity } from '../../../src/shared/status.ts';
import type { SiteAction, SiteView, ViewportView } from '../../../src/shared/types.ts';
import { timeAgo } from '../format.ts';
import type { ImageKind } from './ImageViewer.tsx';
import StatusBadge from './StatusBadge.tsx';

interface Props {
  site: SiteView;
  busy: boolean;
  onAction: (site: SiteView, action: SiteAction) => void;
  onOpenImage: (site: SiteView, viewport: ViewportView, kind: ImageKind) => void;
}

const THUMBS: { kind: ImageKind; label: string }[] = [
  { kind: 'baseline', label: 'Baseline' },
  { kind: 'current', label: 'Current' },
  { kind: 'diff', label: 'Diff' },
];

export default function SiteRow({ site, busy, onAction, onOpenImage }: Props) {
  const canAccept = site.viewports.some(
    (viewport) => viewport.images.current && (viewport.status === 'changed' || viewport.status === 'no_baseline'),
  );

  return (
    <li id={`site-${site.id}`} className="relative grid gap-4 border-t border-line px-4 py-5 first:border-t-0 lg:grid-cols-[16rem_1fr]">
      <div className="min-w-0">
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex max-w-full items-center gap-1 font-semibold hover:text-accent"
        >
          <span className="truncate">{site.name}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-accent" aria-hidden="true" />
        </a>
        <p className="truncate text-sm text-muted">{site.url}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton onClick={() => onAction(site, 'check')} disabled={busy} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Check
          </ActionButton>
          <ActionButton onClick={() => onAction(site, 'rebase')} disabled={busy} icon={<Camera className="h-3.5 w-3.5" />}>
            Rebase
          </ActionButton>
          {canAccept && (
            <ActionButton onClick={() => onAction(site, 'accept')} disabled={busy} icon={<Check className="h-3.5 w-3.5" />}>
              Accept current
            </ActionButton>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {site.viewports.map((viewport) => (
          <div key={viewport.name} className="grid gap-3 sm:grid-cols-[9.5rem_1fr]">
            <div>
              <p className="text-sm text-muted">
                {viewport.name} <span className="text-xs">{viewport.width}×{viewport.height}</span>
              </p>
              <p className="text-2xl font-semibold tabular-nums">{formatSimilarity(viewport.similarity)}</p>
              <StatusBadge status={viewport.status} />
              <p className={`mt-1 text-xs ${viewport.stale ? 'font-semibold text-accent' : 'text-muted'}`}>
                Checked {timeAgo(viewport.checkedAt)}
              </p>
              {viewport.error && <p className="mt-1 break-words text-xs text-warn">{viewport.error}</p>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {THUMBS.map(({ kind, label }) => {
                const src = viewport.images[kind];
                return (
                  <figure key={kind} className="min-w-0">
                    {src ? (
                      <button
                        onClick={() => onOpenImage(site, viewport, kind)}
                        className="block aspect-[16/10] w-full overflow-hidden rounded border border-line bg-paper hover:border-ink"
                        aria-label={`Open ${label.toLowerCase()} screenshot`}
                      >
                        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                      </button>
                    ) : (
                      <div className="flex aspect-[16/10] items-center justify-center rounded border border-dashed border-line text-xs text-muted">
                        None
                      </div>
                    )}
                    <figcaption className="mt-1 text-xs text-muted">{label}</figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/70" aria-live="polite">
          <RefreshCw className="h-5 w-5 animate-spin text-accent" aria-hidden="true" />
          <span className="sr-only">Working on {site.name}</span>
        </div>
      )}
    </li>
  );
}

export function ActionButton({
  children,
  icon,
  onClick,
  disabled,
  primary = false,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? 'bg-ink text-white hover:bg-ink/90' : 'border border-line bg-surface hover:border-ink'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
