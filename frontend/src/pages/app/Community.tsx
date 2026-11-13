import { useCallback, useEffect, useMemo, useState } from "react";
import { convictionByOwner, convictionWeight, loadFeed, type FeedData, type PostKind } from "../../lib/floor";
import { fmtDur, fromUnits, short, timeAgo } from "../../lib/near";
import { useProtocol } from "../../lib/protocol";
import { useWallet } from "../../lib/wallet";
import { Composer, PostCard, useAutoRefresh } from "../../components/FloorFeed";
import { Pfp } from "../../components/Pfp";
import { SectionHead } from "../../components/SectionHead";
import { Link } from "react-router-dom";
import { profilePath } from "../../lib/profile";

const FILTERS: { label: string; kind?: PostKind }[] = [
  { label: "All" },
  { label: "Theses", kind: "thesis" },
  { label: "Confessions", kind: "confession" },
  { label: "Pledges", kind: "pledge" },
  { label: "Receipts", kind: "receipt" },
];

export function Community() {
  const { challenges } = useProtocol();
  const { accountId } = useWallet();
  const [filter, setFilter] = useState(0);
  const [data, setData] = useState<FeedData | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      const d = await loadFeed({ kind: FILTERS[filter].kind }, accountId, challenges);
      setData(d);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [filter, accountId, challenges]);

  useEffect(() => {
    reload();
  }, [reload]);
  useAutoRefresh(reload);

  const conviction = useMemo(() => convictionByOwner(data?.locks ?? []), [data]);
  const leaders = useMemo(() => {
    const w = convictionWeight(data?.locks ?? []);
    return [...w.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 6);
  }, [data]);
  const pledges = useMemo(() => (data?.posts ?? []).filter((p) => p.kind === "pledge").slice(0, 6), [data]);
  const totalWeight = leaders.reduce((a, [, w]) => (w > a ? w : a), 1n);
  const activeChallenges = challenges.filter((c) => c.state === "active").map((c) => ({ id: c.id, title: c.title }));

  return (
    <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
      <SectionHead n="04" title="The Floor" sub="Theses, confessions and receipts from the people with skin in the game." />

      <div className="mt-6 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Composer challenges={activeChallenges} onPosted={reload} />

          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map((f, i) => (
              <button key={f.label} className={`px-3 py-1.5 rounded-full text-[12px] transition ${i === filter ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`} onClick={() => setFilter(i)}>
                {f.label}
              </button>
            ))}
          </div>

          {failed && <div className="card p-6 text-[13px] text-bad">The Floor is not reachable right now. It retries every 30 seconds.</div>}
          {!failed && data === null && <div className="card p-6 text-[13px] text-ink-2">Reading the floor…</div>}
          {data &&
            data.posts.map((p) => <PostCard key={p.id} post={p} names={data.names} conviction={conviction.get(p.author)} onChanged={reload} />)}
          {data && data.posts.length === 0 && <div className="card p-6 text-[13px] text-ink-2">Nothing here yet. Say something worth locking for.</div>}
        </div>

        <aside className="flex flex-col gap-5">
          <div className="card p-5">
            <h2 className="text-[16px] tracking-tight">Most conviction</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-2">Amount locked x time locked, right now.</p>
            <div className="mt-3 flex flex-col gap-2.5">
              {leaders.map(([owner, w], i) => (
                <div key={owner} className="flex items-center gap-2.5">
                  <span className="pixel text-[11px] text-ink-3 w-3">{i + 1}</span>
                  <Link to={profilePath(owner)} className="shrink-0" title={owner}>
                    <Pfp id={owner} size={24} />
                  </Link>
                  <Link to={profilePath(owner)} className="text-[12px] text-ink truncate flex-1 hover:underline underline-offset-4">
                    {data?.names[owner] ?? short(owner, 20)}
                  </Link>
                  <div className="h-1 w-16 rounded-full bg-paper-2 overflow-hidden shrink-0">
                    <div className="h-full bg-accent" style={{ width: `${Math.max(6, Number((w * 100n) / totalWeight))}%` }} />
                  </div>
                </div>
              ))}
              {!leaders.length && <p className="text-[12px] text-ink-2">No active locks.</p>}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-[16px] tracking-tight">Locked right now</h2>
            <div className="mt-3 flex flex-col divide-y divide-line">
              {pledges.map((p) => (
                <div key={p.id} className="py-2 flex items-start gap-2.5">
                  <Link to={profilePath(p.author)} className="shrink-0" title={p.author}>
                    <Pfp id={p.author} size={22} />
                  </Link>
                  <div className="min-w-0">
                    <div className="text-[12px] text-ink-2 leading-snug break-words">
                      <Link to={profilePath(p.author)} className="text-ink font-medium hover:underline underline-offset-4">
                        {data?.names[p.author] ?? short(p.author, 18)}
                      </Link>{" "}
                      {p.body}
                    </div>
                    <div className="text-[10.5px] text-ink-3 mt-0.5">{timeAgo(p.created_at)}</div>
                  </div>
                </div>
              ))}
              {!pledges.length && <p className="py-2 text-[12px] text-ink-2">No pledges yet.</p>}
            </div>
          </div>

          {conviction.size > 0 && accountId && conviction.get(accountId) && (
            <div className="card p-5 border-ok/30">
              <div className="text-[11px] uppercase tracking-[0.12em] text-ink-2 font-mono">Your conviction</div>
              <div className="pixel text-[24px] mt-1.5">{fromUnits(conviction.get(accountId)!.lockedNow, 18, 0)}</div>
              <div className="text-[11.5px] text-ink-2 mt-0.5">CSTEST locked · longest {fmtDur(conviction.get(accountId)!.longestSec)}</div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
