import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CONFIG } from "../../config";
import { computeCommunityStats, createCommunity, loadCommunities, type Community, type CommunityStats } from "../../lib/community";
import { fetchAllLocks, fromUnits, view } from "../../lib/near";
import { useProtocol } from "../../lib/protocol";
import type { Lock } from "../../lib/types";
import { errorText, useWallet } from "../../lib/wallet";
import { useLiveActivity, useRankMovement } from "../../lib/live";
import { Busy, SectionHead } from "../../components/SectionHead";

const SLUG = /^[a-z0-9-]{3,32}$/;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

type SortKey = "committed" | "participants" | "conviction" | "retention";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "committed", label: "Committed volume" },
  { key: "participants", label: "Participants" },
  { key: "conviction", label: "Conviction" },
  { key: "retention", label: "Retention" },
];

/** A sort value as a bigint so token amounts and counts compare the same way. */
function metric(s: CommunityStats, key: SortKey): bigint {
  if (key === "committed") return s.committed;
  if (key === "participants") return BigInt(s.activeLockers);
  if (key === "conviction") return s.conviction;
  return BigInt(Math.round(s.retentionPct * 10));
}

/** Conviction is token-units x seconds; shown as whole tokens x days. */
function convictionLabel(v: bigint, decimals: number): string {
  return `${fromUnits(v / 86400n, decimals, 0)}`;
}

/** The distance to the rank above, in whatever the table is sorted by. */
function gapLabel(gap: bigint, key: SortKey, decimals: number, symbol: string): string {
  if (key === "committed") return `${fromUnits(gap, decimals, 0)} ${symbol}`;
  if (key === "participants") return `${gap} locker${gap === 1n ? "" : "s"}`;
  if (key === "conviction") return `${convictionLabel(gap, decimals)} token-days`;
  return `${(Number(gap) / 10).toFixed(1)} points`;
}

