import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CONFIG } from "../../config";
import { fetchAllLocks, fmtDate, fromUnits, short, timeAgo } from "../../lib/near";
import { recentActivity, useLiveActivity, type ActivityEvent } from "../../lib/live";
import { useProtocol } from "../../lib/protocol";
import { useWallet } from "../../lib/wallet";
import { computeCommunityStats, loadCommunity, lockChallenge, type Community, type CommunityStats } from "../../lib/community";
import { convictionByOwner, feesCollected, isDemo, loadFeed, POSTED_EVENT, type FeedData, type PostKind } from "../../lib/floor";
import { profilePath } from "../../lib/profile";
import type { Challenge, Lock } from "../../lib/types";
import { Pfp } from "../../components/Pfp";
import { Composer, PostCard, useAutoRefresh } from "../../components/FloorFeed";
import { RewardEstimate } from "../../components/RewardEstimate";

/**
 * One community: its campaigns (Challenges), the treasury those campaigns hold
 * in the vault, and who is committed to them.
 *
 * Every figure is tagged with where it comes from. "On-chain" is read straight
 * from a vault view. "Derived" is computed here from vault state, usually by
 * attributing locks to campaigns, which the vault itself does not index.
 */
export function CommunityPage() {
  const { id = "" } = useParams();
  const { challenges, lockCount, meta } = useProtocol();
  const { accountId, toast } = useWallet();
  const tm = meta(CONFIG.contracts.token);

  const [community, setCommunity] = useState<Community | null | undefined>(undefined);
  const [locks, setLocks] = useState<Lock[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCommunity(undefined);
    setFailed(false);
    loadCommunity(id)
      .then(setCommunity)
      .catch(() => setFailed(true));
  }, [id]);

  useEffect(() => {
    if (!lockCount) return;
    fetchAllLocks(lockCount)
      .then(setLocks)
      .catch(() => setLocks([]));
  }, [lockCount]);

  // The conversation feed lives here so the header's weekly activity and the
  // Conversation tab read the same posts.
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [feedFailed, setFeedFailed] = useState(false);
  const loadConversation = useCallback(async () => {
    if (!community) return;
    try {
      setFeed(await loadFeed({ community: { id: community.id, challengeIds: community.challenge_ids }, derived: false }, accountId, challenges, 50));
      setFeedFailed(false);
    } catch {
      setFeedFailed(true);
    }
  }, [community, accountId, challenges]);
  useEffect(() => {
    loadConversation();
  }, [loadConversation]);
  useAutoRefresh(loadConversation);

  // Posting fees: verified 0.01 NEAR transfers to the treasury attached to
  // posts in this community's scope.
  const [fees, setFees] = useState<bigint | null>(null);
  useEffect(() => {
    if (!community) return;
    const load = () => feesCollected(community.id, community.challenge_ids).then(setFees).catch(() => setFees(null));
    load();
    window.addEventListener(POSTED_EVENT, load);
    return () => window.removeEventListener(POSTED_EVENT, load);
  }, [community]);

  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "conversation") as TabKey;
  const setTab = (k: TabKey) => setParams(k === "conversation" ? {} : { tab: k }, { replace: true });

  const campaigns = useMemo(
    () => (community ? challenges.filter((c) => community.challenge_ids.includes(c.id)).sort((a, b) => b.id - a.id) : []),
    [community, challenges],
  );
  const stats = useMemo(
    () => (community && locks ? computeCommunityStats(community, challenges, locks, tm.decimals) : null),
    [community, challenges, locks, tm.decimals],
  );

  const copyLink = async () => {
    const url = `${window.location.origin}/app/c/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", "ok");
    } catch {
      toast(url, "info");
    }
  };

  // Leaders: the community creator and the creators of its campaigns.
  const isLeader = !!accountId && !!community && (accountId === community.creator || campaigns.some((c) => c.creator === accountId));

  if (community === null || failed)
    return (
      <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
        <div className="card p-8 text-center">
          <div className="pixel text-[22px] text-ink-3">—</div>
          <div className="mt-2 text-[15px] text-ink">Community not found</div>
          <p className="mt-1 text-[13px] text-ink-2">
            {failed ? "The community list is not reachable right now." : <>No community is registered under <span className="font-mono text-[12px]">{id}</span>.</>}
          </p>
          <div className="mt-4 flex justify-center">
            <Link to="/app/challenges" className="btn btn-outline btn-sm">
              Browse Challenges
            </Link>
          </div>
        </div>
      </section>
    );

  if (community === undefined)
    return (
      <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
        <div className="card p-8 text-[13px] text-ink-2">Reading the community…</div>
      </section>
    );

  return (
    <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
      <div className="card p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-2">Community</div>
            <h1 className="mt-1 text-[26px] sm:text-[32px] tracking-tight leading-tight">{community.name}</h1>
            {community.tagline && <p className="mt-1 text-[14px] text-ink-2">{community.tagline}</p>}
          </div>
          <button className="btn btn-outline btn-sm" onClick={copyLink}>
            Copy link
          </button>
        </div>

        {community.description && <p className="mt-4 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-2">{community.description}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link to={profilePath(community.creator)} className="flex items-center gap-2 min-w-0" title={community.creator}>
            <Pfp id={community.creator} size={28} />
            <span className="min-w-0">
              <span className="block text-[10.5px] font-mono uppercase tracking-[0.12em] text-ink-3">Creator</span>
              <span className="block text-[12.5px] text-ink truncate hover:underline underline-offset-4">{short(community.creator, 30)}</span>
            </span>
          </Link>
          <span>
            <span className="block text-[10.5px] font-mono uppercase tracking-[0.12em] text-ink-3">Token</span>
            <span className="block font-mono text-[12px] text-ink-2 break-all">{short(community.token, 32)}</span>
          </span>
          <span>
            <span className="block text-[10.5px] font-mono uppercase tracking-[0.12em] text-ink-3">Since</span>
            <span className="block text-[12.5px] text-ink-2">{fmtDate(Math.floor(new Date(community.created_at).getTime() / 1000)).split(",")[0]}</span>
          </span>
        </div>
      </div>

      <SocialProof community={community} campaigns={campaigns} locks={locks} stats={stats} feed={feed} decimals={tm.decimals} symbol={tm.symbol} />

      <StatStrip stats={stats} symbol={tm.symbol} decimals={tm.decimals} />

      <div className="mt-8 flex items-center gap-1 overflow-x-auto border-b border-line pb-3" role="tablist" aria-label="Community sections">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`px-3.5 py-1.5 rounded-full text-[13px] whitespace-nowrap shrink-0 transition ${tab === t.key ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "conversation" && (
          <Conversation community={community} feed={feed} failed={feedFailed} reload={loadConversation} isLeader={isLeader} />
        )}
        {tab === "live" && <LiveTab communityId={community.id} />}
        {tab === "campaigns" && (
          <div className="flex flex-col gap-5">
            <Milestones stats={stats} symbol={tm.symbol} decimals={tm.decimals} />
            <Campaigns community={community} campaigns={campaigns} symbol={tm.symbol} decimals={tm.decimals} />
            <Distribution campaigns={campaigns} locks={locks} meta={meta} />
          </div>
        )}
        {tab === "treasury" && (
          <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-5 items-start">
            <Treasury stats={stats} campaigns={campaigns} symbol={tm.symbol} decimals={tm.decimals} fees={fees} />
            <Growth stats={stats} />
          </div>
        )}
      </div>
    </section>
  );
}

