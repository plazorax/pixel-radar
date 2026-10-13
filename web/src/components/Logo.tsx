// Pixel Radar mark: a pixel-grid radar ring with a sweep and one detected "blip".
// Drawn on a 16-unit grid so it stays crisp at 16 px. Same artwork as docs/logo.svg.
const MARK = 'M6 2h4v1h-4zM4 3h2v1h-2zM10 3h2v1h-2zM3 4h1v1h-1zM8 4h2v1h-2zM12 4h1v1h-1zM3 5h1v1h-1zM8 5h3v1h-3zM12 5h1v1h-1zM2 6h1v1h-1zM8 6h4v1h-4zM13 6h1v1h-1zM2 7h1v1h-1zM8 7h1v1h-1zM13 7h1v1h-1zM2 8h1v1h-1zM13 8h1v1h-1zM2 9h1v1h-1zM6 9h2v1h-2zM13 9h1v1h-1zM3 10h1v1h-1zM6 10h2v1h-2zM12 10h1v1h-1zM3 11h1v1h-1zM12 11h1v1h-1zM4 12h2v1h-2zM10 12h2v1h-2zM6 13h4v1h-4z';

export default function Logo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <rect width="16" height="16" rx="3" className="fill-ink" />
      <path d={MARK} className="fill-white" />
    </svg>
  );
}
