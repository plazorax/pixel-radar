import { Camera, Check, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { formatSimilarity, formatThreshold } from '../../../src/shared/status.ts';
import type { SiteAction, SiteView, ViewportView } from '../../../src/shared/types.ts';
import { timeAgo } from '../format.ts';
import { STATUS_TONE, TONE_TEXT } from '../statusTone.ts';
import Button from './Button.tsx';
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

const ICON = 'h-3.5 w-3.5';

export default function SiteRow({ site, busy, onAction, onOpenImage }: Props) {
  const canAccept = site.viewports.some(
    (viewport) => viewport.images.current && (viewport.status === 'changed' || viewport.status === 'no_baseline'),
  );

  return (
    <li
      id={`site-${site.id}`}
      className="relative grid scroll-mt-4 gap-4 border-t border-line px-4 py-4 first:border-t-0 lg:grid-cols-[15rem_1fr] lg:gap-6"
    >
      <div className="min-w-0">
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex max-w-full items-center gap-1 font-semibold hover:underline"
        >
          <span className="truncate">{site.name}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-faint group-hover:text-ink" aria-hidden="true" />
        </a>
        <p className="truncate font-mono text-xs text-muted">{site.url}</p>
        <p className="mt-1 text-xs text-faint">
          Threshold <span className="font-mono">{formatThreshold(site.minSimilarity)}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button onClick={() => onAction(site, 'check')} disabled={busy} icon={<RefreshCw className={ICON} />}>
            Check
          </Button>
          <Button onClick={() => onAction(site, 'rebase')} disabled={busy} icon={<Camera className={ICON} />}>
            Rebase
          </Button>
          {canAccept && (
            <Button onClick={() => onAction(site, 'accept')} disabled={busy} icon={<Check className={ICON} />}>
              Accept current
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {site.viewports.map((viewport) => (
          <div key={viewport.name} className="grid gap-3 sm:grid-cols-[9rem_1fr]">
            <div className="min-w-0">
              <p className="flex items-baseline gap-1.5">
                <span className="font-medium">{viewport.name}</span>
                <span className="font-mono text-xs text-faint">
                  {viewport.width}×{viewport.height}
                </span>
              </p>
              <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${similarityColor(viewport)}`}>
                {formatSimilarity(viewport.similarity)}
              </p>
              <div className="mt-1">
                <StatusBadge status={viewport.status} />
              </div>
              <p className={`mt-1.5 text-xs ${viewport.stale ? 'font-medium text-warn' : 'text-muted'}`}>
                Checked <span className="font-mono">{timeAgo(viewport.checkedAt)}</span>
                {viewport.stale && ' (stale)'}
              </p>
              {viewport.error && <p className="mt-1 font-mono text-xs break-words text-warn">{viewport.error}</p>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {THUMBS.map(({ kind, label }) => {
                const src = viewport.images[kind];
                return (
                  <figure key={kind} className="min-w-0">
                    {src ? (
                      <button
                        type="button"
                        onClick={() => onOpenImage(site, viewport, kind)}
                        className="block aspect-[16/10] w-full overflow-hidden rounded-sm border border-line bg-subtle hover:border-faint"
                        aria-label={`Open ${label.toLowerCase()} screenshot`}
                      >
                        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                      </button>
                    ) : (
                      <div className="flex aspect-[16/10] items-center justify-center rounded-sm border border-dashed border-line-strong bg-subtle text-xs text-faint">
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
          <LoaderCircle className="h-5 w-5 animate-spin text-muted" aria-hidden="true" />
          <span className="sr-only">Working on {site.name}</span>
        </div>
      )}
    </li>
  );
}

function similarityColor(viewport: ViewportView): string {
  if (viewport.similarity === null) return 'text-faint';
  return STATUS_TONE[viewport.status] === 'changed' ? TONE_TEXT.changed : 'text-ink';
}