const TABS = [
  { key: "conversation", label: "Conversation" },
  { key: "live", label: "Live" },
  { key: "campaigns", label: "Campaigns" },
  { key: "treasury", label: "Treasury" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const WEEK = 7 * 86400;

/** Locks attributed to this community's campaigns, on-chain only. */
function communityLocks(community: Community, locks: Lock[] | null): Lock[] {
  if (!locks) return [];
  return locks.filter((l) => {
    const cid = lockChallenge(l);
    return cid !== null && community.challenge_ids.includes(cid);
  });
}

/**
 * Who is here, from real data only: on-chain locks, and Floor posts that are
 * not seeded demo content. Achievements are states, never dated, because the
 * vault does not record when a milestone was crossed or a pool paid out.
 */
function SocialProof({ community, campaigns, locks, stats, feed, decimals, symbol }: { community: Community; campaigns: Challenge[]; locks: Lock[] | null; stats: CommunityStats | null; feed: FeedData | null; decimals: number; symbol: string }) {
  const own = communityLocks(community, locks);
  const now = Math.floor(Date.now() / 1000);
  const active = own.filter((l) => l.status === "active");
  const holding = new Set(active.map((l) => l.owner)).size;
  // Latest real lockers first, one avatar per account.
  const members: string[] = [];
  for (const l of [...own].sort((a, b) => b.start_ts - a.start_ts)) if (!members.includes(l.owner)) members.push(l.owner);
  const fresh = own.filter((l) => now - l.start_ts < WEEK);
  const joined = new Set(fresh.map((l) => l.owner)).size;
  const posters = (feed?.posts ?? []).flatMap((p) => [p, ...p.replies]).filter((p) => !isDemo(p) && !p.derived && now - Math.floor(new Date(p.created_at).getTime() / 1000) < WEEK);
  const activeWeek = new Set([...fresh.map((l) => l.owner), ...posters.map((p) => p.author)]).size;

  const achievements: string[] = [];
  for (const m of stats?.milestones ?? []) if (m.reached) achievements.push(`${fromUnits(m.target, decimals, 0)} ${symbol} committed`);
  for (const c of campaigns) if (c.state === "succeeded") achievements.push(`Campaign #${c.id} succeeded`);
  for (const c of campaigns) {
    if (c.state === "active") continue;
    const paid = own.some((l) => lockChallenge(l) === c.id && l.reward_claimed && BigInt(l.conviction) > 0n);
    if (paid) achievements.push(`Campaign #${c.id} pool paid out`);
  }

  const loading = locks === null;
  return (
    <div className="mt-5 card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex items-center">
          {members.slice(0, 8).map((m, i) => (
            <Link key={m} to={profilePath(m)} title={m} className={`rounded-md ring-2 ring-surface ${i ? "-ml-2" : ""}`} style={{ zIndex: 8 - i }}>
              <Pfp id={m} size={30} />
            </Link>
          ))}
          {!loading && !members.length && <span className="text-[12.5px] text-ink-2">No lockers yet</span>}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-ink-2">
          <span>
            <span className="pixel text-[16px] text-ink">{loading ? "…" : holding}</span> member{holding === 1 ? "" : "s"} holding
          </span>
          <span>
            <span className="pixel text-[16px] text-ink">{loading ? "…" : joined}</span> joined this week
          </span>
          <span title="Accounts that locked or posted in the last 7 days. Demo posts are not counted.">
            <span className="pixel text-[16px] text-ink">{loading || !feed ? "…" : activeWeek}</span> active this week
          </span>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-3 flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-ink-3 mr-1">Recent achievements</span>
        {achievements.map((a) => (
          <span key={a} className="tag tag-ok">
            {a}
          </span>
        ))}
        {stats && !achievements.length && <span className="text-[12px] text-ink-3">None yet. The first milestone is the next one.</span>}
      </div>
    </div>
  );
}

function Conversation({ community, feed, failed, reload, isLeader }: { community: Community; feed: FeedData | null; failed: boolean; reload: () => void; isLeader: boolean }) {
  const conviction = useMemo(() => convictionByOwner(feed?.locks ?? []), [feed]);
  const posts = feed?.posts ?? [];
  // Only announcements by a verified leader are pinned; anything else typed as
  // an announcement stays in the feed as an ordinary post.
  const pinned = posts.filter((p) => p.kind === "announcement" && p.leader);
  const rest = posts.filter((p) => !pinned.includes(p));
  const now = Date.now();
  const hot = posts
    .filter((p) => now - new Date(p.created_at).getTime() < WEEK * 1000)
    .map((p) => ({ p, score: p.replies.length + p.diamonds + p.copes }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const kinds: PostKind[] = isLeader ? ["thesis", "confession", "update", "announcement"] : ["thesis", "confession", "update"];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        {pinned.map((p) => (
          <PostCard key={p.id} post={p} names={feed!.names} conviction={conviction.get(p.author)} onChanged={reload} pinned />
        ))}
        <Composer communityId={community.id} kinds={kinds} onPosted={reload} note="Leader posts are checked in the app; the feed database is open on this testnet demo." />
        {failed && <div className="card p-5 text-[13px] text-bad">The conversation is not reachable right now. It retries every 30 seconds.</div>}
        {!failed && feed === null && <div className="card p-5 text-[13px] text-ink-2">Reading the conversation…</div>}
        {feed && !posts.length && <div className="card p-5 text-[13px] text-ink-2">Nobody has posted here yet. Start the conversation.</div>}
        {feed && rest.map((p) => <PostCard key={p.id} post={p} names={feed.names} conviction={conviction.get(p.author)} onChanged={reload} />)}
      </div>
      <aside className="card p-5">
        <h2 className="text-[16px] tracking-tight">Most discussed this week</h2>
        <p className="mt-0.5 text-[11.5px] text-ink-2">Replies plus reactions, last 7 days.</p>
        <ol className="mt-3 flex flex-col divide-y divide-line">
          {hot.map(({ p, score }, i) => (
            <li key={p.id} className="py-2.5 flex items-start gap-2.5">
              <span className="pixel text-[12px] text-ink-3 w-3 shrink-0">{i + 1}</span>
              <Pfp id={p.author} size={22} />
              <div className="min-w-0">
                <p className="text-[12.5px] text-ink leading-snug line-clamp-2 break-words">{p.body}</p>
                <div className="mt-0.5 text-[10.5px] text-ink-3">
                  {feed?.names[p.author] ?? short(p.author, 18)} · <span className="pixel text-[11px]">{score}</span> interactions
                </div>
              </div>
            </li>
          ))}
          {feed && !hot.length && <li className="py-2 text-[12px] text-ink-2">No threads with replies or reactions this week.</li>}
        </ol>
      </aside>
    </div>
  );
}

/** Where a figure comes from: a vault view, or computed here from vault state. */
function Src({ kind }: { kind: "chain" | "derived" }) {
  return (
    <span className={`pill !px-1.5 !py-0 !text-[9px] !tracking-[0.1em] ${kind === "chain" ? "" : "!border-line text-ink-3"}`}>{kind === "chain" ? "on-chain" : "derived"}</span>
  );
}

function StatStrip({ stats, symbol, decimals }: { stats: CommunityStats | null; symbol: string; decimals: number }) {
  const loading = stats === null;
  const convictionDays = stats ? Number(stats.conviction / 10n ** BigInt(decimals)) / 86400 : 0;
  const compactDays = (d: number) => (d >= 1e6 ? `${(d / 1e6).toFixed(1)}M` : d >= 1000 ? `${(d / 1000).toFixed(1)}K` : d.toFixed(d < 10 ? 1 : 0));
  // `num` false keeps non-numbers out of Doto.
  const tiles: { k: string; v: string; s: string; src: "chain" | "derived"; num: boolean }[] = [
    { k: "Committed", v: stats ? fromUnits(stats.committed, decimals, 0) : "…", s: `${symbol} locked across its campaigns`, src: "chain", num: true },
    { k: "Active lockers", v: stats ? String(stats.activeLockers) : "…", s: stats ? `${stats.everLockers} have ever locked` : "", src: "derived", num: true },
    { k: "Conviction", v: stats ? compactDays(convictionDays) : "…", s: `${symbol}·days, amount × time, active locks`, src: "derived", num: true },
    { k: "Retention", v: stats ? `${stats.retentionPct}%` : "…", s: "of all locks are still open", src: "derived", num: true },
    {
      k: "Campaign success",
      v: stats ? (stats.successRatePct === null ? "none yet" : `${stats.successRatePct}%`) : "…",
      s: stats && stats.successRatePct === null ? "no finalized campaigns yet" : stats ? `${stats.campaigns.succeeded} of ${stats.campaigns.succeeded + stats.campaigns.failed} finalized` : "",
      src: "derived",
      num: !!stats && stats.successRatePct !== null,
    },
  ];
  return (
    <div className="mt-5 card overflow-hidden">
      {/* Hairlines per tile so a ragged last row stays white. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 -mb-px">
        {tiles.map((t, i) => (
          <motion.div
            key={t.k}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-surface p-4 sm:p-6 border-b border-line max-lg:[&:nth-child(odd)]:border-r lg:[&:not(:nth-child(5n))]:border-r"
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10.5px] sm:text-[11px] font-mono uppercase tracking-[0.12em] text-ink-2">{t.k}</span>
              <Src kind={t.src} />
            </div>
            <div className={`mt-2 break-all ${t.num ? "pixel text-[24px] sm:text-[30px]" : "text-[19px] sm:text-[22px] text-ink-3 tracking-tight"}`}>{loading ? "…" : t.v}</div>
            <div className="mt-1 text-[11.5px] sm:text-[12px] text-ink-2">{t.s}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Milestones({ stats, symbol, decimals }: { stats: CommunityStats | null; symbol: string; decimals: number }) {
  if (!stats) return <div className="card p-6 text-[13px] text-ink-2">Reading milestones…</div>;
  const ms = stats.milestones;
  if (!ms.length)
    return (
      <div className="card p-6">
        <h2 className="text-[17px] tracking-tight">Milestones</h2>
        <p className="mt-2 text-[13px] text-ink-2">This community has not set any targets.</p>
      </div>
    );

  const nextIdx = ms.findIndex((m) => !m.reached);
  const next = nextIdx >= 0 ? ms[nextIdx] : null;
  const toGo = next ? next.target - stats.committed : 0n;
  // Anchors: 0 at the left edge, milestone i at (i+1)/n. The marker is
  // interpolated between the two anchors the committed total sits between.
  const n = ms.length;
  const pos = (() => {
    const c = stats.committed;
    if (c <= 0n) return 0;
    const bounds = [0n, ...ms.map((m) => m.target)];
    for (let i = 1; i < bounds.length; i++) {
      if (c < bounds[i]) {
        const span = bounds[i] - bounds[i - 1];
        const t = span > 0n ? Number(((c - bounds[i - 1]) * 1000n) / span) / 1000 : 0;
        return ((i - 1) / n + t / n) * 100;
      }
    }
    return 100;
  })();

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-[17px] tracking-tight">Milestones</h2>
        <span className="flex items-center gap-1.5">
          <span className="text-[11.5px] text-ink-2">committed</span>
          <Src kind="chain" />
        </span>
      </div>

      <div className="mt-6 relative">
        <div className="h-[2px] w-full bg-line" />
        <div className="absolute left-0 top-0 h-[2px] bg-ink" style={{ width: `${Math.min(100, pos)}%` }} />
        <div className="absolute -top-[9px]" style={{ left: `${Math.min(100, pos)}%` }}>
          <div className="-translate-x-1/2 h-5 w-[2px] bg-accent" />
        </div>
        <div className="mt-4 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {ms.map((m, i) => (
            <div key={i} className="min-w-0 pr-1.5 sm:pr-2">
              <div className="flex items-center gap-1 sm:gap-1.5">
                <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${m.reached ? "border-ok bg-ok/10" : i === nextIdx ? "border-accent" : "border-line-2"}`}>
                  {m.reached && (
                    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                      <path d="M1 4.2 L3 6.2 L7 1.8" fill="none" stroke="var(--color-ok)" strokeWidth="1.5" />
                    </svg>
                  )}
                </span>
                <span className={`pixel text-[11px] sm:text-[13px] ${m.reached ? "text-ink" : i === nextIdx ? "text-accent-2" : "text-ink-3"}`}>{fromUnits(m.target, decimals, 0)}</span>
              </div>
              <div className="mt-0.5 pl-[18px] sm:pl-5 text-[10px] sm:text-[10.5px] text-ink-3">{m.reached ? "reached" : i === nextIdx ? `${fromUnits(toGo, decimals, 0)} to go` : "ahead"}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 text-[11.5px] text-ink-3">
        The marker is the committed total, {fromUnits(stats.committed, decimals, 0)} {symbol}. Reached dates are not recorded on-chain.
      </p>
    </div>
  );
}

function Campaigns({ community, campaigns, symbol, decimals }: { community: Community; campaigns: Challenge[]; symbol: string; decimals: number }) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[17px] tracking-tight">Campaigns</h2>
          <p className="mt-0.5 text-[12px] text-ink-2">Challenges this community runs. Locking into one joins the community's goal.</p>
        </div>
        <Link to={`/app/challenges?create=1&community=${community.id}`} className="btn btn-accent btn-sm">
          Start a campaign
        </Link>
      </div>

      <div className="mt-4 divide-y divide-line">
        {campaigns.map((c) => (
          <div key={c.id} className="py-3 text-[13px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/app/challenges/${c.id}`} className="text-ink hover:underline underline-offset-4">
                  #{c.id} · {c.title}
                </Link>
                <div className="mt-0.5 text-[11.5px] text-ink-2">
                  <span className="pixel text-[12px] text-ink">{fromUnits(c.total_locked, decimals, 0)}</span> / {fromUnits(c.threshold_amount, decimals, 0)} {symbol} ·{" "}
                  <span className="pixel text-[12px]">{c.participant_count}</span> locker{c.participant_count === 1 ? "" : "s"} · ends {fmtDate(c.deadline_ts)}
                </div>
              </div>
              <span className={`tag shrink-0 ${c.state === "succeeded" ? "tag-ok" : c.state === "failed" ? "tag-bad" : "tag-live"}`}>{c.state}</span>
            </div>
            <div className="mt-2">
              <RewardEstimate c={c} />
            </div>
          </div>
        ))}
        {!campaigns.length && <p className="py-3 text-[13px] text-ink-2">No campaigns yet. Start one and its Challenge shows up here.</p>}
      </div>
    </div>
  );
}

function Distribution({ campaigns, locks, meta }: { campaigns: Challenge[]; locks: Lock[] | null; meta: (t: string) => { symbol: string; decimals: number } }) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-[17px] tracking-tight">Reward campaigns</h2>
        <span className="text-[11.5px] text-ink-3">Paid by the vault at claim, pro-rata by conviction</span>
      </div>

      <div className="mt-4 divide-y divide-line">
        {campaigns.map((c) => {
          const sm = meta(c.sponsor_token);
          const pool = BigInt(c.sponsor_total) + BigInt(c.penalty_total);
          const eligible = (locks ?? []).filter((l) => lockChallenge(l) === c.id && BigInt(l.conviction) > 0n);
          const claimed = eligible.filter((l) => l.reward_claimed).length;
          return (
            <div key={c.id} className="py-3 flex items-start justify-between gap-3 text-[13px]">
              <div className="min-w-0">
                <Link to={`/app/challenges/${c.id}`} className="text-ink hover:underline underline-offset-4">
                  #{c.id} · {c.title}
                </Link>
                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[11.5px] text-ink-2">
                  pool <span className="pixel text-[12px] text-ink">{fromUnits(pool, sm.decimals, 0)}</span> {sm.symbol}
                  <Src kind="chain" />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[12px] text-ink">
                  {c.state === "active" ? (
                    <span className="text-ink-2">not distributed yet</span>
                  ) : locks === null ? (
                    <span className="text-ink-2">…</span>
                  ) : (
                    <>
                      <span className="pixel text-[14px]">{claimed}</span>
                      <span className="text-ink-2"> of </span>
                      <span className="pixel text-[14px]">{eligible.length}</span>
                      <span className="text-ink-2"> claimed</span>
                    </>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-end gap-1.5">
                  <span className="text-[10.5px] text-ink-3">{c.state === "active" ? "campaign still running" : "participating locks"}</span>
                  <Src kind={c.state === "active" ? "chain" : "derived"} />
                </div>
              </div>
            </div>
          );
        })}
        {!campaigns.length && <p className="py-3 text-[13px] text-ink-2">Nothing to distribute yet.</p>}
      </div>
    </div>
  );
}

function Treasury({ stats, campaigns, symbol, decimals, fees }: { stats: CommunityStats | null; campaigns: Challenge[]; symbol: string; decimals: number; fees: bigint | null }) {
  const refundable = campaigns.filter((c) => c.state === "failed").reduce((a, c) => a + BigInt(c.sponsor_total), 0n);
  const rows: { k: string; v: bigint | null; src: "chain" | "derived" }[] = [
    { k: "Sponsored in", v: stats?.treasury.sponsored ?? null, src: "chain" },
    { k: "Penalties in", v: stats?.treasury.penalties ?? null, src: "chain" },
    { k: "Base pool", v: stats?.treasury.basePool ?? null, src: "chain" },
    { k: "Reserve remaining", v: stats?.treasury.reserveRemaining ?? null, src: "chain" },
    { k: "Paid out", v: stats?.treasury.paidOut ?? null, src: "derived" },
    { k: "Refundable", v: stats ? refundable : null, src: "chain" },
  ];
  return (
    <div className="card p-5">
      <h2 className="text-[17px] tracking-tight">Treasury</h2>
      <div className="mt-3">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-3 py-2 border-b border-line last:border-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink-2 font-mono">{r.k}</span>
              <Src kind={r.src} />
            </span>
            <span className="text-[13px] text-ink text-right whitespace-nowrap">
              <span className="pixel text-[13px]">{r.v === null ? "…" : fromUnits(r.v, decimals, 0)}</span> <span className="text-ink-3 text-[11px]">{symbol}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 py-2 border-t border-line">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-2 font-mono">Fees collected</span>
          <span className="pill !px-1.5 !py-0 !text-[9px] !tracking-[0.1em]" title="Each fee is a NEAR transfer checked on chain before its post was published">
            Verified tx
          </span>
        </span>
        <span className="text-[13px] text-ink text-right whitespace-nowrap">
          <span className="pixel text-[13px]">{fees === null ? "…" : fromUnits(fees, 24, 2)}</span> <span className="text-ink-3 text-[11px]">NEAR</span>
        </span>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-3">The treasury is the Challenge pools held by the vault; there is no separate wallet.</p>
      <p className="mt-2 text-[11.5px] text-ink-3">Fees collected are 0.01 NEAR posting fees on this community's conversation, paid to the protocol treasury account, not to the vault.</p>
      {refundable > 0n && (
        <p className="mt-2 text-[11.5px] text-ink-3">Refundable is sponsor deposits on failed campaigns. The vault does not record how much of it has already been withdrawn.</p>
      )}
    </div>
  );
}

function Growth({ stats }: { stats: CommunityStats | null }) {
  if (!stats) return <div className="card p-5 text-[13px] text-ink-2">Reading activity…</div>;
  const g = stats.growth;
  const max = Math.max(1, ...g.map((d) => d.newLockers));
  const total = g.reduce((a, d) => a + d.newLockers, 0);
  // 14 bars of 6 units with 4 between, on a 40 unit tall box.
  const W = 14 * 6 + 13 * 4;
  const H = 40;
  const label = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-[17px] tracking-tight">New lockers</h2>
        <Src kind="derived" />
      </div>
      <p className="mt-0.5 text-[11.5px] text-ink-2">
        First lock per account, last 14 days. <span className="pixel text-[12px] text-ink">{total}</span> in total.
      </p>
      <svg viewBox={`0 0 ${W} ${H + 1}`} width="100%" height="64" preserveAspectRatio="none" className="mt-3 block" role="img" aria-label={`New lockers per day, ${total} in the last 14 days`}>
        {g.map((d, i) => {
          const h = d.newLockers > 0 ? Math.max(2, (d.newLockers / max) * H) : 0;
          return <rect key={d.day} x={i * 10} y={H - h} width="6" height={h} fill="var(--color-ink)" />;
        })}
        <rect x="0" y={H} width={W} height="1" fill="var(--color-line-2)" />
      </svg>
      <div className="mt-1.5 flex items-baseline justify-between text-[10.5px] font-mono text-ink-3">
        <span>{label(g[0].day)}</span>
        <span>peak {max}</span>
        <span>{label(g[g.length - 1].day)}</span>
      </div>
    </div>
  );
}

/**
 * Activity timeline: dated events from recentActivity, merged with changes
 * useLiveActivity detects while the page is open. Live events can lack a
 * time (exits, claims and sponsor deposits are not timestamped on-chain), so
 * they show a "Live" tag instead of a date and sit above the dated history.
 */
function LiveTab({ communityId }: { communityId: string }) {
  const [history, setHistory] = useState<ActivityEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { events } = useLiveActivity({ communityId });
  const load = useCallback(async () => {
    try {
      setHistory(await recentActivity({ communityId, limit: 60 }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [communityId]);
  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: ActivityEvent[] = [];
    for (const e of [...events, ...(history ?? [])]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out.sort((a, b) => Number(b.live) - Number(a.live) || (b.at ?? 0) - (a.at ?? 0));
  }, [events, history]);

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-[17px] tracking-tight">Live</h2>
        <span className="text-[11.5px] text-ink-3">Locks, posts and reactions, newest first. Live rows were detected while this page was open.</span>
      </div>
      {failed && <p className="mt-4 text-[13px] text-bad">Activity is not reachable right now. It retries every 30 seconds.</p>}
      {!failed && history === null && <p className="mt-4 text-[13px] text-ink-2">Reading activity…</p>}
      {history && !rows.length && <p className="mt-4 text-[13px] text-ink-2">No activity recorded for this community yet.</p>}
      <ol className="mt-3 divide-y divide-line">
        {rows.map((e) => {
          const inner = (
            <>
              {e.account ? <Pfp id={e.account} size={26} /> : <span className="h-[26px] w-[26px] shrink-0 rounded-md bg-paper-2" />}
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink break-words">{e.text}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {e.demo && (
                  <span className="pill !px-1.5 !py-0 !text-[9px] !tracking-[0.1em] !border-line text-ink-3" title="Seeded demonstration activity">
                    Demo
                  </span>
                )}
                {e.live && <span className="tag tag-live">Live</span>}
                {e.at !== null && <span className="text-[11px] text-ink-3 whitespace-nowrap">{ago(e.at)}</span>}
              </span>
            </>
          );
          return (
            <li key={e.id}>
              {e.href ? (
                <Link to={e.href} className="py-2.5 flex items-center gap-3 hover:bg-paper -mx-2 px-2 rounded-lg transition">
                  {inner}
                </Link>
              ) : (
                <div className="py-2.5 flex items-center gap-3">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Relative time from unix seconds. */
function ago(at: number): string {
  return timeAgo(new Date(at * 1000).toISOString());
}
