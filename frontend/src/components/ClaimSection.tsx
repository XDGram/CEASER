import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CONFIG } from "../config";
import { decodeResult, fmtDate, fmtDur, fromUnits, mult, nowTs, pct, view } from "../lib/near";
import { useProtocol } from "../lib/protocol";
import { errorText, useWallet } from "../lib/wallet";
import type { Condition, Lock, Tranche } from "../lib/types";
import { Busy, SectionHead } from "./SectionHead";

function condText(c: Condition, lock: Lock, decimals: number): string {
  if ("price_above" in c) {
    const ref = lock.reference_price ? ` (ref $${fromUnits(lock.reference_price, 8, 4)})` : "";
    return `price ≥ ${mult(c.price_above.multiplier_bps)} of lock price${ref}`;
  }
  if ("time_after" in c) return `after ${fmtDate(c.time_after.ts)}`;
  return `Challenge #${c.challenge_finalized.challenge_id} finalized`;
  void decimals;
}

function trancheStatus(t: Tranche, lock: Lock, cooldown: number): { label: string; cls: string } {
  if (t.claimed) return { label: "claimed", cls: "tag-muted" };
  const tail = nowTs() >= lock.start_ts + lock.max_duration_sec;
  if (tail) return { label: "claimable · max duration", cls: "tag-ok" };
  if (t.ripe) return { label: "ripe", cls: "tag-ok" };
  if (t.armed_at_ts) {
    const left = t.armed_at_ts + cooldown - nowTs();
    return { label: left > 0 ? `armed · ${fmtDur(left)} cooldown` : "armed · recheck now", cls: "tag-live" };
  }
  const timeMet = t.conditions.some((c) => "time_after" in c && nowTs() >= c.time_after.ts);
  if (timeMet) return { label: "claimable", cls: "tag-ok" };
  return { label: "not met", cls: "tag-muted" };
}

