const MARK = "M5 4h8v6h-2v12h2v6H5zM15 4h6v6h-6zM23 5h4v4h-4zM15 22h6v6h-6zM23 23h4v4h-4z";

export function Mark({ size = 24, className = "", tile = false }: { size?: number; className?: string; tile?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      {tile ? (
        <>
          <rect width="32" height="32" rx="7" fill="currentColor" />
          <path d={MARK} fill="var(--color-paper)" />
        </>
      ) : (
        <path d={MARK} fill="currentColor" />
      )}
    </svg>
  );
}
