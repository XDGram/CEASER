import { useEffect, useMemo, useState } from "react";
import { CONFIG } from "../config";
import { datetimeToTs, fromUnits, localDatetimeValue, mult, pct, toUnits } from "../lib/near";
import { useProtocol } from "../lib/protocol";
import { errorText, useWallet } from "../lib/wallet";
import type { Strategy } from "../lib/types";
import { Busy, Row, SectionHead } from "./SectionHead";

type Kind = "time" | "roi_ladder" | "collective_threshold";
type SinkKind = "default" | "challenge" | "account";
interface Rung {
  fraction: string;
  gain: string;
}

const DEFAULT_RUNGS: Rung[] = [
  { fraction: "50", gain: "50" },
  { fraction: "25", gain: "100" },
  { fraction: "25", gain: "200" },
];

export function LockSection() {
  const { accountId, call, toast } = useWallet();
  const { challenges, pools, config, meta, balance, refresh, refreshUser, boostBps, staked, tiers } = useProtocol();
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pool && pools.length) setPool(pools[0]);
  }, [pools, pool]);

  useEffect(() => {
    const onJoin = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      setKind("collective_threshold");
      setChallengeId(String(id));
      document.getElementById("lock")?.scrollIntoView({ behavior: "smooth" });
    };
    window.addEventListener("ceaser:join", onJoin);
    return () => window.removeEventListener("ceaser:join", onJoin);
  }, []);

  const active = challenges.filter((c) => c.state === "active" && c.token === token);
  const maxPenalty = config ? config.max_penalty_bps / 100 : 20;

  const msg = useMemo(() => {
    try {
      let strategy: Strategy;
      if (kind === "time") strategy = { time: { end_ts: datetimeToTs(endAt) } };
      else if (kind === "roi_ladder") {
        const tranches = rungs.map((r) => ({ fraction_bps: Math.round(parseFloat(r.fraction || "0") * 100), multiplier_bps: 10000 + Math.round(parseFloat(r.gain || "0") * 100) }));
        const sum = tranches.reduce((a, t) => a + t.fraction_bps, 0);
        if (sum !== 10000) throw new Error(`Rung fractions sum to ${sum / 100}%, need 100%`);
        if (tranches.some((t) => t.multiplier_bps <= 10000)) throw new Error("Each rung needs a positive gain");
        strategy = { roi_ladder: { tranches } };
      } else {
        const id = parseInt(challengeId, 10);
        if (!id) throw new Error("Pick a Challenge");
        strategy = { collective_threshold: { challenge_id: id } };
      }
      const d = parseFloat(days);
      if (!(d > 0)) throw new Error("Max duration must be positive");
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
  }, [kind, endAt, rungs, challengeId, days, penalty, sinkKind, sinkChallenge, sinkAccount, pool, maxPenalty]);

  const submit = async () => {
    if (!msg.ok) return toast(msg.error, "err");
    setBusy(true);
    try {
      const units = toUnits(amount, tm.decimals);
      if (balance !== null && BigInt(units) > balance) throw new Error(`You hold ${fromUnits(balance, tm.decimals)} ${tm.symbol}`);
      await call(token, "ft_transfer_call", { receiver_id: CONFIG.contracts.vault, amount: units, msg: JSON.stringify(msg.value) }, CONFIG.gas.ftTransferCall, CONFIG.oneYocto);
      setAmount("");
      await Promise.all([refresh(), refreshUser()]);
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const setRung = (i: number, k: keyof Rung, v: string) => setRungs((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <section id="lock" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-16 scroll-mt-20">
      <SectionHead n="01" title="Create a lock" sub="Commit tokens behind a strategy your future self can't override." />
      <div className="mt-8 grid lg:grid-cols-[1fr_380px] gap-6 items-start [&>*]:min-w-0">
        <div className="card p-6 sm:p-8">
          <div className="grid sm:grid-cols-2 gap-5">
            <label className="field sm:col-span-2">
              <span>Amount ({tm.symbol})</span>
              <div className="relative">
                <input className="input pr-24" inputMode="decimal" placeholder="100000" value={amount} onChange={(e) => setAmount(e.target.value)} />
                {balance !== null && (
                  <button type="button" onClick={() => setAmount(fromUnits(balance, tm.decimals, tm.decimals).replace(/,/g, ""))} className="absolute right-2 top-1/2 -translate-y-1/2 pill hover:border-ink">
                    max {fromUnits(balance, tm.decimals, 0)}
                  </button>
                )}
              </div>
            </label>

            <div className="field sm:col-span-2">
              <span>Strategy</span>
              <div className="grid sm:grid-cols-3 gap-2">
                {(
                  [
                    ["time", "Time", "Unlock after a date"],
                    ["roi_ladder", "ROI ladder", "Unlock in rungs as price rises"],
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
                <span>Rungs · fraction of the bag unlocks when price is up by</span>
                <div className="flex flex-col gap-2">
                  {rungs.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                      <div className="relative">
                        <input className="input pr-8" inputMode="decimal" value={r.fraction} onChange={(e) => setRung(i, "fraction", e.target.value)} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">%</span>
                      </div>
                      <div className="relative">
                        <input className="input pl-7 pr-8" inputMode="decimal" value={r.gain} onChange={(e) => setRung(i, "gain", e.target.value)} />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">+</span>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">%</span>
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={rungs.length <= 1} onClick={() => setRungs((x) => x.filter((_, j) => j !== i))} aria-label="Remove rung">
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline btn-sm self-start" disabled={rungs.length >= 10} onClick={() => setRungs((x) => [...x, { fraction: "", gain: "" }])}>
                    + Add rung
                  </button>
                </div>
              </div>
            )}

            {kind === "collective_threshold" ? (
              <label className="field sm:col-span-2">
                <span>Challenge</span>
                <select className="input" value={challengeId} onChange={(e) => setChallengeId(e.target.value)}>
                  <option value="">Pick an active Challenge</option>
                  {active.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id} · {c.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field sm:col-span-2">
                <span>Also join a Challenge (optional)</span>
                <select className="input" value={challengeId} onChange={(e) => setChallengeId(e.target.value)}>
                  <option value="">None</option>
                  {active.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id} · {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="field">
              <span>Max duration (days)</span>
              <input className="input" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
            <label className="field">
              <span>Early-exit penalty (%, cap {maxPenalty})</span>
              <input className="input" inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
            </label>

            <label className="field">
              <span>Penalty sink</span>
              <select className="input" value={sinkKind} onChange={(e) => setSinkKind(e.target.value as SinkKind)}>
                <option value="default">Default · your Challenge, else treasury</option>
                <option value="challenge">A Challenge pool</option>
                <option value="account">An account</option>
              </select>
            </label>
            {sinkKind === "challenge" && (
              <label className="field">
                <span>Sink Challenge</span>
                <select className="input" value={sinkChallenge} onChange={(e) => setSinkChallenge(e.target.value)}>
                  <option value="">Pick</option>
                  {active.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id} · {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {sinkKind === "account" && (
              <label className="field">
                <span>Sink account</span>
                <input className="input" placeholder="someone.testnet" value={sinkAccount} onChange={(e) => setSinkAccount(e.target.value)} />
              </label>
            )}
            {sinkKind === "default" && (
              <label className="field">
                <span>Staking pool (NEAR boost)</span>
                <select className="input" value={pool} onChange={(e) => setPool(e.target.value)}>
                  <option value="">None</option>
                  {pools.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button className="btn btn-accent" disabled={busy || !msg.ok} onClick={submit}>
              <Busy on={busy}>{accountId ? "Lock tokens" : "Connect to lock"}</Busy>
            </button>
            <span className="text-[12px] text-ink-2">{msg.ok ? "ft_transfer_call · 1 yocto · 150 TGas" : msg.error}</span>
          </div>
        </div>

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
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-2 font-mono">Message preview</div>
            <pre className="mt-3 max-h-[260px] overflow-auto rounded-lg bg-paper p-3 font-mono text-[11px] leading-relaxed text-ink">{msg.ok ? JSON.stringify(msg.value, null, 2) : `// ${msg.error}`}</pre>
            <p className="mt-2 text-[11.5px] text-ink-3">The exact JSON sent as the msg of ft_transfer_call.</p>
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
