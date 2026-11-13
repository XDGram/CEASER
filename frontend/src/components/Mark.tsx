export function Mark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <path d="M12 8h8v4h-4v8h4v4h-8z" fill="var(--color-paper)" />
    </svg>
  );
}
