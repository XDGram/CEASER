/**
 * The moonbag ladder: a lock releases in steps, each step gated by a target
 * multiple of the reference TWAP the vault captured when the lock was created.
 *
 * Contract rules this file encodes (contracts/vault/src/types.rs):
 *  - 1 to 10 rungs
 *  - every fraction_bps > 0, and they sum to exactly 10000
 *  - every multiplier_bps > 10000, i.e. every target is above 1x
 *
 * A rung is held here in human units: `pct` of the locked amount and a
 * `multiple` such as 5 for 5x. 5x is 50000 bps, not 10000 + 50000.
 */
export interface Rung {
  /** Portion of the locked amount this step releases, in percent. */
  pct: number;
  /** Target as a multiple of the reference TWAP, e.g. 5 for 5x. Must exceed 1. */
  multiple: number;
}

export const PRESETS: { id: "moonbag" | "steady" | "conviction"; label: string; rungs: Rung[] }[] = [
  {
    id: "moonbag",
    label: "Moonbag",
    rungs: [
      { pct: 10, multiple: 5 },
      { pct: 10, multiple: 10 },
      { pct: 20, multiple: 25 },
      { pct: 60, multiple: 100 },
    ],
  },
  {
    id: "steady",
    label: "Steady",
    rungs: [
      { pct: 25, multiple: 2 },
      { pct: 25, multiple: 3 },
      { pct: 25, multiple: 5 },
      { pct: 25, multiple: 10 },
    ],
  },
  {
    id: "conviction",
    label: "Conviction",
    rungs: [
      { pct: 50, multiple: 10 },
      { pct: 50, multiple: 50 },
    ],
  },
];

/** Contract limit: roi_ladder takes 1 to 10 tranches. */
const MAX_RUNGS = 10;

const bpsOf = (pct: number) => (Number.isFinite(pct) ? Math.round(pct * 100) : 0);
const multBpsOf = (multiple: number) => (Number.isFinite(multiple) ? Math.round(multiple * 10000) : 0);

/**
 * Rungs as the contract's tranches. The last rung absorbs rounding so the
 * fractions sum to exactly 10000, which the vault requires. Call `validate`
 * first: this does not reject a set that cannot be locked.
 */
export function toTranches(r: Rung[]): { fraction_bps: number; multiplier_bps: number }[] {
  const out = r.map((x) => ({ fraction_bps: bpsOf(x.pct), multiplier_bps: multBpsOf(x.multiple) }));
  if (out.length) {
    const head = out.slice(0, -1).reduce((a, t) => a + t.fraction_bps, 0);
    out[out.length - 1].fraction_bps = 10000 - head;
  }
  return out;
}

export function fromTranches(t: { fraction_bps: number; multiplier_bps: number }[]): Rung[] {
  return t.map((x) => ({ pct: x.fraction_bps / 100, multiple: x.multiplier_bps / 10000 }));
}

/** The reason these rungs cannot be locked, or null when they can. */
export function validate(r: Rung[]): string | null {
  if (r.length < 1) return "Add at least one step";
  if (r.length > MAX_RUNGS) return `At most ${MAX_RUNGS} steps`;
  for (let i = 0; i < r.length; i++) {
    if (bpsOf(r[i].pct) <= 0) return `Step ${i + 1} needs a portion above 0%`;
    if (multBpsOf(r[i].multiple) <= 10000) return `Step ${i + 1} needs a target above 1x`;
  }
  const total = r.reduce((a, x) => a + bpsOf(x.pct), 0);
  if (total !== 10000) return `Steps add up to ${(total / 100).toLocaleString("en-US")}%, they have to add up to 100%`;
  for (let i = 1; i < r.length; i++) {
    if (multBpsOf(r[i].multiple) <= multBpsOf(r[i - 1].multiple)) return `Step ${i + 1} has to target more than step ${i}`;
  }
  return null;
}

/**
 * What each step releases out of `total`, and what is still locked after it.
 * Mirrors the vault's own split, where the last tranche absorbs the dust, so
 * the unlocks sum to exactly `total`.
 */
export function rungAmounts(total: bigint, r: Rung[]): { unlock: bigint; protectedAfter: bigint }[] {
  const t = toTranches(r);
  const out: { unlock: bigint; protectedAfter: bigint }[] = [];
  let paid = 0n;
  t.forEach((x, i) => {
    const unlock = i === t.length - 1 ? total - paid : (total * BigInt(x.fraction_bps)) / 10000n;
    paid += unlock;
    out.push({ unlock, protectedAfter: total - paid });
  });
  return out;
}
