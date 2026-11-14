import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { attachChallenge, loadCommunity, type Community } from "../lib/community";
import { CONFIG } from "../config";
import { countdown, datetimeToTs, decodeResult, fmtDate, fmtDur, fromUnits, localDatetimeValue, nowTs, pct, toUnits, view } from "../lib/near";
import { useProtocol } from "../lib/protocol";
import { errorText, useWallet } from "../lib/wallet";
import type { Challenge } from "../lib/types";
import { Busy, SectionHead } from "./SectionHead";
import { RewardEstimate } from "./RewardEstimate";

function Progress({ value, max }: { value: bigint; max: bigint }) {
  const p = max > 0n ? Math.min(100, Number((value * 1000n) / max) / 10) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-paper-2 overflow-hidden">
      <motion.div initial={{ width: 0 }} whileInView={{ width: `${p}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: "easeOut" }} className={`h-full rounded-full ${p >= 100 ? "bg-ok" : "bg-ink"}`} />
    </div>
  );
}

function StateTag({ c }: { c: Challenge }) {
  if (c.state === "succeeded") return <span className="tag tag-ok">Succeeded</span>;
  if (c.state === "failed") return <span className="tag tag-bad">Failed</span>;
  if (c.deadline_ts <= nowTs()) return <span className="tag tag-muted">Awaiting finalize</span>;
  return <span className="tag tag-live">Active</span>;
}

function ChallengeCard({ c, onSponsor }: { c: Challenge; onSponsor: (c: Challenge) => void }) {
  const { meta, refresh, refreshUser, locks } = useProtocol();
  const { accountId, call, toast } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const navigate = useNavigate();
  const tm = meta(c.token);
  const sm = meta(c.sponsor_token);
  const pool = BigInt(c.sponsor_total) + BigInt(c.penalty_total);
  const ended = c.deadline_ts <= nowTs();
  const canFinalize = c.state === "active" && ended;
  const canJoin = c.state === "active" && !ended && c.deadline_ts - nowTs() >= c.min_lock_duration_sec && c.token === CONFIG.contracts.token;
  const myLocks = locks.filter((l) => l.challenge_id === c.id && l.status === "active").length;

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

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ duration: 0.45 }} className="card p-5 sm:p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono text-ink-3">#{c.id}</div>
          <h3 className="text-[17px] tracking-tight leading-tight">
            <Link to={`/app/challenges/${c.id}`} className="text-ink hover:underline underline-offset-4">
              {c.title}
            </Link>
          </h3>
        </div>
        <StateTag c={c} />
      </div>

      <div>
        <div className="flex items-baseline justify-between text-[12px] mb-2">
          <span className="text-ink">
            {fromUnits(c.total_locked, tm.decimals, 0)} <span className="text-ink-3">/ {fromUnits(c.threshold_amount, tm.decimals, 0)} {tm.symbol}</span>
          </span>
          <span className="font-mono text-ink-2">{c.participant_count} locker{c.participant_count === 1 ? "" : "s"}</span>
        </div>
        <Progress value={BigInt(c.total_locked)} max={BigInt(c.threshold_amount)} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Pool</div>
          <div className="text-ink">
            {fromUnits(pool, sm.decimals, 0)} {sm.symbol}
          </div>
          <div className="text-[11px] text-ink-3">
            {fromUnits(c.sponsor_total, sm.decimals, 0)} sponsors · {fromUnits(c.penalty_total, sm.decimals, 0)} penalties
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Deadline</div>
          <div className="text-ink">{countdown(c.deadline_ts)}</div>
          <div className="text-[11px] text-ink-3">{fmtDate(c.deadline_ts)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Min lock</div>
          <div className="text-ink">{fmtDur(c.min_lock_duration_sec)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Boost reserve</div>
          <div className="text-ink">{pct(c.boost_reserve_bps)}</div>
        </div>
      </div>

      <RewardEstimate c={c} />

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {canJoin && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/app/lock?challenge=${c.id}`)}>
            {myLocks ? `Lock more (${myLocks} in)` : "Join by locking"}
          </button>
        )}
        {c.state === "active" && !ended && (
          <button className="btn btn-outline btn-sm" onClick={() => onSponsor(c)}>
            Sponsor
          </button>
        )}
        {canFinalize && (
          <button
            className="btn btn-accent btn-sm"
            disabled={busy !== null}
            onClick={() =>
              run("finalize", async () => {
                const out = await call(CONFIG.contracts.vault, "finalize", { challenge_id: c.id }, CONFIG.gas.createChallenge);
                const v = decodeResult<Challenge>(out);
                if (v) toast(`Challenge #${c.id} → ${v.state}`, "ok");
              })
            }
          >
            <Busy on={busy === "finalize"}>Finalize</Busy>
          </button>
        )}
        {c.state === "failed" && accountId && (
          <button
            className="btn btn-outline btn-sm"
            disabled={busy !== null}
            onClick={() =>
              run("refund", async () => {
                const out = await call(CONFIG.contracts.vault, "refund_sponsor", { challenge_id: c.id, sponsor_id: accountId }, CONFIG.gas.call);
                const v = decodeResult<string>(out);
                if (v) toast(`Refunded ${fromUnits(v, sm.decimals)} ${sm.symbol}`, "ok");
              })
            }
          >
            <Busy on={busy === "refund"}>Refund my sponsorship</Busy>
          </button>
        )}
        <Link to={`/app/challenges/${c.id}`} className="btn btn-outline btn-sm">
          Details
        </Link>
      </div>
    </motion.div>
  );
}

