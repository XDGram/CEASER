import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CONFIG } from "../../config";
import { countdownParts, fetchAllLocks, fmtDate, fmtDur, fromUnits, mult, nowTs, pct, sharePct, short, stakedBalance, view } from "../../lib/near";
import { useProtocol } from "../../lib/protocol";
import { useWallet } from "../../lib/wallet";
import type { Challenge, Lock } from "../../lib/types";
import { Row } from "../../components/SectionHead";
import { Pfp } from "../../components/Pfp";
import { Composer, PostCard, useAutoRefresh } from "../../components/FloorFeed";
import { convictionByOwner, loadFeed, type FeedData } from "../../lib/floor";
import { RewardEstimate } from "../../components/RewardEstimate";
import { profilePath } from "../../lib/profile";
import { loadCommunities, type Community } from "../../lib/community";

function Progress({ value, max }: { value: bigint; max: bigint }) {
  const p = max > 0n ? Math.min(100, Number((value * 1000n) / max) / 10) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-paper-2 overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.9, ease: "easeOut" }} className={`h-full rounded-full ${p >= 100 ? "bg-ok" : "bg-ink"}`} />
    </div>
  );
}

interface Sponsor {
  account: string;
  amount: bigint;
}

export function ChallengeDetail() {
  const { id } = useParams();
  const cid = Number(id);
  const navigate = useNavigate();
  const { challenges, lockCount, meta, tiers } = useProtocol();
  const { toast } = useWallet();
  const c: Challenge | undefined = challenges.find((x) => x.id === cid);

  const [lockers, setLockers] = useState<Lock[] | null>(null);
  // Communities that list this Challenge; a failed read just hides the line.
  const [partOf, setPartOf] = useState<Community[]>([]);
  useEffect(() => {
    loadCommunities()
      .then((cs) => setPartOf(cs.filter((m) => m.challenge_ids.includes(cid))))
      .catch(() => setPartOf([]));
  }, [cid]);
  const [exited, setExited] = useState<Lock[]>([]);
  const [stakes, setStakes] = useState<Record<number, bigint>>({});
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null);

  const load = useCallback(async () => {
    if (!c || !lockCount) return;
    const all = await fetchAllLocks(lockCount);
    const active = all.filter((l) => l.challenge_id === c.id && l.status === "active").sort((a, b) => (BigInt(b.conviction) > BigInt(a.conviction) ? 1 : -1));
    // early_exit clears challenge_id when it removes a lock from an active
    // Challenge, so exits are recognised by the traces it leaves behind: a
    // penalty sink still pointing here, or a strategy that referenced this id.
    const left = all.filter(
      (l) =>
        l.status === "exited" &&
        (("challenge" in l.penalty_sink && l.penalty_sink.challenge === c.id) ||
          l.challenge_id === c.id ||
          JSON.stringify(l.strategy).includes(`"challenge_id":${c.id}`)),
    );
    setLockers(active);
    setExited(left);

    // NEAR boost tier per locker, read from each lock's own staking pool.
    const entries = await Promise.all(
      active.filter((l) => l.staking_pool).map(async (l) => [l.id, await stakedBalance(l.staking_pool as string, l.owner)] as const),
    );
    setStakes(Object.fromEntries(entries));

    // The vault has no sponsor enumeration view, so candidates are derived
    // from every known lock owner plus the Challenge creator and checked one
    // by one with get_sponsor_contribution. Accounts that only sponsored and
    // never locked show up in the "unattributed" remainder below.
    const candidates = [...new Set([...all.map((l) => l.owner), c.creator])];
    const found = await Promise.all(
      candidates.map(async (account) => ({
        account,
        amount: BigInt(await view<string>(CONFIG.contracts.vault, "get_sponsor_contribution", { challenge_id: c.id, account_id: account }).catch(() => "0")),
      })),
    );
    setSponsors(found.filter((s) => s.amount > 0n).sort((a, b) => (b.amount > a.amount ? 1 : -1)));
  }, [c, lockCount]);

  useEffect(() => {
    load();
  }, [load]);

  const tm = meta(c?.token ?? CONFIG.contracts.token);
  const sm = meta(c?.sponsor_token ?? CONFIG.contracts.token);
  const pool = c ? BigInt(c.sponsor_total) + BigInt(c.penalty_total) : 0n;
  const attributed = useMemo(() => (sponsors ?? []).reduce((a, s) => a + s.amount, 0n), [sponsors]);
  const unattributed = c ? BigInt(c.sponsor_total) - attributed : 0n;

  if (!c)
    return (
      <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
        <div className="card p-8 text-[13px] text-ink-2">{challenges.length ? `No Challenge #${id}.` : "Loading…"}</div>
      </section>
    );

  const ended = c.deadline_ts <= nowTs();
  const stateTag =
    c.state === "succeeded" ? (
      <span className="tag tag-ok">Succeeded</span>
    ) : c.state === "failed" ? (
      <span className="tag tag-bad">Failed</span>
    ) : ended ? (
      <span className="tag tag-muted">Awaiting finalize</span>
    ) : (
      <span className="tag tag-live">Active</span>
    );
  const canJoin = c.state === "active" && !ended && c.deadline_ts - nowTs() >= c.min_lock_duration_sec && c.token === CONFIG.contracts.token;

  const copyLink = async () => {
    const url = `${window.location.origin}/app/challenges/${c.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", "ok");
    } catch {
      toast(url, "info");
    }
  };

  return (
    <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
      <Link to="/app/challenges" className="text-[12px] text-ink-2 hover:text-ink">
        ← All Challenges
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="pixel text-[13px] text-accent">#{c.id}</span>
            {stateTag}
          </div>
          <h1 className="mt-1 text-[26px] sm:text-[32px] tracking-tight leading-tight">{c.title}</h1>
          {partOf.map((m) => (
            <div key={m.id} className="mt-1 text-[12.5px] text-ink-2">
              Part of{" "}
              <Link to={`/app/c/${m.id}`} className="text-ink font-medium hover:underline underline-offset-4">
                {m.name}
              </Link>
            </div>
          ))}
          <div className="mt-1 text-[12.5px] text-ink-2">
            created by{" "}
            <Link to={profilePath(c.creator)} className="font-mono text-[11.5px] hover:text-ink underline-offset-4 hover:underline">
              {short(c.creator, 34)}
            </Link>
          </div>
        </div>
        <div className="flex gap-2">
          {canJoin && (
            <button className="btn btn-accent btn-sm" onClick={() => navigate(`/app/lock?challenge=${c.id}`)}>
              Join by locking
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={copyLink}>
            Copy link
          </button>
        </div>
      </div>

      <div className="mt-6 card grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        {[
          { k: "Locked", v: fromUnits(c.total_locked, tm.decimals, 0), s: `of ${fromUnits(c.threshold_amount, tm.decimals, 0)} ${tm.symbol} threshold` },
          { k: "Pool", v: fromUnits(pool, sm.decimals, 0), s: `${fromUnits(c.sponsor_total, sm.decimals, 0)} sponsors + ${fromUnits(c.penalty_total, sm.decimals, 0)} penalties` },
          { k: ended ? "Deadline" : "Time left", v: ended ? "ended" : countdownParts(c.deadline_ts), s: fmtDate(c.deadline_ts) },
          { k: "Lockers", v: String(c.participant_count), s: `min lock ${fmtDur(c.min_lock_duration_sec)} · reserve ${pct(c.boost_reserve_bps)}` },
        ].map((t) => (
          <div key={t.k} className="p-6 border-b lg:border-b-0 border-line [&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r">
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-ink-2">{t.k}</div>
            <div className="pixel text-[22px] sm:text-[32px] mt-2 break-all">{t.v}</div>
            <div className="mt-1 text-[12px] text-ink-2">{t.s}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Progress value={BigInt(c.total_locked)} max={BigInt(c.threshold_amount)} />
        <div className="mt-1.5 text-[11.5px] text-ink-2 font-mono">{sharePct(c.total_locked, c.threshold_amount)} of threshold</div>
      </div>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
        <div className="card p-6">
          <h2 className="text-[17px] tracking-tight">Lockers</h2>
          <p className="mt-0.5 text-[12px] text-ink-2">Every active lock in this Challenge, by conviction (amount × time to deadline).</p>
          <div className="mt-4">
            {lockers === null ? (
              <p className="py-3 text-[13px] text-ink-2">Reading locks…</p>
            ) : lockers.length === 0 ? (
              <p className="py-3 text-[13px] text-ink-2">Nobody has locked yet.</p>
            ) : (
              <div className="divide-y divide-line">
                {lockers.map((l, i) => {
                  const tier = stakes[l.id] !== undefined ? boostLabel(stakes[l.id], tiers) : null;
                  return (
                    <div key={l.id} className="py-3 grid grid-cols-[18px_30px_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
                      <span className="pixel text-[12px] text-ink-3">{i + 1}</span>
                      <Link to={profilePath(l.owner)} title={l.owner}>
                        <Pfp id={l.owner} size={30} />
                      </Link>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link to={profilePath(l.owner)} className="font-mono text-[12px] text-ink truncate max-w-full hover:underline underline-offset-4">
                            {short(l.owner, 30)}
                          </Link>
                          {tier && <span className="pill border-accent/50 text-accent-2">boost {tier}</span>}
                        </div>
                        <div className="text-[11.5px] text-ink-2">
                          {fromUnits(l.amount, tm.decimals, 0)} {tm.symbol} · locked {fmtDur(Math.max(0, nowTs() - l.start_ts))} so far
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="pixel text-[16px]">{sharePct(l.conviction, c.total_conviction)}</div>
                        <div className="text-[10.5px] text-ink-3 font-mono">conviction</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {exited.length > 0 && (
            <div className="mt-5 rounded-lg bg-paper px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-ink-3 font-mono">Paper hands</div>
              <div className="mt-2 divide-y divide-line">
                {exited.map((l) => (
                  <div key={l.id} className="py-2 flex items-center justify-between gap-3 text-[12.5px]">
                    <Link to={profilePath(l.owner)} className="flex items-center gap-2 min-w-0 hover:text-ink" title={l.owner}><Pfp id={l.owner} size={20} /><span className="font-mono text-[11.5px] text-ink-2 truncate min-w-0 max-w-full">{short(l.owner, 30)}</span></Link>
                    <span className="text-bad whitespace-nowrap">
                      paid {fromUnits(BigInt(l.amount) - BigInt(l.claimed_amount), tm.decimals, 0)} {tm.symbol}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <ChallengeFloor cid={c.id} />
        </div>

        <div className="flex flex-col gap-5">
          <RewardEstimate c={c} detailed />

          <div className="card p-6">
            <h2 className="text-[17px] tracking-tight">Sponsors</h2>
            <div className="mt-3">
              {sponsors === null ? (
                <p className="text-[13px] text-ink-2">Reading sponsors…</p>
              ) : sponsors.length === 0 && unattributed <= 0n ? (
                <p className="text-[13px] text-ink-2">No sponsors yet. The pool grows from early-exit penalties either way.</p>
              ) : (
                <div className="divide-y divide-line">
                  {sponsors.map((s) => (
                    <div key={s.account} className="py-2 flex items-center justify-between gap-3 text-[12.5px]">
                      <Link to={profilePath(s.account)} className="flex items-center gap-2 min-w-0" title={s.account}><Pfp id={s.account} size={20} /><span className="font-mono text-[11.5px] text-ink-2 truncate min-w-0 hover:text-ink">{short(s.account, 28)}</span></Link>
                      <span className="text-ink whitespace-nowrap">
                        {fromUnits(s.amount, sm.decimals, 0)} {sm.symbol}
                      </span>
                    </div>
                  ))}
                  {unattributed > 0n && (
                    <div className="py-2 flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className="text-ink-3">other sponsors</span>
                      <span className="text-ink-2 whitespace-nowrap">
                        {fromUnits(unattributed, sm.decimals, 0)} {sm.symbol}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-[17px] tracking-tight">Terms</h2>
            <div className="mt-2">
              <Row k="Token" v={<span className="font-mono text-[11.5px]">{short(c.token, 30)}</span>} />
              <Row k="Sponsor token" v={<span className="font-mono text-[11.5px]">{short(c.sponsor_token, 30)}</span>} />
              <Row k="Min lock" v={fmtDur(c.min_lock_duration_sec)} />
              <Row k="Boost reserve" v={pct(c.boost_reserve_bps)} />
              <Row k="Deadline" v={fmtDate(c.deadline_ts)} />
              {c.state !== "active" && <Row k="Base pool" v={`${fromUnits(c.base_pool, sm.decimals, 0)} ${sm.symbol}`} />}
              {c.state !== "active" && <Row k="Reserve left" v={`${fromUnits(c.reserve_remaining, sm.decimals, 0)} ${sm.symbol}`} />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The Floor, filtered to one Challenge: composer plus feed. */
function ChallengeFloor({ cid }: { cid: number }) {
  const { challenges } = useProtocol();
  const { accountId } = useWallet();
  const [data, setData] = useState<FeedData | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await loadFeed({ challengeId: cid }, accountId, challenges, 30));
    } catch {
      /* keep the last good feed; the next tick retries */
    }
  }, [cid, accountId, challenges]);
  useEffect(() => {
    reload();
  }, [reload]);
  useAutoRefresh(reload);
  const conviction = useMemo(() => convictionByOwner(data?.locks ?? []), [data]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-[17px] tracking-tight">Floor talk</h2>
        <span className="text-[11.5px] text-ink-2">what the lockers are saying</span>
      </div>
      <Composer challengeId={cid} onPosted={reload} compact />
      {data === null && <div className="card p-5 text-[13px] text-ink-2">Reading the floor…</div>}
      {data && data.posts.length === 0 && <div className="card p-5 text-[13px] text-ink-2">Quiet so far. First thesis takes the floor.</div>}
      {data && data.posts.map((p) => <PostCard key={p.id} post={p} names={data.names} conviction={conviction.get(p.author)} onChanged={reload} showChallengeLink={false} />)}
    </div>
  );
}

function boostLabel(staked: bigint, tiers: [string, number][]): string | null {
  let bps = 10000;
  for (const [min, b] of tiers) if (staked >= BigInt(min)) bps = b;
  return bps > 10000 ? mult(bps) : null;
}
