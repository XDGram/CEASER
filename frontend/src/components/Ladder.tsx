import { useState } from "react";
import { fromUnits } from "../lib/near";
import { PRESETS, rungAmounts, validate, type Rung } from "../lib/ladder";

export type RungStatus = "waiting" | "armed" | "ripe" | "claimed" | "released";

/** Contract limit: roi_ladder takes 1 to 10 tranches. */
const MAX_RUNGS = 10;

/**
 * The ladder, drawn as steps. Each step shows the target multiple it needs,
 * what it releases and what stays protected after it.
 *
 *  - edit    the step list is editable, with a running total warning
 *  - preview read-only summary of the same steps
 *  - live    steps tinted by their on-chain status, with a marker showing
 *            where the mock oracle TWAP currently sits
 *
 * Targets are multiples of the reference TWAP the vault captured when the
 * lock was created, never of anything quoted now.
 */
export function Ladder({
  mode,
  rungs,
  total,
  decimals,
  symbol,
  onChange,
  status,
  progressMultiple,
}: {
  mode: "edit" | "preview" | "live";
  rungs: Rung[];
  total: bigint;
  decimals: number;
  symbol: string;
  onChange?: (r: Rung[]) => void;
  status?: RungStatus[];
  progressMultiple?: number | null;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const amounts = rungAmounts(total, rungs);
  const problem = validate(rungs);
  const amt = (v: bigint) => fromUnits(v < 0n ? 0n : v, decimals, 0);
  const marker = mode === "live" ? markerFraction(rungs, progressMultiple ?? null) : null;

  const edit = (i: number, field: keyof Rung, raw: string) => {
    setDrafts((d) => ({ ...d, [`${i}:${field}`]: raw }));
    const n = raw.trim() === "" ? NaN : Number(raw);
    onChange?.(rungs.map((r, j) => (j === i ? { ...r, [field]: n } : r)));
  };

  const add = () => {
    if (!onChange || rungs.length >= MAX_RUNGS) return;
    const last = rungs[rungs.length - 1];
    // Split the last step so the total stays at 100%.
    const half = last ? last.pct / 2 : 100;
    const next = last ? { pct: last.pct - half, multiple: last.multiple * 2 } : { pct: 100, multiple: 2 };
    setDrafts({});
    onChange([...rungs.slice(0, -1), ...(last ? [{ ...last, pct: half }] : []), next]);
  };

  const remove = (i: number) => {
    if (!onChange || rungs.length <= 1) return;
    const rest = rungs.filter((_, j) => j !== i);
    // Hand the freed portion to the top step so the total stays at 100%.
    rest[rest.length - 1] = { ...rest[rest.length - 1], pct: rest[rest.length - 1].pct + rungs[i].pct };
    setDrafts({});
    onChange(rest);
  };

  return (
    <div>
      <div className={`relative ${mode === "edit" ? "" : "overflow-hidden rounded-lg border border-line"}`}>
        <ol className={mode === "edit" ? "flex flex-col" : "flex flex-col"}>
          {rungs.map((r, i) => {
            const a = amounts[i] ?? { unlock: 0n, protectedAfter: 0n };
            const st = mode === "live" ? status?.[i] : undefined;
            const held = total > 0n ? Number(((a.protectedAfter < 0n ? 0n : a.protectedAfter) * 1000n) / total) / 10 : 0;
            return (
              <li
                key={i}
                className={[
                  "relative border-b border-line last:border-0 px-3",
                  mode === "edit" ? "py-3" : "h-[62px] flex flex-col justify-center",
                  st === "ripe" ? "bg-ok/5 border-l-2 border-l-ok" : "",
                  st === "armed" ? "border-l-2 border-l-ink" : "",
                  st === "claimed" || st === "released" ? "opacity-55" : "",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="pixel text-[11px] text-ink-3 w-4 shrink-0">{i + 1}</span>
                  {mode === "edit" ? (
                    <span className="flex items-center gap-1.5 flex-wrap text-[13px] text-ink-2">
                      Unlock
                      <input
                        className="input !w-[62px] !px-2 !py-1 text-center text-[13px]"
                        inputMode="decimal"
                        aria-label={`Step ${i + 1} portion, percent`}
                        value={shown(drafts[`${i}:pct`], r.pct)}
                        onChange={(e) => edit(i, "pct", e.target.value)}
                      />
                      % at
                      <input
                        className="input !w-[62px] !px-2 !py-1 text-center text-[13px]"
                        inputMode="decimal"
                        aria-label={`Step ${i + 1} target multiple`}
                        value={shown(drafts[`${i}:multiple`], r.multiple)}
                        onChange={(e) => edit(i, "multiple", e.target.value)}
                      />
                      x
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm !px-1.5"
                        disabled={rungs.length <= 1}
                        onClick={() => remove(i)}
                        aria-label={`Remove step ${i + 1}`}
                        title="Remove this step"
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className="pixel text-[17px] text-ink">{fmtMultiple(r.multiple)}x</span>
                      <span className="text-[12px] text-ink-2">
                        unlocks <span className="pixel text-[12px] text-ink">{amt(a.unlock)}</span> {symbol}
                      </span>
                      {st && (
                        <span className={`tag ml-auto ${st === "ripe" ? "tag-ok" : st === "armed" ? "tag-live" : "tag-muted"}`}>{st}</span>
                      )}
                    </>
                  )}
                </div>

                {mode === "edit" && (
                  <div className="mt-1.5 pl-6 text-[11.5px] text-ink-2">
                    at <span className="pixel text-[12px] text-ink">{fmtMultiple(r.multiple)}x</span> releases{" "}
                    <span className="pixel text-[12px] text-ink">{amt(a.unlock)}</span> {symbol}
                    <span className="text-ink-3">
                      {" · "}
                      <span className="pixel text-[12px]">{amt(a.protectedAfter)}</span> still protected
                    </span>
                  </div>
                )}
                {mode !== "edit" && (
                  <div className="mt-1 pl-6 flex items-center gap-2">
                    <span className="h-[3px] rounded-full bg-ink/15 w-full max-w-[140px] overflow-hidden">
                      <span className="block h-full rounded-full bg-ink" style={{ width: `${held}%` }} />
                    </span>
                    <span className="text-[11px] text-ink-3">
                      <span className="pixel text-[11px]">{amt(a.protectedAfter)}</span> still protected
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {marker !== null && (
          <div className="pointer-events-none absolute inset-x-0" style={{ top: `${marker * 100}%` }} aria-hidden>
            <div className="relative -translate-y-1/2">
              <div className="border-t border-dashed border-accent" />
              <span className="absolute right-1 -top-2.5 bg-paper px-1 text-[9.5px] font-mono uppercase tracking-[0.1em] text-accent-2 whitespace-nowrap">
                Mock oracle TWAP (testnet) · <span className="pixel text-[10px]">{fmtMultiple(progressMultiple ?? 1)}x</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {mode === "edit" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-outline btn-sm" disabled={rungs.length >= MAX_RUNGS} onClick={add}>
            + Add a step
          </button>
          <span className={`text-[12px] ${problem ? "text-bad" : "text-ink-2"}`}>
            {problem ?? `${rungs.length} step${rungs.length === 1 ? "" : "s"} · adds up to 100%`}
          </span>
        </div>
      )}
      {mode === "live" && progressMultiple === null && (
        <p className="mt-2 text-[11.5px] text-ink-3">The mock oracle has no reading for this token yet.</p>
      )}
    </div>
  );
}

/** Preset chips that fill an editable ladder. */
export function LadderPresets({ rungs, onPick }: { rungs: Rung[]; onPick: (r: Rung[]) => void }) {
  const same = (a: Rung[], b: Rung[]) => a.length === b.length && a.every((x, i) => x.pct === b[i].pct && x.multiple === b[i].multiple);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`pill cursor-pointer !normal-case !tracking-normal ${same(rungs, p.rungs) ? "border-ink text-ink" : "hover:border-ink"}`}
          onClick={() => onPick(p.rungs.map((r) => ({ ...r })))}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** Keeps half-typed text ("1." or "") while the parsed value still matches. */
function shown(draft: string | undefined, actual: number): string {
  if (draft !== undefined) {
    const n = draft.trim() === "" ? NaN : Number(draft);
    if ((Number.isNaN(n) && Number.isNaN(actual)) || n === actual) return draft;
  }
  return Number.isFinite(actual) ? String(actual) : "";
}

function fmtMultiple(m: number): string {
  if (!Number.isFinite(m)) return "—";
  return Number.isInteger(m) ? String(m) : String(Math.round(m * 100) / 100);
}

/**
 * Where to draw the TWAP marker, as a fraction of the list height. Steps sit
 * at the centre of their row and 1x sits at the top edge, so the marker is
 * interpolated between them on a log scale.
 */
function markerFraction(rungs: Rung[], m: number | null): number | null {
  if (m === null || !Number.isFinite(m) || !rungs.length) return null;
  const n = rungs.length;
  const pos = (i: number) => (i + 0.5) / n;
  if (m <= 1) return 0;
  if (m >= rungs[n - 1].multiple) return 1;
  let i = rungs.findIndex((r) => r.multiple >= m);
  if (i < 0) i = n - 1;
  const lo = i === 0 ? 1 : rungs[i - 1].multiple;
  const loPos = i === 0 ? 0 : pos(i - 1);
  const hi = rungs[i].multiple;
  if (!(hi > lo)) return loPos;
  const t = (Math.log(m) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return Math.min(1, Math.max(0, loPos + t * (pos(i) - loPos)));
}
