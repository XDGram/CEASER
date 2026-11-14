import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useProtocol } from "../../lib/protocol";
import { fetchAllLocks } from "../../lib/near";
import { supabase } from "../../lib/floor";
import { formatNear, nearBacking, YOCTO } from "../../lib/nearTier";
import { NearMark } from "../NearMark";
import { Reveal, SectionIntro } from "./Reveal";

interface NearFigures {
  feesYocto: bigint;
  paidPosts: number;
  backingYocto: bigint;
  stakedYocto: bigint;
  holders: number;
}

/** Live NEAR figures: verified post fees from the feed, and NEAR held plus staked by active lockers. */
function useNearFigures(): NearFigures | null {
  const { lockCount } = useProtocol();
  const [f, setF] = useState<NearFigures | null>(null);
  useEffect(() => {
    if (!lockCount) return;
    let alive = true;
    (async () => {
      const [{ data }, locks] = await Promise.all([supabase.from("posts").select("fee_yocto::text").not("fee_tx", "is", null), fetchAllLocks(lockCount)]);
      const rows = (data ?? []) as unknown as { fee_yocto: string | null }[];
      const feesYocto = rows.reduce((a, r) => a + BigInt((r.fee_yocto ?? "0").split(".")[0] || "0"), 0n);
      const owners = [...new Set(locks.filter((l) => l.status === "active").map((l) => l.owner))];
      const backs = await Promise.all(owners.map((o) => nearBacking(o).catch(() => null)));
      const ok = backs.filter((b): b is NonNullable<typeof b> => b !== null);
      if (!alive) return;
      setF({
        feesYocto,
        paidPosts: rows.length,
        backingYocto: ok.reduce((a, b) => a + b.total, 0n),
        stakedYocto: ok.reduce((a, b) => a + b.staked, 0n),
        holders: owners.length,
      });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [lockCount]);
  return f;
}

const ROLES: { n: string; t: string; d: string; how: "Contract" | "Verified tx" | "App, from chain" }[] = [
  { n: "01", t: "Staked NEAR boosts rewards", d: "At claim the vault reads your stake in a whitelisted pool and multiplies your share of any Challenge pool, up to 2x.", how: "Contract" },
  { n: "02", t: "NEAR is the price of a voice", d: "Every post and reply costs 0.01 Ⓝ, paid to the protocol treasury. Each post links its fee transaction.", how: "Verified tx" },
  { n: "03", t: "Backing tiers", d: "NEAR held plus staked makes you a Holder (1 Ⓝ), Backer (10), Patron (100) or Whale (1,000), shown on every profile.", how: "App, from chain" },
  { n: "04", t: "NEAR to lead", d: "Starting a campaign needs 2 Ⓝ plus 1 Ⓝ per 1M tokens of target. Creating a community needs 5 Ⓝ. Announcements need 25 Ⓝ.", how: "App, from chain" },
  { n: "05", t: "Communities ranked by NEAR", d: "Every community shows the NEAR backing of its active lockers, and the leaderboard can rank by it.", how: "App, from chain" },
  { n: "06", t: "Memecoins become NEAR demand", d: "To hold with a boost, speak, lead or launch on CEASER you stake, hold or spend NEAR.", how: "Contract" },
];

export function NearCore() {
  const f = useNearFigures();
  const figures = [
    { big: f ? formatNear(f.feesYocto, 2) : "…", unit: "Ⓝ", small: `paid to the treasury by ${f ? f.paidPosts : "…"} posts, each a verified transfer` },
    { big: f ? formatNear(f.backingYocto, 0) : "…", unit: "Ⓝ", small: `held and staked by ${f ? f.holders : "…"} active lockers` },
    { big: f ? formatNear(f.stakedYocto, 0) : "…", unit: "Ⓝ", small: "staked by active lockers in the vault's boost pools (a real NEAR validator plus the testnet demo pool), earning reward boosts" },
  ];
  return (
    <Reveal id="near" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <SectionIntro
        title="Built on NEAR. Powered by NEAR."
        ghost="NEAR is the core, not a checkout option."
        text="The vault, the tokens, the oracle and every lock live on NEAR. And NEAR is what gives each action weight: stake it to earn more, spend it to speak, hold it to lead."
      />
      <div className="mt-10 card overflow-hidden grid sm:grid-cols-3">
        {figures.map((x, i) => (
          <div key={i} className="p-6 sm:p-8 border-b sm:border-b-0 sm:[&:not(:last-child)]:border-r border-line">
            <div className="flex items-baseline gap-1.5">
              <span className="pixel text-[34px] sm:text-[40px] text-ink">{x.big}</span>
              <span className="text-[16px] text-ink-2">{x.unit}</span>
            </div>
            <div className="mt-3 text-[12px] leading-snug text-ink-2 max-w-[240px]">{x.small}</div>
            <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3">live · on-chain</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROLES.map((r, i) => (
          <motion.div key={r.n} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: i * 0.06 }} className="card p-5 sm:p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <NearMark size={16} className="text-ink" />
                <span className="pixel text-[12px] text-ink-3">{r.n}</span>
              </span>
              <span className={`tag ${r.how === "Contract" ? "tag-live" : "tag-muted"}`}>{r.how}</span>
            </div>
            <h3 className="text-[16px] text-ink leading-snug">{r.t}</h3>
            <p className="text-[12.5px] leading-relaxed text-ink-2">{r.d}</p>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-[11.5px] text-ink-3">
        "Contract" is enforced by the vault. "Verified tx" and "App, from chain" are checked by the app against on-chain transactions and balances; moving them into the vault is the first roadmap item. Testnet NEAR, minimum post fee {formatNear(YOCTO / 100n, 2)} Ⓝ.
      </p>
    </Reveal>
  );
}