const PENDING_KEY = "ceaser:pending-community-challenge";

/** The newest Challenge after `sinceCount` created by `creator`, polled briefly. */
async function awaitNewChallenge(sinceCount: number, creator: string): Promise<number | null> {
  for (let i = 0; i < 12; i++) {
    const count = await view<number>(CONFIG.contracts.vault, "get_challenge_count").catch(() => sinceCount);
    for (let id = count; id > sinceCount; id--) {
      const c = await view<Challenge | null>(CONFIG.contracts.vault, "get_challenge", { challenge_id: id }).catch(() => null);
      if (c && c.creator === creator) return id;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

export function ChallengesSection() {
  const { challenges, meta, refresh, refreshUser, config } = useProtocol();
  const { accountId, call, toast, returnedTx } = useWallet();
  const token = CONFIG.contracts.token;
  const tm = meta(token);
  const [mode, setMode] = useState<"list" | "create" | "sponsor">("list");
  const navigateTo = useNavigate();

  // ?create=1&community=<id> opens the create form for that community and
  // attaches the new Challenge to it afterwards. Without the params, nothing changes.
  const [params] = useSearchParams();
  const communityId = params.get("create") === "1" ? params.get("community") : null;
  const [community, setCommunity] = useState<Community | null>(null);
  useEffect(() => {
    if (!communityId) return;
    setMode("create");
    loadCommunity(communityId)
      .then((c) => {
        setCommunity(c);
        if (c) setTitle((t) => t || `${c.name}: `);
      })
      .catch(() => setCommunity(null));
  }, [communityId]);

  // MyNearWallet redirects away before create_challenge resolves. The pending
  // community is kept in sessionStorage and attached on return using the
  // Challenge count, the same way the lock flow resumes.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !returnedTx || !accountId) return;
    let pending: { communityId: string; sinceCount: number } | null = null;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      pending = raw ? JSON.parse(raw) : null;
    } catch {
      pending = null;
    }
    resumed.current = true;
    if (!pending || returnedTx.error) return;
    const p = pending;
    void (async () => {
      const id = await awaitNewChallenge(p.sinceCount, accountId);
      if (!id) return toast("The Challenge was not created, so nothing was attached", "err");
      await finishAttach(p.communityId, id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedTx, accountId]);

  const finishAttach = async (cid: string, challengeId: number) => {
    try {
      await attachChallenge(cid, challengeId);
      toast(`Challenge #${challengeId} added to the community`, "ok");
    } catch (e) {
      toast(`Challenge #${challengeId} created, but attaching it failed: ${errorText(e)}`, "err");
    }
    await refresh();
    navigateTo(`/app/c/${cid}`);
  };
  const [sponsorTarget, setSponsorTarget] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [threshold, setThreshold] = useState("");
  const [deadline, setDeadline] = useState(() => localDatetimeValue(new Date(Date.now() + 7 * 86400e3)));
  const [minLock, setMinLock] = useState("1");
  const [reserve, setReserve] = useState("20");
  const [sponsorAmt, setSponsorAmt] = useState("");

  const create = async () => {
    setBusy(true);
    try {
      if (!title.trim()) throw new Error("Give the Challenge a title");
      const params = {
        title: title.trim(),
        token,
        threshold_amount: toUnits(threshold, tm.decimals),
        deadline_ts: datetimeToTs(deadline),
        min_lock_duration_sec: Math.round(parseFloat(minLock || "0") * 86400),
        sponsor_token: token,
        boost_reserve_bps: Math.round(parseFloat(reserve || "0") * 100),
      };
      if (params.deadline_ts <= nowTs()) throw new Error("Deadline must be in the future");
      if (params.deadline_ts - nowTs() < params.min_lock_duration_sec)
        throw new Error(`Deadline must be at least ${fmtDur(params.min_lock_duration_sec)} away, or nobody can join`);
      if (params.boost_reserve_bps > 5000) throw new Error("Boost reserve is at most 50%");
      const sinceCount = communityId ? await view<number>(CONFIG.contracts.vault, "get_challenge_count").catch(() => 0) : 0;
      if (communityId) {
        try {
          sessionStorage.setItem(PENDING_KEY, JSON.stringify({ communityId, sinceCount }));
        } catch {
          /* private mode */
        }
      }
      const out = await call(CONFIG.contracts.vault, "create_challenge", { params }, CONFIG.gas.createChallenge);
      // In-page wallets land here; browser wallets resume in the effect above.
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* ignore */
      }
      const id = decodeResult<number>(out) ?? (communityId && accountId ? await awaitNewChallenge(sinceCount, accountId) : null);
      if (id) toast(`Challenge #${id} created`, "ok");
      if (communityId && id) {
        await finishAttach(communityId, id);
        return;
      }
      setTitle("");
      setThreshold("");
      setMode("list");
      await refresh();
    } catch (e) {
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* ignore */
      }
      toast(errorText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const sponsor = async () => {
    if (!sponsorTarget) return;
    setBusy(true);
    try {
      const sm = meta(sponsorTarget.sponsor_token);
      const amount = toUnits(sponsorAmt, sm.decimals);
      await call(sponsorTarget.sponsor_token, "ft_transfer_call", { receiver_id: CONFIG.contracts.vault, amount, msg: JSON.stringify({ sponsor: { challenge_id: sponsorTarget.id } }) }, CONFIG.gas.ftTransferCall, CONFIG.oneYocto);
      setSponsorAmt("");
      setMode("list");
      await Promise.all([refresh(), refreshUser()]);
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...challenges].sort((a, b) => (a.state === "active" ? 0 : 1) - (b.state === "active" ? 0 : 1) || b.id - a.id);

  return (
    <section id="challenges" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
      <SectionHead
        n="02"
        title="Challenges"
        sub="Lock together toward a goal. Sponsors fund the pool. Dumpers feed it."
        action={
          <button className="btn btn-outline btn-sm" onClick={() => setMode(mode === "create" ? "list" : "create")}>
            {mode === "create" ? "Close" : "+ New Challenge"}
          </button>
        }
      />

      {mode === "create" && communityId && (
        <div className="mt-6 text-[13px] text-ink-2">
          New campaign for{" "}
          <Link to={`/app/c/${communityId}`} className="text-ink font-medium hover:underline underline-offset-4">
            {community?.name ?? communityId}
          </Link>
          . It is added to the community once the Challenge exists.
        </div>
      )}
      {mode === "create" && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`card ${communityId ? "mt-3" : "mt-6"} p-6 sm:p-8`}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <label className="field lg:col-span-3">
              <span>Title</span>
              <input className="input" placeholder="Hold the line" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              <span>Threshold ({tm.symbol})</span>
              <input className="input" inputMode="decimal" placeholder="100000" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </label>
            <label className="field">
              <span>Deadline</span>
              <input type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <label className="field">
              <span>Min lock duration (days)</span>
              <input className="input" inputMode="decimal" value={minLock} onChange={(e) => setMinLock(e.target.value)} />
            </label>
            <label className="field">
              <span>Boost reserve (%, max 50)</span>
              <input className="input" inputMode="decimal" value={reserve} onChange={(e) => setReserve(e.target.value)} />
            </label>
            <div className="field lg:col-span-2">
              <span>Tokens</span>
              <div className="input text-ink-2 text-[12.5px]">
                Locked and sponsored in {tm.symbol} · {token}
              </div>
            </div>
          </div>
          <CreatePreview title={title} threshold={threshold} deadline={deadline} minLock={minLock} reserve={reserve} symbol={tm.symbol} creator={accountId} />
          <div className="mt-6 flex items-center gap-4">
            <button className="btn btn-accent" disabled={busy} onClick={create}>
              <Busy on={busy}>{accountId ? "Create Challenge" : "Connect to create"}</Busy>
            </button>
            <span className="text-[12px] text-ink-2">create_challenge on the vault · anyone can create</span>
          </div>
        </motion.div>
      )}

      {mode === "sponsor" && sponsorTarget && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card mt-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-2 font-mono">Sponsor</div>
              <div className="text-[17px] tracking-tight mt-1">
                #{sponsorTarget.id} · {sponsorTarget.title}
              </div>
            </div>
            <label className="field min-w-[220px]">
              <span>Amount ({meta(sponsorTarget.sponsor_token).symbol})</span>
              <input className="input" inputMode="decimal" placeholder="10000" value={sponsorAmt} onChange={(e) => setSponsorAmt(e.target.value)} />
            </label>
            <button className="btn btn-accent" disabled={busy} onClick={sponsor}>
              <Busy on={busy}>Fund the pool</Busy>
            </button>
            <button className="btn btn-ghost" onClick={() => setMode("list")}>
              Cancel
            </button>
          </div>
          <p className="mt-4 text-[12px] text-ink-2">Refundable if the Challenge fails. Paid to lockers by conviction weight if it succeeds.</p>
        </motion.div>
      )}

      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((c) => (
          <ChallengeCard
            key={c.id}
            c={c}
            onSponsor={(ch) => {
              setSponsorTarget(ch);
              setMode("sponsor");
            }}
          />
        ))}
        {!sorted.length && <div className="card p-8 text-[13px] text-ink-2 sm:col-span-2 lg:col-span-3">{config ? "No Challenges yet. Create the first one." : "Loading Challenges…"}</div>}
      </div>
    </section>
  );
}

/** Live preview of the Challenge card as it will appear once created. */
function CreatePreview({ title, threshold, deadline, minLock, reserve, symbol, creator }: { title: string; threshold: string; deadline: string; minLock: string; reserve: string; symbol: string; creator: string | null }) {
  let deadlineTs = 0;
  try {
    deadlineTs = datetimeToTs(deadline);
  } catch {
    /* unset */
  }
  const minLockSec = Math.round(parseFloat(minLock || "0") * 86400);
  const tooSoon = deadlineTs > 0 && deadlineTs - nowTs() < minLockSec;
  const thr = parseFloat(threshold || "0") || 0;
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-2 font-mono">Preview</div>
      <div className="mt-3 max-w-[360px] card p-5 flex flex-col gap-4 bg-paper">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-mono text-ink-3">#next</div>
            <h3 className="text-[17px] tracking-tight text-ink leading-tight">{title.trim() || "Untitled Challenge"}</h3>
          </div>
          <span className="tag tag-live">Active</span>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-[12px] mb-2">
            <span className="text-ink">
              0 <span className="text-ink-3">/ {thr.toLocaleString("en-US")} {symbol}</span>
            </span>
            <span className="font-mono text-ink-2">0 lockers</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-paper-2" />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Deadline</div>
            <div className={tooSoon ? "text-bad" : "text-ink"}>{deadlineTs ? countdown(deadlineTs) : "—"}</div>
            <div className="text-[11px] text-ink-3">{deadlineTs ? fmtDate(deadlineTs) : "pick a date"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Min lock</div>
            <div className="text-ink">{fmtDur(minLockSec)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Boost reserve</div>
            <div className="text-ink">{pct(Math.round(parseFloat(reserve || "0") * 100))}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Creator</div>
            <div className="text-ink font-mono text-[11px] truncate">{creator ?? "you"}</div>
          </div>
        </div>
      </div>
      {tooSoon && <p className="mt-2 text-[12px] text-bad">The deadline is closer than the minimum lock duration, so nobody could join. Push it out past {fmtDur(minLockSec)}.</p>}
    </div>
  );
}
