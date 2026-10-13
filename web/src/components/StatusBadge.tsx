import { STATUS_LABELS, type Status } from '../../../src/shared/status.ts';
import { STATUS_TONE, TONE_BADGE } from '../statusTone.ts';

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1.5 rounded border px-1.5 text-xs font-medium whitespace-nowrap ${TONE_BADGE[STATUS_TONE[status]]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