function LockCard({ lock }: { lock: Lock }) {
  const { meta, config, refresh, refreshUser, challenges } = useProtocol();
  const { call, toast } = useWallet();
  const tm = meta(lock.token);
  const [busy, setBusy] = useState<string | null>(null);
  const [claimable, setClaimable] = useState<{ principal: string; base_reward: string } | null>(null);
  const cooldown = config?.cooldown_sec ?? 600;
  const challenge = lock.challenge_id ? challenges.find((c) => c.id === lock.challenge_id) : undefined;
  const remaining = BigInt(lock.amount) - BigInt(lock.claimed_amount);

  useEffect(() => {
    if (lock.status !== "active") return;
    view<{ principal: string; base_reward: string }>(CONFIG.contracts.vault, "get_claimable", { lock_id: lock.id })
      .then(setClaimable)
      .catch(() => setClaimable(null));
  }, [lock]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      await Promise.all([refresh(), refreshUser()]);
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setBusy(null);
    }
  };

  const canClaim = claimable && (BigInt(claimable.principal) > 0n || BigInt(claimable.base_reward) > 0n);
  const committed = challenge?.state === "active";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ duration: 0.45 }} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono text-ink-3">
            Lock #{lock.id} · {fmtDate(lock.start_ts)}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="pixel text-[24px]">{fromUnits(remaining, tm.decimals, 0)}</span>
            <span className="text-[12px] text-ink-2">
              {tm.symbol} remaining of {fromUnits(lock.amount, tm.decimals, 0)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`tag ${lock.status === "active" ? "tag-live" : "tag-muted"}`}>{lock.status}</span>
          {challenge && (
            <span className={`tag ${challenge.state === "succeeded" ? "tag-ok" : challenge.state === "failed" ? "tag-bad" : "tag-muted"}`}>
              #{challenge.id} {challenge.state}
            </span>
          )}
          {lock.staking_pool && <span className="tag tag-muted">boost pool</span>}
        </div>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line">
        {lock.tranches.map((t, i) => {
          const st = trancheStatus(t, lock, cooldown);
          const hasPrice = t.conditions.some((c) => "price_above" in c);
          return (
            <li key={i} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
              <span className="font-mono text-ink-2 w-12">{pct(t.fraction_bps)}</span>
              <span className="flex-1 min-w-[180px] text-ink">{t.conditions.map((c) => condText(c, lock, tm.decimals)).join(" or ") || "max duration"}</span>
              <span className={`tag ${st.cls}`}>{st.label}</span>
              {hasPrice && !t.claimed && !t.ripe && lock.status === "active" && (
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`check${i}`, async () => {
                      const out = await call(CONFIG.contracts.vault, "check_unlock", { lock_id: lock.id, tranche_idx: i }, CONFIG.gas.call);
                      const v = decodeResult<string>(out);
                      if (v) toast(`Tranche ${i + 1}: ${v.replace("_", " ")}`, v === "ripe" ? "ok" : "info");
                    })
                  }
                >
                  <Busy on={busy === `check${i}`}>check_unlock</Busy>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {lock.status === "active" && (
          <>
            <button
              className="btn btn-accent btn-sm"
              disabled={busy !== null || !canClaim}
              onClick={() =>
                run("claim", async () => {
                  const out = await call(CONFIG.contracts.vault, "claim", { lock_id: lock.id }, CONFIG.gas.call);
                  const v = decodeResult<{ principal: string; reward: string; boost_bps: number }>(out);
                  if (v) toast(`Claimed ${fromUnits(v.principal, tm.decimals)} ${tm.symbol} principal + ${fromUnits(v.reward, tm.decimals)} reward at ${mult(v.boost_bps)}`, "ok");
                })
              }
            >
              <Busy on={busy === "claim"}>Claim</Busy>
            </button>
            <button
              className="btn btn-danger btn-sm"
              disabled={busy !== null}
              onClick={() => {
                const penalty = (remaining * BigInt(lock.penalty_bps)) / 10000n;
                if (!window.confirm(`Exit lock #${lock.id} now? Up to ${fromUnits(penalty, tm.decimals)} ${tm.symbol} (${pct(lock.penalty_bps)}) goes to the penalty sink.`)) return;
                run("exit", async () => {
                  const out = await call(CONFIG.contracts.vault, "early_exit", { lock_id: lock.id }, CONFIG.gas.call);
                  const v = decodeResult<{ returned: string; penalty: string }>(out);
                  if (v) toast(`Returned ${fromUnits(v.returned, tm.decimals)} ${tm.symbol}, penalty ${fromUnits(v.penalty, tm.decimals)}`, "ok");
                });
              }}
            >
              <Busy on={busy === "exit"}>Early exit · {pct(lock.penalty_bps)}</Busy>
            </button>
            <span className="text-[12px] text-ink-2">
              {committed
                ? "Committed until the Challenge is finalized"
                : claimable
                  ? `Claimable now: ${fromUnits(claimable.principal, tm.decimals)} ${tm.symbol}${BigInt(claimable.base_reward) > 0n ? ` + ${fromUnits(claimable.base_reward, tm.decimals)} base reward` : ""}`
                  : ""}
            </span>
          </>
        )}
        {lock.status !== "active" && <span className="text-[12px] text-ink-2">Paid out {fromUnits(lock.claimed_amount, tm.decimals)} {tm.symbol}.</span>}
      </div>
    </motion.div>
  );
}

export function ClaimSection() {
  const { accountId, connect } = useWallet();
  const { locks, boostBps, refreshUser } = useProtocol();
  const open = locks.filter((l) => l.status === "active");
  const done = locks.filter((l) => l.status !== "active");

  return (
    <section id="claim" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-20 scroll-mt-20">
      <SectionHead
        n="03"
        title="Your locks"
        sub="Check price tranches, claim what ripened, or leave early and pay the stayers."
        action={
          accountId ? (
            <div className="flex items-center gap-3">
              <span className="pill border-ink text-ink">boost {mult(boostBps)}</span>
              <button className="btn btn-outline btn-sm" onClick={refreshUser}>
                Refresh
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={connect}>
              Connect wallet
            </button>
          )
        }
      />
      <div className="mt-6 grid lg:grid-cols-2 gap-4">
        {open.map((l) => (
          <LockCard key={l.id} lock={l} />
        ))}
        {accountId && !locks.length && <div className="card p-8 text-[13px] text-ink-2 lg:col-span-2">No locks yet for this account. Create one above.</div>}
        {!accountId && <div className="card p-8 text-[13px] text-ink-2 lg:col-span-2">Connect a wallet to see your locks.</div>}
      </div>
      {done.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] text-ink-2 hover:text-ink">
            {done.length} closed or exited lock{done.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-4 grid lg:grid-cols-2 gap-4">
            {done.map((l) => (
              <LockCard key={l.id} lock={l} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
