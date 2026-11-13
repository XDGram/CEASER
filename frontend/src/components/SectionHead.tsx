import type { ReactNode } from "react";

export function SectionHead({ n, title, sub, action }: { n: string; title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 border-b border-line pb-4">
      <div className="flex items-baseline gap-4">
        <span className="pixel text-[13px] text-accent">{n}</span>
        <div>
          <h2 className="text-[22px] sm:text-[26px] tracking-tight text-ink leading-tight">{title}</h2>
          <p className="text-[13px] text-ink-2 mt-0.5">{sub}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export function Row({ k, v, mono = false }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-line last:border-0">
      <span className="text-[11px] uppercase tracking-[0.12em] text-ink-2 font-mono">{k}</span>
      <span className={`text-[13px] text-ink text-right ${mono ? "font-mono text-[12px]" : ""}`}>{v}</span>
    </div>
  );
}

export function Busy({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? (
    <>
      <span className="spinner" /> Working
    </>
  ) : (
    <>{children}</>
  );
}
