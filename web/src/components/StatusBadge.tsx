import { STATUS_LABELS, type Status } from '../../../src/shared/status.ts';

const STYLES: Record<Status, string> = {
  ok: 'bg-ok-soft text-ok',
  changed: 'bg-accent-soft text-accent',
  unavailable: 'bg-warn-soft text-warn',
  error: 'bg-warn-soft text-warn',
  no_baseline: 'bg-info-soft text-info',
  baseline_updated: 'bg-info-soft text-info',
  unknown: 'bg-paper text-muted',
};

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
