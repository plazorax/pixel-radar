import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { SiteView, ViewportView } from '../../../src/shared/types.ts';

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
      className="fixed inset-0 z-50 flex flex-col bg-ink/90"
      onClick={onClose}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-white" onClick={(event) => event.stopPropagation()}>
        <div className="mr-auto min-w-0">
          <p className="truncate font-semibold">{site.name}</p>
          <p className="text-sm text-white/70">
            {viewport.name}, {viewport.width}×{viewport.height}
          </p>
        </div>
        <div className="flex rounded-md bg-white/10 p-0.5" role="group" aria-label="Image (left and right arrow keys switch)">
          {available.map((candidate) => (
            <button
              key={candidate}
              aria-pressed={candidate === kind}
              onClick={() => setKind(candidate)}
              className={`rounded px-3 py-1 text-sm ${candidate === kind ? 'bg-white text-ink' : 'text-white hover:bg-white/10'}`}
            >
              {LABELS[candidate]}
            </button>
          ))}
        </div>
        <button ref={closeButton} onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4" onClick={(event) => event.stopPropagation()}>
        {src && <img src={src} alt={`${LABELS[kind]} screenshot of ${site.name}`} className="mx-auto max-w-full bg-white" />}
      </div>
    </div>
  );
}
