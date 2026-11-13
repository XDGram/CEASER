import { useInView, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef } from "react";
import { useProtocol } from "../../lib/protocol";
import { CONFIG } from "../../config";
import { compact } from "../../lib/near";
import { EnterButton } from "../Nav";
import { Reveal } from "./Reveal";

function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 20 });
  useEffect(() => {
    if (inView) mv.set(value);
  }, [inView, value, mv]);
  useEffect(() => spring.on("change", (v) => ref.current && (ref.current.textContent = Math.round(v).toLocaleString("en-US"))), [spring]);
  return <span ref={ref}>0</span>;
}

export function Stats() {
  const { challenges, lockCount, meta } = useProtocol();
  const tm = meta(CONFIG.contracts.token);
  const sum = (k: "total_locked" | "penalty_total") => challenges.reduce((a, c) => a + BigInt(c[k]), 0n);
  const cells = [
    { big: <Counter value={lockCount} />, small: "Locks created on the vault" },
    { big: <Counter value={challenges.length} />, small: "Community Challenges opened" },
    { big: compact(sum("total_locked"), tm.decimals), small: `${tm.symbol} committed to Challenges` },
    { big: compact(sum("penalty_total"), tm.decimals), small: "Paid out of exit penalties to the holders who stayed" },
  ];
  return (
    <Reveal className="mx-auto max-w-[1180px] px-4 sm:px-6">
      <div className="card overflow-hidden grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1.25fr]">
        {cells.map((c, i) => (
          <div key={i} className="p-6 sm:p-8 min-h-[150px] flex flex-col justify-between gap-6 border-b lg:border-b-0 border-line [&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r">
            <div className="pixel text-[36px] sm:text-[44px] text-ink">{c.big}</div>
            <div className="text-[12px] leading-snug text-ink-2 max-w-[170px]">{c.small}</div>
          </div>
        ))}
        <div className="col-span-2 lg:col-span-1 p-6 sm:p-8 flex flex-col justify-between gap-6 bg-paper-2/50">
          <p className="text-[13px] leading-relaxed text-ink">Every number here is read live from the vault contract. Connect a wallet to lock, join a Challenge or claim.</p>
          <EnterButton className="btn btn-primary self-start" icon label="Open app" />
        </div>
      </div>
    </Reveal>
  );
}
