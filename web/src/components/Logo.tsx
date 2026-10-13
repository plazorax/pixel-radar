export default function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="4" y="4" width="18" height="18" rx="3" className="fill-ink" />
      <rect x="10" y="10" width="18" height="18" rx="3" fill="none" strokeWidth="3" className="stroke-accent" />
    </svg>
  );
}
