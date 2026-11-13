import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CONFIG } from "../config";
import { awaitExited, clearPendingExit, previewExit, savePendingExit, type ExitPreview } from "../lib/exit";
import { fromUnits, pct, short, txHash } from "../lib/near";
import { useProtocol } from "../lib/protocol";
import type { Lock } from "../lib/types";
import { errorText, useWallet } from "../lib/wallet";
import { FlowProgress } from "./LockProgress";

export type ExitStage =
  | { kind: "review" }
  | { kind: "signing" }
  | { kind: "confirming"; hash?: string | null }
  | { kind: "done"; returned: bigint; penalty: bigint; sinkLabel: string; hash?: string | null }
  | { kind: "failed"; reason: string; hash?: string | null };

const HOLD_MS = 1500;

/**
 * A danger button that only fires after being held for HOLD_MS, with a fill
 * that tracks the hold. Works with the pointer and with Enter or Space held.
 */
function HoldButton({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const fired = useRef(false);

  const stop = useCallback(() => {
    start.current = null;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (!fired.current) setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (start.current === null) return;
    const p = Math.min(1, (performance.now() - start.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      fired.current = true;
      start.current = null;
      onConfirm();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }, [onConfirm]);

  const begin = useCallback(() => {
    if (disabled || start.current !== null || fired.current) return;
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  useEffect(() => stop, [stop]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (!e.repeat) begin();
  };
  const onKeyUp = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      stop();
    }
  };

  return (
    <button
      type="button"
      className="btn btn-danger relative overflow-hidden justify-center"
      disabled={disabled}
      aria-label={`${label}. Press and hold for 1.5 seconds to confirm.`}
      data-hold-progress={progress.toFixed(2)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        begin();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={stop}
      onClick={(e) => e.preventDefault()}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 bg-bad/15" style={{ width: `${progress * 100}%` }} />
      <span className="relative">{progress > 0 && progress < 1 ? "Keep holding…" : label}</span>
    </button>
  );
}

function Breakdown({ p, symbol, decimals }: { p: ExitPreview; symbol: string; decimals: number }) {
  const total = p.remaining > 0n ? p.remaining : 1n;
  const retPct = Number((p.returned * 10000n) / total) / 100;
  const sinkLine =
    p.penalty === 0n
      ? "Everything left in this lock is already free, so no penalty is charged."
      : p.sink.kind === "challenge"
      ? `Your penalty is paid to the ${p.sink.stayers} locker${p.sink.stayers === 1 ? "" : "s"} who stay.`
      : p.sink.treasury
        ? "The sink Challenge is no longer open, so the vault pays the penalty to its treasury."
        : "The penalty is sent to the account set on this lock.";
  return (
    <div className="rounded-xl border border-line bg-paper p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-2 font-mono">Back to you now</div>
          <div className="pixel text-[26px] mt-1.5 text-ink">{fromUnits(p.returned, decimals, 0)}</div>
          <div className="text-[11.5px] text-ink-2 mt-0.5">
            {symbol}
            {p.free > 0n ? ` · ${fromUnits(p.free, decimals, 0)} already free, no penalty` : ""}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-2 font-mono">Penalty</div>
          <div className="pixel text-[26px] mt-1.5 text-bad">{fromUnits(p.penalty, decimals, 0)}</div>
          <div className="text-[11.5px] text-ink-2 mt-0.5">{symbol}</div>
        </div>
      </div>

      <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-paper-2" role="img" aria-label={`${retPct.toFixed(1)} percent returned, ${(100 - retPct).toFixed(1)} percent penalty`}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${retPct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} className="h-full bg-ink" />
        <motion.div initial={{ width: 0 }} animate={{ width: `${100 - retPct}%` }} transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }} className="h-full" style={{ background: "var(--color-bad)" }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] font-mono text-ink-3">
        <span>returned</span>
        <span>penalty</span>
      </div>

      <div className="mt-4 border-t border-line pt-3 text-[12.5px] leading-relaxed">
        <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-2 font-mono">Where the penalty goes</div>
        <div className="mt-1 text-ink">
          {p.sink.kind === "challenge" ? (
            <>
              Challenge #{p.sink.challenge.id} · {p.sink.challenge.title}
            </>
          ) : (
            <span className="font-mono text-[12px]">{short(p.sink.account, 40)}</span>
          )}
        </div>
        <div className="text-ink-2">{sinkLine}</div>
      </div>
    </div>
  );
}

export interface ExitResume {
  hash: string | null;
  claimedBefore: string;
  sinkLabel: string;
}

/**
 * Early-exit confirmation and progress. `resume` reopens it after a wallet
 * redirect in the confirming stage; `initialStage` can open it straight into
 * a failed state when the wallet returned an error.
 */
export function ExitDialog({ lock, initialStage, resume, onClose }: { lock: Lock; initialStage?: ExitStage; resume?: ExitResume; onClose: (exited: boolean) => void }) {
  const { meta, challenges, refresh, refreshUser } = useProtocol();
  const { call, accountId } = useWallet();
  const tm = meta(lock.token);
  const [stage, setStage] = useState<ExitStage>(resume ? { kind: "confirming", hash: resume.hash } : (initialStage ?? { kind: "review" }));
  const [preview, setPreview] = useState<ExitPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(typeof document !== "undefined" ? (document.activeElement as HTMLElement) : null);
  const pending = stage.kind === "signing" || stage.kind === "confirming";

  useEffect(() => {
    let live = true;
    previewExit(lock, challenges)
      .then((p) => live && setPreview(p))
      .catch((e) => live && setPreviewError(errorText(e)));
    return () => {
      live = false;
    };
  }, [lock, challenges]);

  // Focus "Stay locked" on open; restore focus to the trigger on close.
  useEffect(() => {
    const prev = returnFocus.current;
    const t = window.setTimeout(() => (stayRef.current ?? dialogRef.current)?.focus(), 30);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  const close = useCallback(() => {
    if (pending) return; // a transaction is in flight; the progress view resolves it
    onClose(stage.kind === "done");
  }, [pending, onClose, stage.kind]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const sinkLabel = (p: ExitPreview | null) => (!p ? "the sink" : p.sink.kind === "challenge" ? "the stayers" : p.sink.treasury ? "the treasury" : short(p.sink.account, 28));

  // Resolve a submitted exit from chain state: returned and penalty are read
  // back from the lock, so both the in-page and redirect paths agree.
  const resolve = useCallback(
    async (claimedBefore: bigint, hash: string | null | undefined, label: string) => {
      setStage({ kind: "confirming", hash });
      const exited = await awaitExited(lock.id);
      await Promise.all([refresh(), refreshUser()]);
      if (!exited) {
        setStage({ kind: "failed", reason: "The vault did not record this exit. Your lock is unchanged; check it and try again.", hash });
        return;
      }
      const claimedAfter = BigInt(exited.claimed_amount);
      setStage({ kind: "done", returned: claimedAfter - claimedBefore, penalty: BigInt(exited.amount) - claimedAfter, sinkLabel: label, hash });
    },
    [lock.id, refresh, refreshUser],
  );

  // Redirect resume: settle the exit from chain state.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !resume) return;
    resumed.current = true;
    void resolve(BigInt(resume.claimedBefore), resume.hash, resume.sinkLabel);
  }, [resume, resolve]);

  useEffect(() => {
    if (stage.kind !== "done") return;
    const t = window.setTimeout(() => onClose(true), 1800);
    return () => window.clearTimeout(t);
  }, [stage.kind, onClose]);

  const confirm = useCallback(async () => {
    if (!preview || !accountId) return;
    const claimedBefore = BigInt(lock.claimed_amount);
    const label = sinkLabel(preview);
    setStage({ kind: "signing" });
    savePendingExit({ lockId: lock.id, claimedBefore: claimedBefore.toString(), amount: lock.amount, sinkLabel: label });
    try {
      const out = await call(CONFIG.contracts.vault, "early_exit", { lock_id: lock.id }, CONFIG.gas.call);
      // Browser wallets redirect away before this resolves; in-page wallets land here.
      clearPendingExit();
      await resolve(claimedBefore, txHash(out), label);
    } catch (e) {
      clearPendingExit();
      setStage({ kind: "failed", reason: errorText(e) });
    }
  }, [preview, accountId, lock, call, resolve]);

  const body = (() => {
    if (stage.kind === "review") {
      return (
        <>
          <h2 id="exit-title" className="text-[22px] tracking-tight text-ink">
            Leave lock #{lock.id} early?
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">
            Free tranches come back in full. The {pct(lock.penalty_bps)} penalty applies only to what is still locked.
          </p>
          <div className="mt-5">
            {preview ? (
              <Breakdown p={preview} symbol={tm.symbol} decimals={tm.decimals} />
            ) : previewError ? (
              <div className="rounded-xl border border-bad/30 bg-bad/5 p-4 text-[13px] text-bad">Could not read this lock's exit terms: {previewError}</div>
            ) : (
              <div className="rounded-xl border border-line bg-paper p-5 text-[13px] text-ink-2 flex items-center gap-2">
                <span className="spinner" /> Reading the exit terms…
              </div>
            )}
          </div>
          {preview?.leaves && (
            <p className="mt-3 text-[12.5px] text-ink">
              You leave Challenge #{preview.leaves.id}. Your amount stops counting toward its goal.
            </p>
          )}
          {preview?.rewardOnExit && (
            <p className="mt-3 text-[12.5px] text-ink">Your reward from the finalized Challenge is paid out on exit, without the NEAR boost. Claim instead to keep the boost.</p>
          )}
          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
            <HoldButton label={`Exit and pay ${preview ? fromUnits(preview.penalty, tm.decimals, 0) : "…"} ${tm.symbol}`} onConfirm={confirm} disabled={!preview} />
            <button ref={stayRef} type="button" className="btn btn-primary justify-center" onClick={() => onClose(false)}>
              Stay locked
            </button>
          </div>
          <p className="mt-2.5 text-[11px] text-ink-3 sm:text-right">Press and hold the exit button to confirm.</p>
        </>
      );
    }
    const phase = stage.kind === "done" ? "done" : stage.kind === "failed" ? "failed" : "pending";
    const title =
      stage.kind === "signing" ? "Waiting for your wallet" : stage.kind === "confirming" ? `Exiting lock #${lock.id}` : stage.kind === "done" ? `Lock #${lock.id} exited` : "Exit not completed";
    const sub =
      stage.kind === "signing"
        ? "Approve the early exit in your wallet."
        : stage.kind === "confirming"
          ? "Confirming on NEAR. This takes a few seconds."
          : stage.kind === "done"
            ? `${fromUnits(stage.returned, tm.decimals, 0)} ${tm.symbol} returned. ${fromUnits(stage.penalty, tm.decimals, 0)} ${tm.symbol} paid to ${stage.sinkLabel}.`
            : stage.reason;
    return (
      <>
        <FlowProgress phase={phase} title={title} sub={sub} hash={"hash" in stage ? stage.hash : null} bare onDismiss={() => setStage({ kind: "review" })} dismissLabel="Back" />
        {stage.kind === "failed" && (
          <div className="flex justify-center">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onClose(false)}>
              Close
            </button>
          </div>
        )}
      </>
    );
  })();

  return createPortal(
    <AnimatePresence>
      <motion.div key="backdrop" className="fixed inset-0 z-[60] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onMouseDown={close} aria-hidden />
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={stage.kind === "review" ? "exit-title" : undefined}
          aria-label={stage.kind === "review" ? undefined : `Exit lock #${lock.id}`}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="card relative w-full max-w-[480px] max-h-[calc(100vh-32px)] overflow-y-auto p-6 sm:p-7 shadow-[0_24px_60px_rgba(20,20,20,0.18)] outline-none"
        >
          {body}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
