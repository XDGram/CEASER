import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef } from "react";
import { useProtocol } from "../../lib/protocol";
import { Reveal } from "./Reveal";
import { useWallet } from "../../lib/wallet";
import { EnterButton } from "../Nav";
import { CONFIG } from "../../config";
import { compact } from "../../lib/near";

function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 20 });
  useEffect(() => {
    if (inView) mv.set(value);
  }, [inView, value, mv]);
  useEffect(() => {
    return spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString("en-US") + suffix;
    });
  }, [spring, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

export function Stats() {
  const { challenges, lockCount, meta, reachable } = useProtocol();
  const { accountId } = useWallet();
  const tokenMeta = meta(CONFIG.contracts.token);
  const sum = (k: "total_locked" | "penalty_total") => challenges.reduce((a, c) => a + BigInt(c[k]), 0n);
  const locked = compact(sum("total_locked"), tokenMeta.decimals);
  const penalties = compact(sum("penalty_total"), tokenMeta.decimals);

  const cells = [
    { big: <Counter value={lockCount} />, small: "Locks created on the vault" },
    { big: <Counter value={challenges.length} />, small: "Community Challenges opened" },
    { big: locked, small: `${tokenMeta.symbol} committed across Challenges` },
    { big: penalties, small: `${tokenMeta.symbol} in penalties paid to stayers` },
  ];

  return (
    <Reveal className="mx-auto max-w-[1180px] px-4 sm:px-6">
      <div className="card overflow-hidden grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1.2fr]">
        {cells.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="p-6 sm:p-8 border-b lg:border-b-0 border-line [&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r"
          >
            <div className="pixel text-[34px] sm:text-[44px] text-ink">{c.big}</div>
            <div className="mt-3 text-[12px] leading-snug text-ink-2 max-w-[180px]">{c.small}</div>
          </motion.div>
        ))}
        <div className="col-span-2 lg:col-span-1 p-6 sm:p-8 bg-paper-2/60 flex flex-col justify-between gap-5">
          <p className="text-[13px] leading-relaxed text-ink">
            {reachable === false
              ? "The vault is not reachable right now. Reads will retry automatically."
              : "Every number on this page is read live from the vault on NEAR testnet. Connect a wallet to lock, join a Challenge or claim."}
          </p>
          {!accountId && <EnterButton className="btn btn-primary self-start" />}
        </div>
      </div>
    </Reveal>
  );
}
