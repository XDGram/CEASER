import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CONFIG } from "../../config";
import { fetchAllLocks, fmtDate, fmtDur, fromUnits, mult, nowTs, sharePct, short, stakedBalance, timeAgo, view } from "../../lib/near";
import { boostFor, estimateReward, useProtocol } from "../../lib/protocol";
import { errorText, useWallet } from "../../lib/wallet";
import { firstPostAt, loadAuthorPosts, loadNames, setDisplayName, type FloorPost } from "../../lib/floor";
import { computeBadges, computeStats, convictionRank, joinedChallengeId, lockActivity, penaltyPaid, postActivity, profilePath, strategyLabel, type ActivityItem } from "../../lib/profile";
import type { Challenge, Lock } from "../../lib/types";
import { Pfp } from "../../components/Pfp";
import { PostCard } from "../../components/FloorFeed";
import { Busy } from "../../components/SectionHead";

const TABS = ["Locks", "Activity", "Posts", "Challenges"] as const;
type Tab = (typeof TABS)[number];

interface Loaded {
  all: Lock[];
  staked: bigint;
  names: Record<string, string>;
  posts: FloorPost[];
  firstPost: string | null;
  sponsored: Map<number, bigint>;
}

export function Profile() {
  const { account = "" } = useParams();
  const { accountId, toast } = useWallet();
  const { challenges, lockCount, meta, tiers, pools, reachable } = useProtocol();
  const isOwn = !!accountId && accountId === account;
  const tm = meta(CONFIG.contracts.token);
  const fmt = useCallback((units: bigint | string) => `${fromUnits(units, tm.decimals, 0)} ${tm.symbol}`, [tm]);

  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("Locks");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!lockCount || !account) return;
    try {
      const poolIds = pools.length ? pools : [CONFIG.contracts.staking_pool];
      const [all, stakes, names, posts, firstPost, contributions] = await Promise.all([
        fetchAllLocks(lockCount),
        Promise.all(poolIds.map((p) => stakedBalance(p, account))),
        loadNames().catch(() => ({}) as Record<string, string>),
        loadAuthorPosts(account, accountId).catch(() => [] as FloorPost[]),
        firstPostAt(account).catch(() => null),
        // A Challenge with no refundable sponsor deposits has no contributor, so only the funded ones are asked.
        Promise.all(
          challenges
            .filter((c) => BigInt(c.sponsor_total) > 0n)
            .map(async (c) => [c.id, BigInt(await view<string>(CONFIG.contracts.vault, "get_sponsor_contribution", { challenge_id: c.id, account_id: account }).catch(() => "0"))] as const),
        ),
      ]);
      setData({
        all,
        staked: stakes.reduce((a, b) => (b > a ? b : a), 0n),
        names,
        posts,
        firstPost,
        sponsored: new Map(contributions.filter(([, v]) => v > 0n)),
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [account, accountId, lockCount, pools, challenges]);

  useEffect(() => {
    setData(null);
    setTab("Locks");
  }, [account]);
  useEffect(() => {
    load();
  }, [load]);

  const locks = useMemo(() => (data?.all ?? []).filter((l) => l.owner === account).sort((a, b) => (a.status === b.status ? b.start_ts - a.start_ts : a.status === "active" ? -1 : b.status === "active" ? 1 : 0)), [data, account]);
  const stats = useMemo(() => computeStats(locks, challenges), [locks, challenges]);
  const rank = useMemo(() => (data ? convictionRank(data.all, account) : null), [data, account]);
  const boostBps = boostFor(data?.staked ?? 0n, tiers);
  const badges = useMemo(() => (data ? computeBadges({ account, locks, challenges, decimals: tm.decimals, sponsored: data.sponsored.size > 0, boostBps }) : []), [data, account, locks, challenges, tm.decimals, boostBps]);
  const name = data?.names[account];
  const joinedTs = useMemo(() => {
    const first = locks.reduce((a, l) => (a === 0 || l.start_ts < a ? l.start_ts : a), 0);
    const post = data?.firstPost ? Math.floor(new Date(data.firstPost).getTime() / 1000) : 0;
    return [first, post].filter((x) => x > 0).sort((a, b) => a - b)[0] ?? null;
  }, [locks, data]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast(account, "info");
    }
  };

  const loading = data === null && !failed;

  return (
    <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
      <div className="card p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-5 sm:gap-7">
          <Pfp id={account} size={88} className="rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-2">{isOwn ? "Your profile" : "Profile"}</div>
            <NameLine account={account} name={name} isOwn={isOwn} onSaved={(n) => setData((d) => (d ? { ...d, names: { ...d.names, [account]: n } } : d))} />
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] sm:text-[12px] text-ink-2 break-all">{account}</span>
              <button className="pill cursor-pointer hover:border-ink hover:text-ink !normal-case !tracking-normal" onClick={copy} title="Copy account id">
                {copied ? "copied" : "copy"}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap text-[12px] text-ink-2">
              <span className="pill">joined {joinedTs ? fmtDate(joinedTs).split(",")[0] : loading ? "…" : "not yet"}</span>
              <span className={`pill ${boostBps > 10000 ? "border-accent/50 text-accent-2" : ""}`} title={data ? `${fromUnits(data.staked, 24, 0)} NEAR staked in the whitelisted pool` : undefined}>
                boost {mult(boostBps)}
              </span>
              {rank && (
                <span className="text-ink">
                  Top {rank.topPct}% of lockers by conviction <span className="text-ink-3">· #{rank.rank} of {rank.of}</span>
                </span>
              )}
              {!rank && data && <span className="text-ink-3">Unranked · no active lock</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {isOwn && (
              <Link to="/app/lock" className="btn btn-accent btn-sm">
                Create a lock
              </Link>
            )}
            {isOwn && (
              <Link to="/app/locks" className="btn btn-outline btn-sm">
                My locks
              </Link>
            )}
          </div>
        </div>

        {badges.length > 0 && (
          <div className="mt-5 flex items-center gap-1.5 flex-wrap">
            {badges.map((b) => (
              <span key={b.key} className={`pill !normal-case !tracking-normal cursor-default ${b.key === "paper" ? "border-bad/40 text-bad" : b.key === "diamond" ? "border-ok/50 text-ok" : ""}`} title={b.tip}>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {failed && <div className="mt-5 card p-6 text-[13px] text-bad">Could not read this profile right now. It retries when the vault {reachable === false ? "comes back" : "answers"}.</div>}

      <StatsBand stats={stats} loading={loading} decimals={tm.decimals} symbol={tm.symbol} activeCount={locks.filter((l) => l.status === "active").length} exitedCount={locks.filter((l) => l.status === "exited").length} />

      <div className="mt-8 flex items-center gap-1.5 flex-wrap border-b border-line pb-3">
        {TABS.map((t) => (
          <button key={t} className={`px-3 py-1.5 rounded-full text-[12px] transition ${t === tab ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`} onClick={() => setTab(t)}>
            {t}
            {t === "Locks" && locks.length > 0 && <span className="pixel ml-1.5 text-[10px] opacity-70">{locks.length}</span>}
            {t === "Posts" && data && data.posts.length > 0 && <span className="pixel ml-1.5 text-[10px] opacity-70">{data.posts.length}</span>}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "Locks" && <LocksTab locks={locks} challenges={challenges} isOwn={isOwn} loading={loading} fmt={fmt} />}
        {tab === "Activity" && <ActivityTab locks={locks} challenges={challenges} posts={data?.posts ?? []} loading={loading} fmt={fmt} />}
        {tab === "Posts" && <PostsTab posts={data?.posts ?? null} names={data?.names ?? {}} isOwn={isOwn} loading={loading} onChanged={load} />}
        {tab === "Challenges" && <ChallengesTab account={account} locks={locks} challenges={challenges} sponsored={data?.sponsored ?? new Map()} boostBps={boostBps} isOwn={isOwn} loading={loading} />}
      </div>
    </section>
  );
}

function NameLine({ account, name, isOwn, onSaved }: { account: string; name: string | undefined; isOwn: boolean; onSaved: (n: string) => void }) {
  const { toast } = useWallet();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = draft.trim();
    if (!n) return toast("Enter a name", "err");
    setBusy(true);
    try {
      await setDisplayName(account, n);
      onSaved(n.slice(0, 32));
      setEditing(false);
      toast("Display name saved", "ok");
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setBusy(false);
    }
  };
  if (editing)
    return (
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        <input className="input !w-[240px] !py-1.5" maxLength={32} autoFocus value={draft} placeholder="Display name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <span className="font-mono text-[10.5px] text-ink-3">{draft.length}/32</span>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
          <Busy on={busy}>Save</Busy>
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    );
  return (
    <div className="mt-1 flex items-baseline gap-3 flex-wrap">
      <h1 className="text-[26px] sm:text-[32px] tracking-tight leading-tight break-all">{name ?? short(account, 28)}</h1>
      {isOwn && (
        <button
          className="text-[12px] text-ink-2 hover:text-ink underline-offset-4 hover:underline"
          onClick={() => {
            setDraft(name ?? "");
            setEditing(true);
          }}
        >
          {name ? "edit display name" : "set a display name"}
        </button>
      )}
    </div>
  );
}

function StatsBand({ stats, loading, decimals, symbol, activeCount, exitedCount }: { stats: ReturnType<typeof computeStats>; loading: boolean; decimals: number; symbol: string; activeCount: number; exitedCount: number }) {
  const tokenDays = Number(stats.conviction / 10n ** BigInt(decimals)) / 86400;
  const tiles: { k: string; v: string; s: string }[] = [
    { k: "Locked now", v: fromUnits(stats.lockedNow, decimals, 0), s: `${symbol} in ${activeCount} active lock${activeCount === 1 ? "" : "s"}` },
    { k: "Ever locked", v: fromUnits(stats.everLocked, decimals, 0), s: `${symbol} across every lock` },
    { k: "Longest hold", v: stats.longestHoldSec ? fmtDur(stats.longestHoldSec) : "0", s: "so far, without exiting" },
    { k: "Challenges", v: String(stats.challengesJoined), s: "joined by locking" },
    { k: "Penalties paid", v: fromUnits(stats.penaltiesPaid, decimals, 0), s: `${symbol} to the stayers · ${exitedCount} exit${exitedCount === 1 ? "" : "s"}` },
    { k: "Conviction", v: tokenDays >= 1000 ? `${(tokenDays / 1000).toFixed(1)}K` : tokenDays.toFixed(tokenDays < 10 ? 1 : 0), s: `${symbol}·days, amount × time held, active locks` },
  ];
  if (stats.rewardsClaimed !== null) tiles.splice(5, 0, { k: "Rewards claimed", v: fromUnits(stats.rewardsClaimed, decimals, 0), s: `${symbol} base share of finalized pools` });
  return (
    <div className="mt-5 card overflow-hidden">
      {/* Hairlines per tile, so a row that is not full stays white. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 -mb-px">
        {tiles.map((t, i) => (
          <motion.div key={t.k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-surface p-5 sm:p-6 border-b border-line max-lg:[&:nth-child(odd)]:border-r lg:[&:not(:nth-child(4n))]:border-r">
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-ink-2">{t.k}</div>
            <div className="pixel text-[26px] sm:text-[32px] mt-2 break-all">{loading ? "…" : t.v}</div>
            <div className="mt-1 text-[12px] text-ink-2">{t.s}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Empty({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <div className="pixel text-[22px] text-ink-3">—</div>
      <div className="mt-2 text-[15px] text-ink">{title}</div>
      <p className="mt-1 text-[13px] text-ink-2">{sub}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

function LocksTab({ locks, challenges, isOwn, loading, fmt }: { locks: Lock[]; challenges: Challenge[]; isOwn: boolean; loading: boolean; fmt: (u: bigint | string) => string }) {
  if (loading) return <div className="card p-6 text-[13px] text-ink-2">Reading locks…</div>;
  if (!locks.length)
    return (
      <Empty
        title="No locks yet"
        sub={isOwn ? "Lock a bag behind a target you can't override. The vault keeps score from there." : "This account has not locked anything on the vault yet."}
        action={
          isOwn ? (
            <Link to="/app/lock" className="btn btn-accent btn-sm">
              Create a lock
            </Link>
          ) : undefined
        }
      />
    );
  return (
    <div className="card px-6 divide-y divide-line">
      {locks.map((l) => {
        const cid = joinedChallengeId(l);
        const c = cid !== null ? challenges.find((x) => x.id === cid) : null;
        const remaining = BigInt(l.amount) - BigInt(l.claimed_amount);
        const row = (
          <div className="py-3.5 flex items-center justify-between gap-3 text-[13px]">
            <div className="min-w-0">
              <div className="text-ink flex items-center gap-2 flex-wrap">
                <span>
                  Lock #{l.id} · {l.status === "active" ? fmt(remaining) : fmt(l.amount)}
                </span>
                {l.status === "exited" && <span className="text-bad text-[12px]">paid {fmt(penaltyPaid(l))} penalty</span>}
              </div>
              <div className="text-[11.5px] text-ink-2">
                {strategyLabel(l.strategy)} · started {fmtDate(l.start_ts)}
                {cid !== null && (
                  <>
                    {" · "}
                    <Link to={`/app/challenges/${cid}`} className="hover:text-ink underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                      Challenge #{cid}{c ? ` · ${c.title}` : ""}
                    </Link>
                  </>
                )}
              </div>
            </div>
            <span className={`tag ${l.status === "active" ? "tag-live" : l.status === "exited" ? "tag-bad" : "tag-muted"}`}>{l.status}</span>
          </div>
        );
        return isOwn ? (
          <Link key={l.id} to="/app/locks" className="block hover:bg-paper -mx-6 px-6 transition">
            {row}
          </Link>
        ) : (
          <div key={l.id}>{row}</div>
        );
      })}
    </div>
  );
}

function ActivityTab({ locks, challenges, posts, loading, fmt }: { locks: Lock[]; challenges: Challenge[]; posts: FloorPost[]; loading: boolean; fmt: (u: bigint | string) => string }) {
  const items = useMemo<ActivityItem[]>(() => [...lockActivity(locks, challenges, fmt), ...postActivity(posts)].sort((a, b) => b.ts - a.ts), [locks, challenges, posts, fmt]);
  if (loading) return <div className="card p-6 text-[13px] text-ink-2">Reading activity…</div>;
  if (!items.length) return <Empty title="Nothing yet" sub="Locks, exits, claims and Floor posts will show up here as they happen." />;
  return (
    <div className="card p-6">
      <ol className="relative border-l border-line ml-2 flex flex-col gap-5">
        {items.map((it) => {
          const dot = it.tone === "bad" ? "bg-bad" : it.tone === "ok" ? "bg-ok" : "bg-ink-3";
          const text = it.tone === "bad" ? "text-bad" : it.tone === "ok" ? "text-ok" : "text-ink";
          const body = (
            <>
              <div className={`text-[13px] leading-snug ${text}`}>{it.text}</div>
              <div className="mt-0.5 text-[10.5px] font-mono text-ink-3">
                {it.approx ? "~" : ""}
                {timeAgo(new Date(it.ts * 1000).toISOString())}
                {it.approx && <span className="ml-1.5">inferred, the chain keeps no timestamp for this</span>}
              </div>
            </>
          );
          return (
            <li key={it.id} className="pl-5 relative">
              <span className={`absolute -left-[5px] top-1.5 h-[9px] w-[9px] rounded-full ${dot}`} />
              {it.link ? (
                <Link to={it.link} className="block hover:opacity-80">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PostsTab({ posts, names, isOwn, loading, onChanged }: { posts: FloorPost[] | null; names: Record<string, string>; isOwn: boolean; loading: boolean; onChanged: () => void }) {
  if (loading || posts === null) return <div className="card p-6 text-[13px] text-ink-2">Reading the floor…</div>;
  if (!posts.length)
    return (
      <Empty
        title="No posts yet"
        sub={isOwn ? "Take the floor with a thesis or a confession." : "Quiet on the floor so far."}
        action={
          <Link to="/app/community" className={`btn btn-sm ${isOwn ? "btn-accent" : "btn-outline"}`}>
            {isOwn ? "Go to the Floor" : "The Floor"}
          </Link>
        }
      />
    );
  return (
    <div className="flex flex-col gap-4">
      {posts.map((p) => (
        <div key={p.id}>
          {p.parent_id && <div className="mb-1 text-[10.5px] font-mono text-ink-3">reply</div>}
          <PostCard post={p} names={names} onChanged={onChanged} />
        </div>
      ))}
    </div>
  );
}

function ChallengesTab({ account, locks, challenges, sponsored, boostBps, isOwn, loading }: { account: string; locks: Lock[]; challenges: Challenge[]; sponsored: Map<number, bigint>; boostBps: number; isOwn: boolean; loading: boolean }) {
  const { meta } = useProtocol();
  const rows = useMemo(() => {
    const ids = new Set<number>();
    locks.forEach((l) => {
      const cid = joinedChallengeId(l);
      if (cid !== null) ids.add(cid);
    });
    challenges.filter((c) => c.creator === account).forEach((c) => ids.add(c.id));
    sponsored.forEach((_, id) => ids.add(id));
    return challenges.filter((c) => ids.has(c.id)).sort((a, b) => b.id - a.id);
  }, [locks, challenges, account, sponsored]);
  if (loading) return <div className="card p-6 text-[13px] text-ink-2">Reading Challenges…</div>;
  if (!rows.length)
    return (
      <Empty
        title="Not in any Challenge"
        sub={isOwn ? "Join one by locking and your amount counts toward its goal." : "This account has not joined, created or sponsored a Challenge."}
        action={
          <Link to="/app/challenges" className={`btn btn-sm ${isOwn ? "btn-accent" : "btn-outline"}`}>
            Browse Challenges
          </Link>
        }
      />
    );
  return (
    <div className="card px-6 divide-y divide-line">
      {rows.map((c) => {
        const tm = meta(c.token);
        const sm = meta(c.sponsor_token);
        const active = locks.filter((l) => l.status === "active" && l.challenge_id === c.id);
        const left = locks.filter((l) => l.status === "exited" && joinedChallengeId(l) === c.id);
        const conviction = active.reduce((a, l) => a + BigInt(l.conviction), 0n);
        const est = conviction > 0n ? estimateReward(c, conviction, boostBps) : null;
        const roles = [active.length ? "locker" : null, left.length ? "exited" : null, c.creator === account ? "creator" : null, sponsored.has(c.id) ? "sponsor" : null].filter(Boolean).join(" · ");
        return (
          <div key={c.id} className="py-3.5 flex items-center justify-between gap-3 text-[13px]">
            <div className="min-w-0">
              <Link to={`/app/challenges/${c.id}`} className="text-ink hover:underline underline-offset-4">
                #{c.id} · {c.title}
              </Link>
              <div className="text-[11.5px] text-ink-2">
                {roles} · {fromUnits(c.total_locked, tm.decimals, 0)} / {fromUnits(c.threshold_amount, tm.decimals, 0)} {tm.symbol}
                {c.state === "active" ? ` · ends ${fmtDate(c.deadline_ts)}` : ""}
                {sponsored.has(c.id) ? ` · sponsored ${fromUnits(sponsored.get(c.id)!, sm.decimals, 0)} ${sm.symbol}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              {conviction > 0n ? (
                <>
                  <div className="pixel text-[16px]">{sharePct(conviction, c.total_conviction)}</div>
                  <div className="text-[10.5px] text-ink-3 font-mono">of conviction</div>
                  {est && (
                    <div className="text-[11.5px] text-ink-2 mt-0.5">
                      ~{fromUnits(est.total, sm.decimals, 0)} {sm.symbol} <span className="text-ink-3">at {mult(boostBps)}</span>
                    </div>
                  )}
                </>
              ) : (
                <span className={`tag ${c.state === "succeeded" ? "tag-ok" : c.state === "failed" ? "tag-bad" : c.deadline_ts <= nowTs() ? "tag-muted" : "tag-live"}`}>{c.state}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { profilePath };