export function Communities() {
  const { challenges, meta } = useProtocol();
  const { accountId, connect, toast } = useWallet();
  const navigate = useNavigate();
  const tm = meta(CONFIG.contracts.token);
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [locks, setLocks] = useState<Lock[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<SortKey>("committed");
  const moves = useRankMovement();
  // A rank change detected while the page is open highlights that row briefly.
  const { events } = useLiveActivity();
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = events.filter((e) => e.kind === "rank_change" && e.communityId).map((e) => e.communityId as string);
    if (!ids.length) return;
    setFlash((f) => new Set([...f, ...ids]));
    const t = window.setTimeout(() => setFlash(new Set()), 6000);
    return () => window.clearTimeout(t);
  }, [events]);

  const load = useCallback(async () => {
    try {
      const count = await view<number>(CONFIG.contracts.vault, "get_lock_count");
      const [cs, ls] = await Promise.all([loadCommunities(), fetchAllLocks(count)]);
      setCommunities(cs);
      setLocks(ls);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!communities || !locks) return [];
    return communities.map((c) => ({ c, s: computeCommunityStats(c, challenges, locks, tm.decimals) }));
  }, [communities, locks, challenges, tm.decimals]);

  const ranked = useMemo(() => [...rows].sort((a, b) => {
    const d = metric(b.s, sort) - metric(a.s, sort);
    return d > 0n ? 1 : d < 0n ? -1 : a.c.name.localeCompare(b.c.name);
  }), [rows, sort]);
  const leader = ranked.length ? metric(ranked[0].s, sort) : 0n;

  const show = (s: CommunityStats) =>
    sort === "committed" ? `${fromUnits(s.committed, tm.decimals, 0)} ${tm.symbol}` : sort === "participants" ? String(s.activeLockers) : sort === "conviction" ? convictionLabel(s.conviction, tm.decimals) : `${s.retentionPct}%`;

  // ---------- create form ----------
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [milestones, setMilestones] = useState("250000, 500000, 1000000");
  const [busy, setBusy] = useState(false);
  const effSlug = slugTouched ? slug : slugify(name);
  const slugProblem = !effSlug
    ? null
    : !SLUG.test(effSlug)
      ? "3 to 32 characters: lowercase letters, digits and dashes"
      : communities?.some((c) => c.id === effSlug)
        ? "That id is taken"
        : null;

  const create = async () => {
    if (!accountId) return connect();
    setBusy(true);
    try {
      if (!name.trim()) throw new Error("Give the community a name");
      if (!effSlug || slugProblem) throw new Error(slugProblem ?? "Pick an id");
      const ms = milestones
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (ms.some((m) => !/^\d+$/.test(m) || BigInt(m) <= 0n)) throw new Error("Milestones are whole-token amounts, separated by commas");
      await createCommunity({
        id: effSlug,
        name: name.trim(),
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        token: CONFIG.contracts.token,
        creator: accountId,
        challenge_ids: [],
        milestones: ms,
      });
      toast(`${name.trim()} created`, "ok");
      navigate(`/app/c/${effSlug}`);
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
      <SectionHead n="05" title="Communities" sub="Groups that run Challenges together and pool their conviction." />

      {failed && <div className="card mt-6 p-6 text-[13px] text-bad">Communities are not reachable right now.</div>}
      {!failed && !communities && <div className="card mt-6 p-6 text-[13px] text-ink-2">Reading communities…</div>}

      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(({ c, s }, i) => {
          const next = s.milestones.find((m) => !m.reached);
          const p = next ? Math.min(100, Number((s.committed * 1000n) / next.target) / 10) : 100;
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/app/c/${c.id}`} className="card p-5 sm:p-6 flex flex-col gap-4 h-full hover:border-line-2 transition">
                <div>
                  <div className="text-[11px] font-mono text-ink-3">{c.id}</div>
                  <h3 className="text-[17px] tracking-tight text-ink leading-tight">{c.name}</h3>
                  {c.tagline && <p className="mt-1 text-[12.5px] text-ink-2">{c.tagline}</p>}
                </div>
                <div className="grid grid-cols-3 gap-3 text-[12px]">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Committed</div>
                    <div className="pixel text-[18px] mt-1">{fromUnits(s.committed, tm.decimals, 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Lockers</div>
                    <div className="pixel text-[18px] mt-1">{s.activeLockers}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Campaigns</div>
                    <div className="pixel text-[18px] mt-1">{s.campaigns.active}</div>
                  </div>
                </div>
                <div className="mt-auto">
                  <div className="flex items-baseline justify-between text-[11.5px] mb-1.5">
                    <span className="text-ink-2">{next ? "Next milestone" : "All milestones reached"}</span>
                    {next && (
                      <span className="text-ink">
                        {fromUnits(next.target, tm.decimals, 0)} {tm.symbol}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-paper-2 overflow-hidden">
                    <div className={`h-full rounded-full ${next ? "bg-ink" : "bg-ok"}`} style={{ width: `${p}%` }} />
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {rows.length > 0 && (
        <div className="card mt-8 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[17px] tracking-tight">Leaderboard</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-2">Live ranking from on-chain data.</p>
            </div>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sort by">
              {SORTS.map((x) => (
                <button key={x.key} role="tab" aria-selected={sort === x.key} className={`px-3 py-1.5 rounded-full text-[12px] transition ${sort === x.key ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`} onClick={() => setSort(x.key)}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <ol className="mt-4 divide-y divide-line" data-sort={sort}>
            {ranked.map(({ c, s }, i) => {
              const v = metric(s, sort);
              const w = leader > 0n ? Math.max(2, Number((v * 1000n) / leader) / 10) : 0;
              const move = moves.get(c.id) ?? 0;
              const ahead = i > 0 ? ranked[i - 1] : null;
              const gap = ahead ? metric(ahead.s, sort) - v : 0n;
              return (
                <li
                  key={c.id}
                  className={`py-3 grid grid-cols-[24px_minmax(0,1fr)_auto] sm:grid-cols-[24px_minmax(0,220px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px] transition-colors ${flash.has(c.id) ? "bg-accent/5" : ""}`}
                  data-rank-id={c.id}
                  data-flash={flash.has(c.id) ? "1" : undefined}
                >
                  <span className="pixel text-[13px] text-ink-3">{i + 1}</span>
                  <div className="min-w-0">
                    <Link to={`/app/c/${c.id}`} className="block text-ink truncate hover:underline underline-offset-4">
                      {c.name}
                    </Link>
                    {(move !== 0 || (ahead && gap > 0n)) && (
                      <div className="mt-0.5 text-[10.5px] leading-snug text-ink-3" data-rank-note>
                        {move !== 0 && (
                          <span className={move > 0 ? "text-ok" : ""}>
                            {move > 0 ? "up" : "down"} <span className="pixel text-[11px]">{Math.abs(move)}</span> since your last visit
                          </span>
                        )}
                        {move !== 0 && ahead && gap > 0n && <span> · </span>}
                        {ahead && gap > 0n && (
                          <span>
                            <span className="pixel text-[11px]">{gapLabel(gap, sort, tm.decimals, tm.symbol).split(" ")[0]}</span>{" "}
                            {gapLabel(gap, sort, tm.decimals, tm.symbol).split(" ").slice(1).join(" ")} behind {ahead.c.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:block h-1.5 rounded-full bg-paper-2 overflow-hidden">
                    <motion.div key={sort} initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.5, ease: "easeOut" }} className={`h-full rounded-full ${i === 0 ? "bg-accent" : "bg-ink"}`} />
                  </div>
                  <span className="text-right whitespace-nowrap" data-value>
                    <span className="pixel text-[14px]">{show(s).split(" ")[0]}</span>
                    {show(s).includes(" ") && <span className="ml-1 text-[11px] text-ink-2">{show(s).split(" ").slice(1).join(" ")}</span>}
                  </span>
                  <div className="col-span-3 sm:hidden h-1 rounded-full bg-paper-2 overflow-hidden -mt-1">
                    <div className={`h-full rounded-full ${i === 0 ? "bg-accent" : "bg-ink"}`} style={{ width: `${w}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
          {sort === "conviction" && <p className="mt-2 text-[11px] text-ink-3">Conviction in token-days: amount locked x time to each Challenge's deadline.</p>}
          {sort === "retention" && <p className="mt-2 text-[11px] text-ink-3">Share of the community's locks that are still active.</p>}
        </div>
      )}

      <div className="card mt-8 p-6 sm:p-8">
        <h2 className="text-[17px] tracking-tight">Create a community</h2>
        <div className="mt-5 grid sm:grid-cols-2 gap-5">
          <label className="field">
            <span>Name</span>
            <input className="input" maxLength={60} placeholder="Diamond Hands DAO" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Id (used in the link)</span>
            <input
              className="input font-mono text-[13px]"
              maxLength={32}
              placeholder="diamond-hands"
              value={effSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
            <span className={`!normal-case !tracking-normal !font-sans !text-[11.5px] ${slugProblem ? "!text-bad" : "!text-ink-3"}`}>{slugProblem ?? (effSlug ? `/app/c/${effSlug}` : "Generated from the name")}</span>
          </label>
          <label className="field sm:col-span-2">
            <span>Tagline</span>
            <input className="input" maxLength={120} placeholder="Nobody sells before Sunday." value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </label>
          <label className="field sm:col-span-2">
            <span>Description</span>
            <textarea className="input min-h-[80px]" maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="field">
            <span>Token</span>
            <div className="input text-ink-2 text-[12.5px] truncate">
              {tm.symbol} · {CONFIG.contracts.token}
            </div>
          </div>
          <label className="field">
            <span>Milestones (whole {tm.symbol}, comma separated)</span>
            <input className="input" value={milestones} onChange={(e) => setMilestones(e.target.value)} />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button className="btn btn-accent" disabled={busy || (!!accountId && (!!slugProblem || !name.trim()))} onClick={create}>
            <Busy on={busy}>{accountId ? "Create community" : "Connect to create"}</Busy>
          </button>
          <span className="text-[12px] text-ink-2">Created by {accountId ?? "your wallet"}. Attach Challenges from its page.</span>
        </div>
      </div>
    </section>
  );
}
