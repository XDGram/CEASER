/* A simple geometric N mark for "Built on NEAR" labels, drawn in currentColor. */
export function NearMark({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path d="M7 17V7h1.6l7.2 7.4V7H17v10h-1.6L8.2 9.6V17z" fill="var(--color-paper)" />
    </svg>
  );
}

export function BuiltOnNear({ className = "" }: { className?: string }) {
  return (
    <a href="https://near.org" target="_blank" rel="noopener" className={`pill !normal-case !tracking-normal gap-1.5 !text-ink border-ink ${className}`} title="CEASER runs on the NEAR blockchain">
      <NearMark size={13} className="text-ink" />
      <span className="text-[11px] font-medium">Built on NEAR</span>
    </a>
  );
}
