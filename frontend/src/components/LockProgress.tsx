import { AnimatePresence, motion } from "framer-motion";
import { CONFIG } from "../config";
import { Mark } from "./Mark";

export type LockStage = { kind: "signing" } | { kind: "confirming"; hash?: string | null } | { kind: "done"; lockId: number; hash?: string | null } | { kind: "failed"; reason: string; hash?: string | null };

export function LockProgress({ stage, label, onDismiss }: { stage: LockStage; label: string; onDismiss: () => void }) {
  const done = stage.kind === "done";
  const failed = stage.kind === "failed";
  const hash = "hash" in stage ? stage.hash : null;
  const title = stage.kind === "signing" ? "Waiting for your wallet" : stage.kind === "confirming" ? `Locking ${label}` : done ? `Locked ${label}` : "Lock not created";
  const sub = stage.kind === "signing" ? "Approve the transaction to continue." : stage.kind === "confirming" ? "Confirming on NEAR. This takes a few seconds." : done ? `Lock #${stage.lockId} is yours. Taking you to it.` : stage.reason;

  return (
    <div className="card p-10 sm:p-14 min-h-[420px] flex flex-col items-center justify-center text-center">
      <div className="relative h-[120px] w-[120px]">
        <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
          <AnimatePresence>
            {!failed && (
              <motion.circle
                key={done ? "full" : "spin"}
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke={done ? "var(--color-ok)" : "var(--color-ink)"}
                strokeWidth="1.5"
                strokeLinecap="round"
                style={{ rotate: -90, transformOrigin: "60px 60px" }}
                initial={{ pathLength: done ? 0.25 : 0, opacity: 1 }}
                animate={done ? { pathLength: 1, rotate: -90 } : { pathLength: [0.08, 0.3, 0.08], rotate: [-90, 270] }}
                transition={done ? { duration: 0.6, ease: "easeOut" } : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </AnimatePresence>
          {failed && <circle cx="60" cy="60" r="54" fill="none" stroke="var(--color-bad)" strokeWidth="1.5" />}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.svg key="check" viewBox="0 0 48 48" className="h-12 w-12" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
                <motion.path d="M 12 25 L 21 33 L 37 15" fill="none" stroke="var(--color-ok)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.25, ease: "easeOut" }} />
              </motion.svg>
            ) : failed ? (
              <motion.svg key="x" viewBox="0 0 48 48" className="h-12 w-12" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <path d="M 15 15 L 33 33 M 33 15 L 15 33" fill="none" stroke="var(--color-bad)" strokeWidth="3" strokeLinecap="round" />
              </motion.svg>
            ) : (
              <motion.div key="mark" animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} className="text-ink">
                <Mark size={44} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <motion.h3 key={stage.kind} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-8 text-[22px] text-ink">
        {title}
      </motion.h3>
      <p className={`mt-2 max-w-[360px] text-[13.5px] leading-relaxed ${failed ? "text-bad" : "text-ink-2"}`}>{sub}</p>
      {hash && (
        <a href={`${CONFIG.explorerUrl}/txns/${hash}`} target="_blank" rel="noopener" className="mt-3 font-mono text-[11px] text-ink-3 hover:text-ink">
          {hash.slice(0, 10)}… on explorer
        </a>
      )}
      {failed && (
        <button className="btn btn-outline mt-6" onClick={onDismiss}>
          Back to the form
        </button>
      )}
    </div>
  );
}
