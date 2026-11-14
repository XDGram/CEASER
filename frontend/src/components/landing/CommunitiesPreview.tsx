import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CONFIG } from "../../config";
import { compact, fetchAllLocks, fromUnits } from "../../lib/near";
import { useProtocol } from "../../lib/protocol";
import { computeCommunityStats, loadCommunities, type Community, type CommunityStats } from "../../lib/community";
import { useWallet } from "../../lib/wallet";
import { EnterButton } from "../Nav";
import { Reveal, SectionIntro } from "./Reveal";

export function CommunitiesPreview() {
  const { challenges, lockCount, meta } = useProtocol();
  const { accountId } = useWallet();
  const tm = meta(CONFIG.contracts.token);
  const [rows, setRows] = useState<{ c: Community; s: CommunityStats }[] | null>(null);

  useEffect(() => {
    if (!lockCount || !challenges.length) return;
    let alive = true;
    Promise.all([loadCommunities(), fetchAllLocks(lockCount)])
      .then(([cs, locks]) => {
        if (!alive) return;
        const r = cs.map((c) => ({ c, s: computeCommunityStats(c, challenges, locks, tm.decimals) }));
        r.sort((a, b) => (b.s.committed > a.s.committed ? 1 : b.s.committed < a.s.committed ? -1 : 0));
        setRows(r.slice(0, 3));
      })
      .catch(() => setRows([]));
    return () => {
      alive = false;
    };
  }, [lockCount, challenges, tm.decimals]);

  return (
    <Reveal id="communities" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <SectionIntro
        title="Communities hold together."
        ghost="Campaigns, milestones and a treasury, on-chain."
        text="A community groups its holding campaigns, tracks milestones toward a shared target, and pays its stayers from Challenge pools held by the vault. Members talk on its feed, one NEAR-paid post at a time."
        action={accountId ? <Link to="/app/communities" className="btn btn-outline btn-sm">All communities</Link> : <EnterButton className="btn btn-outline btn-sm" label="Connect to join" />}
      />
      <div className="mt-10 grid md:grid-cols-3 gap-4">
        {(rows ?? []).map(({ c, s }, i) => {
          const next = s.milestones.find((m) => !m.reached);
          const reached = s.milestones.filter((m) => m.reached).length;
          const pct = next && next.target > 0n ? Math.min(100, Number((s.committed * 1000n) / next.target) / 10) : 100;
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: i * 0.08 }} className="card p-5 sm:p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="pixel text-[12px] text-ink-3">#{i + 1}</div>
                  <h3 className="mt-1 text-[18px] leading-tight text-ink">{c.name}</h3>
                  {c.tagline && <p className="mt-1 text-[12.5px] text-ink-2">{c.tagline}</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-[11px] text-ink-2">
                <div>
                  <div className="pixel text-[18px] text-ink">{compact(s.committed, tm.decimals)}</div>
                  committed
                </div>
                <div>
                  <div className="pixel text-[18px] text-ink">{s.activeLockers}</div>
                  holding
                </div>
                <div>
                  <div className="pixel text-[18px] text-ink">{reached}</div>
                  milestones
                </div>
              </div>
              <div>
                <div className="h-1.5 rounded-full bg-paper-2 overflow-hidden">
                  <motion.div initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 0.9 }} className="h-full bg-ink" />
                </div>
                <div className="mt-1.5 text-[11.5px] text-ink-2">
                  {next ? `${fromUnits(next.target - s.committed > 0n ? next.target - s.committed : 0n, tm.decimals, 0)} ${tm.symbol} to the next milestone` : "Every milestone reached"}
                </div>
              </div>
              <Link to={`/app/c/${c.id}`} className="mt-auto text-[12.5px] text-ink hover:underline">
                Open community →
              </Link>
            </motion.div>
          );
        })}
        {rows === null && <div className="card p-8 text-[13px] text-ink-2 md:col-span-3">Loading communities from the vault…</div>}
      </div>
    </Reveal>
  );
}
