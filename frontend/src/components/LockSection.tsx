import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LockProgress, type LockStage } from "./LockProgress";
import { Select } from "./Select";
import { view } from "../lib/near";
import { CONFIG } from "../config";
import { datetimeToTs, fmtDate, fromUnits, localDatetimeValue, mult, nowTs, pct, toUnits } from "../lib/near";
import type { Lock } from "../lib/types";
import { useProtocol } from "../lib/protocol";
import { errorText, useWallet } from "../lib/wallet";
import { createPost } from "../lib/floor";
import type { Strategy } from "../lib/types";
import { Busy, Row, SectionHead } from "./SectionHead";
import { Ladder, LadderPresets } from "./Ladder";
import { PRESETS, toTranches, validate as validateLadder, type Rung } from "../lib/ladder";

type Kind = "time" | "roi_ladder" | "collective_threshold";
type SinkKind = "default" | "challenge" | "account";

const DEFAULT_RUNGS: Rung[] = PRESETS[0].rungs.map((r) => ({ ...r }));
const PORTIONS = [25, 50, 75, 100];

export function LockSection() {
  const { accountId, call, toast, returnedTx } = useWallet();
  const { challenges, pools, config, meta, balance, refresh, refreshUser, boostBps, staked, tiers } = useProtocol();
  const navigate = useNavigate();
  const [stage, setStage] = useState<LockStage | null>(null);
  const [stageLabel, setStageLabel] = useState("");
  const token = CONFIG.contracts.token;
  const tm = meta(token);

  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<Kind>("roi_ladder");
  const [endAt, setEndAt] = useState(() => localDatetimeValue(new Date(Date.now() + 30 * 86400e3)));
  const [rungs, setRungs] = useState<Rung[]>(DEFAULT_RUNGS);
  const [challengeId, setChallengeId] = useState<string>("");
  const [days, setDays] = useState("30");
  const [penalty, setPenalty] = useState("20");
  const [sinkKind, setSinkKind] = useState<SinkKind>("default");
  const [sinkChallenge, setSinkChallenge] = useState("");
  const [sinkAccount, setSinkAccount] = useState("");
  const [pool, setPool] = useState<string>(pools[0] ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    if (!pool && pools.length) setPool(pools[0]);
  }, [pools, pool]);

  const [params] = useSearchParams();
  useEffect(() => {
    const id = params.get("challenge");
    if (id) {
      setKind("collective_threshold");
      setChallengeId(id);
    }
  }, [params]);

  const active = challenges.filter((c) => c.state === "active" && c.token === token);
  const maxPenalty = config ? config.max_penalty_bps / 100 : 20;
  const maxDays = config ? Math.floor(config.max_lock_duration_sec / 86400) : 730;

  // What the amount field currently means in token units, for the ladder preview.
  const amountUnits = useMemo(() => {
    try {
      return BigInt(toUnits(amount, tm.decimals));
    } catch {
      return 0n;
    }
  }, [amount, tm.decimals]);

  const releaseTs = useMemo(() => {
    const d = parseFloat(days);
    return Number.isFinite(d) && d > 0 ? nowTs() + Math.round(d * 86400) : null;
  }, [days]);

  const msg = useMemo(() => {
    try {
      let strategy: Strategy;
      if (kind === "time") strategy = { time: { end_ts: datetimeToTs(endAt) } };
      else if (kind === "roi_ladder") {
        const problem = validateLadder(rungs);
        if (problem) throw new Error(problem);
        strategy = { roi_ladder: { tranches: toTranches(rungs) } };
      } else {
        const id = parseInt(challengeId, 10);
        if (!id) throw new Error("Pick a Challenge");
        strategy = { collective_threshold: { challenge_id: id } };
      }
      const d = parseFloat(days);
      if (!(d > 0)) throw new Error("Max duration must be positive");
      if (d > maxDays) throw new Error(`Max duration is ${maxDays} days`);
      const p = parseFloat(penalty);
      if (!(p >= 0 && p <= maxPenalty)) throw new Error(`Penalty must be 0 to ${maxPenalty}%`);
      let penalty_sink: { challenge: number } | { account: string } | null = null;
      if (sinkKind === "challenge") {
        const id = parseInt(sinkChallenge, 10);
        if (!id) throw new Error("Pick a sink Challenge");
        penalty_sink = { challenge: id };
      }
      if (sinkKind === "account") {
        if (!sinkAccount.trim()) throw new Error("Enter a sink account");
        penalty_sink = { account: sinkAccount.trim() };
      }
      const cid = kind === "collective_threshold" ? parseInt(challengeId, 10) : challengeId ? parseInt(challengeId, 10) : null;
      return {
        ok: true as const,
        value: { lock: { strategy, max_duration_sec: Math.round(d * 86400), penalty_bps: Math.round(p * 100), penalty_sink, challenge_id: cid || null, staking_pool: pool || null } },
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [kind, endAt, rungs, challengeId, days, penalty, sinkKind, sinkChallenge, sinkAccount, pool, maxPenalty, maxDays]);

  // Waits for a lock newer than `sinceCount` owned by the user. A deposit the
  // contract refunded (bad params) never produces one, so this times out.
  const awaitNewLock = async (sinceCount: number): Promise<Lock | null> => {
    if (!accountId) return null;
    for (let i = 0; i < 12; i++) {
      const locks = await view<Lock[]>(CONFIG.contracts.vault, "get_locks_by_owner", { account_id: accountId, from_index: 0, limit: 50 }).catch(() => [] as Lock[]);
      const fresh = locks.filter((l) => l.id > sinceCount).sort((a, b) => b.id - a.id)[0];
      if (fresh) return fresh;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  };

  const finish = async (sinceCount: number, hash: string | null | undefined, label: string, lockNote?: string) => {
    setStage({ kind: "confirming", hash });
    const lock = await awaitNewLock(sinceCount);
    await Promise.all([refresh(), refreshUser()]);
    if (!lock) {
      setStage({ kind: "failed", reason: "The vault did not accept this deposit, so the tokens were refunded to you. Check the strategy and the Challenge rules and try again.", hash });
      return;
    }
    // Post the pledge to the Floor before navigating; the lock exists either
    // way, so a failed post is dropped silently.
    const text = (lockNote ?? "").trim().slice(0, 240);
    if (text && accountId) {
      try {
        await createPost({ author: accountId, kind: "pledge", body: text, lock_id: lock.id, challenge_id: lock.challenge_id });
      } catch {
        /* best effort */
      }
    }
    setStage({ kind: "done", lockId: lock.id, hash });
    setAmount("");
    setNote("");
    window.setTimeout(() => navigate(`/app/locks?new=${lock.id}`), 1400);
    void label;
  };

  // Resume after a MyNearWallet redirect.
  useEffect(() => {
    let pending: { sinceCount: number; label: string; note?: string } | null = null;
    try {
      const raw = sessionStorage.getItem("ceaser:pending-lock");
      pending = raw ? JSON.parse(raw) : null;
    } catch {
      pending = null;
    }
    if (!pending || !returnedTx || !accountId) return;
    try {
      sessionStorage.removeItem("ceaser:pending-lock");
    } catch {
      /* ignore */
    }
    setStageLabel(pending.label);
    if (returnedTx.error) {
      setStage({ kind: "failed", reason: returnedTx.error, hash: null });
      return;
    }
    void finish(pending.sinceCount, returnedTx.hash, pending.label, pending.note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedTx, accountId]);

  const submit = async () => {
    if (!msg.ok) return toast(msg.error, "err");
    setBusy(true);
    let sinceCount = 0;
    const label = `${amount.trim()} ${tm.symbol}`;
    try {
      const units = toUnits(amount, tm.decimals);
      if (balance !== null && BigInt(units) > balance) throw new Error(`You hold ${fromUnits(balance, tm.decimals)} ${tm.symbol}`);
      sinceCount = await view<number>(CONFIG.contracts.vault, "get_lock_count").catch(() => 0);
      setStageLabel(label);
      setStage({ kind: "signing" });
      try {
        sessionStorage.setItem("ceaser:pending-lock", JSON.stringify({ sinceCount, label, note }));
      } catch {
        /* ignore */
      }
      const outcome = await call(token, "ft_transfer_call", { receiver_id: CONFIG.contracts.vault, amount: units, msg: JSON.stringify(msg.value) }, CONFIG.gas.ftTransferCall, CONFIG.oneYocto);
      // Browser wallets redirect away before this resolves; in-page wallets land here.
      try {
        sessionStorage.removeItem("ceaser:pending-lock");
      } catch {
        /* ignore */
      }
      const hash = (outcome as { transaction?: { hash?: string } })?.transaction?.hash ?? null;
      await finish(sinceCount, hash, label, note);
    } catch (e) {
      try {
        sessionStorage.removeItem("ceaser:pending-lock");
      } catch {
        /* ignore */
      }
      setStage(null);
      toast(errorText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const setPortion = (p: number) => {
    if (balance === null) return;
    const units = p === 100 ? balance : (balance * BigInt(p)) / 100n;
    setAmount(fromUnits(units, tm.decimals, tm.decimals).replace(/,/g, ""));
  };

  const durations: [string, string][] = [
    ["30", "30 days"],
    ["90", "90 days"],
    ["365", "1 year"],
    [String(maxDays), "Max"],
  ];

  return (
    <section id="lock" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
      <SectionHead n="01" title="Create a lock" sub="Commit tokens behind a strategy your future self can't override." />
      <div className="mt-8 grid lg:grid-cols-[1fr_380px] gap-6 items-start [&>*]:min-w-0">
        {stage ? (
          <LockProgress stage={stage} label={stageLabel} onDismiss={() => setStage(null)} />
        ) : (
          <div className="card p-6 sm:p-8">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="field sm:col-span-2">
                <span>How much of your bag do you want to protect from yourself?</span>
                <input className="input" inputMode="decimal" placeholder="100000" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PORTIONS.map((p) => (
                    <button key={p} type="button" className="pill cursor-pointer hover:border-ink hover:text-ink !normal-case !tracking-normal" disabled={balance === null} onClick={() => setPortion(p)}>
                      {p}%
                    </button>
                  ))}
                  <span className="text-[11.5px] text-ink-2 ml-1">
                    {balance === null ? "Connect a wallet to read your balance" : <>
                      you hold <span className="pixel text-[12px] text-ink">{fromUnits(balance, tm.decimals, 0)}</span> {tm.symbol}
                    </>}
                  </span>
                </div>
              </div>

              <div className="field sm:col-span-2">
                <span>Strategy</span>
                <div className="grid sm:grid-cols-3 gap-2">
                  {(
                    [
                      ["roi_ladder", "Protect a moonbag", "Release in steps as the multiple climbs"],
                      ["time", "Time", "Unlock after a date"],
                      ["collective_threshold", "Collective", "Unlock when a Challenge resolves"],
                    ] as const
                  ).map(([k, label, hint]) => (
                    <button type="button" key={k} onClick={() => setKind(k)} className={`text-left rounded-xl border px-4 py-3 transition ${kind === k ? "border-ink bg-surface" : "border-line bg-paper hover:border-line-2"}`}>
                      <div className="text-[13px] font-medium">{label}</div>
                      <div className="text-[11.5px] text-ink-2 mt-0.5">{hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {kind === "time" && (
                <label className="field sm:col-span-2">
                  <span>Unlock at</span>
                  <input type="datetime-local" className="input" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </label>
              )}

              {kind === "roi_ladder" && (
                <div className="field sm:col-span-2">
                  <span>Your ladder</span>
                  <LadderPresets rungs={rungs} onPick={setRungs} />
                  <div className="mt-1">
                    <Ladder mode="edit" rungs={rungs} total={amountUnits} decimals={tm.decimals} symbol={tm.symbol} onChange={setRungs} />
                  </div>
                  <p className="text-[11.5px] text-ink-3">
                    Each step needs the mock oracle TWAP to reach that multiple of the reading taken when the lock is created, confirmed twice with a cooldown between the reads.
                  </p>
                </div>
              )}

              {kind === "collective_threshold" ? (
                <div className="field sm:col-span-2">
                  <span>Challenge</span>
                  <Select value={challengeId} onChange={setChallengeId} placeholder="Pick an active Challenge" options={active.map((c) => ({ value: String(c.id), label: `#${c.id} · ${c.title}` }))} />
                </div>
              ) : (
                <div className="field sm:col-span-2">
                  <span>Also join a Challenge (optional)</span>
                  <Select value={challengeId} onChange={setChallengeId} options={[{ value: "", label: "None" }, ...active.map((c) => ({ value: String(c.id), label: `#${c.id} · ${c.title}` }))]} />
                </div>
              )}

              <div className="field sm:col-span-2">
                <span>Max duration (days)</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {durations.map(([v, label]) => (
                    <button key={label} type="button" className={`pill cursor-pointer !normal-case !tracking-normal ${days === v ? "border-ink text-ink" : "hover:border-ink"}`} onClick={() => setDays(v)}>
                      {label}
                    </button>
                  ))}
                </div>
                <input className="input" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} />
                <p className="text-[11.5px] text-ink-2">
                  {releaseTs
                    ? `Safety release: on ${fmtDate(releaseTs)}, everything still locked unlocks automatically, regardless of price. Your principal can never be trapped.`
                    : "Safety release: set a duration and everything still locked unlocks automatically on that date, regardless of price. Your principal can never be trapped."}
                </p>
              </div>

              <label className="field">
                <span>Early-exit penalty (%, cap {maxPenalty})</span>
                <input className="input" inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
              </label>

              <div className="field">
                <span>Penalty sink</span>
                <Select
                  value={sinkKind}
                  onChange={(v) => setSinkKind(v as SinkKind)}
                  options={[
                    { value: "default", label: "Default", hint: "Your Challenge, else treasury" },
                    { value: "challenge", label: "A Challenge pool", hint: "Penalty pays that Challenge's lockers" },
                    { value: "account", label: "An account", hint: "Penalty goes to an address you name" },
                  ]}
                />
              </div>
              {sinkKind === "challenge" && (
                <div className="field">
                  <span>Sink Challenge</span>
                  <Select value={sinkChallenge} onChange={setSinkChallenge} placeholder="Pick a Challenge" options={active.map((c) => ({ value: String(c.id), label: `#${c.id} · ${c.title}` }))} />
                </div>
              )}
              {sinkKind === "account" && (
                <label className="field">
                  <span>Sink account</span>
                  <input className="input" placeholder="someone.testnet" value={sinkAccount} onChange={(e) => setSinkAccount(e.target.value)} />
                </label>
              )}
              {sinkKind === "default" && (
                <div className="field">
                  <span>Staking pool (NEAR boost)</span>
                  <Select value={pool} onChange={setPool} options={[{ value: "", label: "None", hint: "No boost" }, ...pools.map((p) => ({ value: p, label: p, hint: "Whitelisted staking pool" }))]} />
                </div>
              )}
            </div>

            <label className="field mt-5">
              <span>Why are you locking? (optional, posts to the Floor)</span>
              <textarea className="input min-h-[60px] text-[13px]" maxLength={240} placeholder="State the thesis. Your future self will read it." value={note} onChange={(e) => setNote(e.target.value)} />
            </label>

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <button className="btn btn-accent" disabled={busy || !msg.ok} onClick={submit}>
                <Busy on={busy}>{accountId ? "Lock tokens" : "Connect to lock"}</Busy>
              </button>
              <span className="text-[12px] text-ink-2">{msg.ok ? "ft_transfer_call · 1 yocto · 150 TGas" : msg.error}</span>
            </div>
          </div>
        )}

        <aside className="flex flex-col gap-4 min-w-0">
          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-2 font-mono">Your NEAR boost</span>
              <span className="pixel text-[26px]">{mult(boostBps)}</span>
            </div>
            <p className="mt-2 text-[12.5px] text-ink-2 leading-relaxed">
              {accountId
                ? staked !== null
                  ? `${fromUnits(staked, 24, 0)} NEAR staked in ${CONFIG.contracts.staking_pool}. Applied to your share of any Challenge pool at claim time.`
                  : "Reading your staked balance…"
                : "Connect a wallet to read your staked balance in the whitelisted pool."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tiers.map(([min, b]) => (
                <span key={min} className={`pill ${(staked ?? 0n) >= BigInt(min) ? "border-ink text-ink" : ""}`}>
                  ≥ {fromUnits(min, 24, 0)} Ⓝ → {mult(b)}
                </span>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-2 font-mono">What you are locking</div>
            {kind === "roi_ladder" ? (
              <div className="mt-3">
                <Ladder mode="preview" rungs={rungs} total={amountUnits} decimals={tm.decimals} symbol={tm.symbol} />
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-ink-2 leading-relaxed">
                {kind === "time"
                  ? `The whole amount unlocks on ${(() => {
                      try {
                        return fmtDate(datetimeToTs(endAt));
                      } catch {
                        return "the date you pick";
                      }
                    })()}.`
                  : challengeId
                    ? `The whole amount unlocks once Challenge #${challengeId} is finalized.`
                    : "The whole amount unlocks once the Challenge you pick is finalized."}
              </p>
            )}
            {releaseTs && <p className="mt-3 text-[11.5px] text-ink-3">Safety release on {fmtDate(releaseTs)}, whatever the ladder has done by then.</p>}
            <button type="button" className="mt-3 text-[11.5px] text-ink-2 hover:text-ink underline-offset-4 hover:underline" onClick={() => setShowJson((v) => !v)}>
              {showJson ? "Hide the exact transaction" : "Show the exact transaction"}
            </button>
            {showJson && (
              <>
                <pre className="mt-2 max-h-[260px] overflow-auto rounded-lg bg-paper p-3 font-mono text-[11px] leading-relaxed text-ink">{msg.ok ? JSON.stringify(msg.value, null, 2) : `// ${msg.error}`}</pre>
                <p className="mt-2 text-[11.5px] text-ink-3">The exact JSON sent as the msg of ft_transfer_call.</p>
              </>
            )}
          </div>

          {config && (
            <div className="card p-5">
              <Row k="Vault" v={CONFIG.contracts.vault} mono />
              <Row k="TWAP window" v={`${config.twap_window_sec}s`} />
              <Row k="Cooldown" v={`${config.cooldown_sec}s`} />
              <Row k="Max penalty" v={pct(config.max_penalty_bps)} />
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
