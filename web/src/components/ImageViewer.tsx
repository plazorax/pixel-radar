import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { formatSimilarity } from '../../../src/shared/status.ts';
import type { SiteView, ViewportView } from '../../../src/shared/types.ts';
import StatusBadge from './StatusBadge.tsx';

export type ImageKind = 'baseline' | 'current' | 'diff';

const LABELS: Record<ImageKind, string> = { baseline: 'Baseline', current: 'Current', diff: 'Diff' };
const KINDS: ImageKind[] = ['baseline', 'current', 'diff'];

interface Props {
  site: SiteView;
  viewport: ViewportView;
  initial: ImageKind;
  onClose: () => void;
}

export default function ImageViewer({ site, viewport, initial, onClose }: Props) {
  const available = KINDS.filter((kind) => viewport.images[kind]);
  const [kind, setKind] = useState<ImageKind>(initial);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog and give it back to the thumbnail that opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        setKind((current) => {
          const index = available.indexOf(current);
          const step = event.key === 'ArrowRight' ? 1 : available.length - 1;
          return available[(index + step) % available.length] ?? current;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [available, onClose]);

  const src = viewport.images[kind];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${site.name} screenshots`}
      className="fixed inset-0 z-50 flex flex-col bg-[#16181c]"
      onClick={onClose}
    >
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 bg-[#16181c] px-4 py-2.5 text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <p className="truncate font-semibold">{site.name}</p>
          <p className="font-mono text-xs text-white/60">
            {viewport.name} {viewport.width}×{viewport.height}
          </p>
          <p className="font-mono text-xs text-white/80 tabular-nums">{formatSimilarity(viewport.similarity)}</p>
          <StatusBadge status={viewport.status} />
        </div>
        <span className="hidden text-xs text-white/50 md:inline">← → switch, Esc closes</span>
        <div
          className="flex rounded-md border border-white/15 p-0.5"
          role="group"
          aria-label="Image (left and right arrow keys switch)"
        >
          {available.map((candidate) => (
            <button
              type="button"
              key={candidate}
              aria-pressed={candidate === kind}
              onClick={() => setKind(candidate)}
              className={`rounded px-2.5 py-0.5 text-[13px] font-medium ${
                candidate === kind ? 'bg-white text-ink' : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              {LABELS[candidate]}
            </button>
          ))}
        </div>
        <button
          type="button"
          ref={closeButton}
          onClick={onClose}
          className="rounded p-1 text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4" onClick={(event) => event.stopPropagation()}>
        {src && (
          <img
            src={src}
            alt={`${LABELS[kind]} screenshot of ${site.name}`}
            className="mx-auto max-w-full border border-white/10 bg-white"
          />
        )}
      </div>
    </div>
  );
}
