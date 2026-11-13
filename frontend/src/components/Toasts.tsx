import { AnimatePresence, motion } from "framer-motion";
import { useWallet } from "../lib/wallet";
import { CONFIG } from "../config";

export function Toasts() {
  const { toasts, dismiss } = useWallet();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-32px))]">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className={`card px-4 py-3 text-[13px] flex items-start gap-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)] ${t.kind === "err" ? "border-bad/40" : t.kind === "ok" ? "border-ok/40" : ""}`}
          >
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${t.kind === "err" ? "bg-bad" : t.kind === "ok" ? "bg-ok" : "bg-ink-3"}`} />
            <div className="flex-1 leading-snug">
              {t.text}
              {t.hash && (
                <a href={`${CONFIG.explorerUrl}/txns/${t.hash}`} target="_blank" rel="noopener" className="ml-2 font-mono text-[11px] text-ink-2 underline">
                  {t.hash.slice(0, 8)}…
                </a>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-ink-3 hover:text-ink leading-none" aria-label="Dismiss">
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
