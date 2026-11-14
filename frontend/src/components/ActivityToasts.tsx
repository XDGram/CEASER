import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { short, timeAgo } from "../lib/near";
import { loadNames } from "../lib/floor";
import { recentActivity, useLiveActivity, type ActivityEvent } from "../lib/live";
import { useWallet } from "../lib/wallet";
import { Pfp } from "./Pfp";

/**
 * Activity pop-ups in the bottom-left corner, clear of the wallet toasts on
 * the right. One at a time, newest first, each from a real vault or Supabase
 * event. On first load the six most recent dated events replay with their real
 * times, then live changes arrive as the engine detects them.
 */

const MUTE_KEY = "ceaser:activity-muted";
const SHOW_MS = 5000;
const GAP_MS = 700;
const REPLAY = 6;

const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(m.matches);
    apply();
    m.addEventListener("change", apply);
    return () => m.removeEventListener("change", apply);
  }, []);
  return reduced;
}

export function ActivityToasts() {
  const { accountId } = useWallet();
  const reduced = useReducedMotion();
  const [muted, setMuted] = useState(readMuted);
  const [names, setNames] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<ActivityEvent | null>(null);
  const [paused, setPaused] = useState(false);

  const queue = useRef<ActivityEvent[]>([]);
  const shown = useRef<Set<string>>(new Set());
  const timer = useRef<number | null>(null);
  const gap = useRef<number | null>(null);
  const [pulse, setPulse] = useState(0); // nudges the driver when the queue changes

  const { events } = useLiveActivity();

  const enqueue = useCallback(
    (list: ActivityEvent[]) => {
      const add = list.filter((e) => !shown.current.has(e.id) && e.account !== accountId);
      if (!add.length) return;
      add.forEach((e) => shown.current.add(e.id));
      queue.current.push(...add);
      setPulse((p) => p + 1);
    },
    [accountId],
  );

  // Replay the most recent real history once, so the app is not silent on arrival.
  const replayed = useRef(false);
  useEffect(() => {
    if (muted || replayed.current) return;
    replayed.current = true;
    recentActivity({ limit: REPLAY + 6 })
      .then((list) => enqueue(list.slice(0, REPLAY)))
      .catch(() => {
        /* no history is better than invented history */
      });
  }, [muted, enqueue]);

  // Live events, newest last so they play in the order they happened.
  useEffect(() => {
    if (muted || !events.length) return;
    enqueue([...events].reverse());
  }, [events, muted, enqueue]);

  // Take the next one off the queue when the slot is free.
  useEffect(() => {
    if (muted) {
      queue.current = [];
      setCurrent(null);
      return;
    }
    if (current || paused) return;
    const next = queue.current.shift();
    if (next) setCurrent(next);
  }, [current, paused, muted, pulse]);

  // Hold it for SHOW_MS, then clear and nudge the queue after a short gap.
  // Hovering pauses by cancelling the timer; leaving starts a fresh one.
  useEffect(() => {
    if (!current || paused) return;
    timer.current = window.setTimeout(() => {
      setCurrent(null);
      gap.current = window.setTimeout(() => setPulse((p) => p + 1), GAP_MS);
    }, SHOW_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [current, paused]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (gap.current) window.clearTimeout(gap.current);
    },
    [],
  );

  useEffect(() => {
    loadNames()
      .then(setNames)
      .catch(() => {
        /* account ids are a fine fallback */
      });
  }, []);

  const dismiss = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setCurrent(null);
    gap.current = window.setTimeout(() => setPulse((p) => p + 1), GAP_MS);
  };

  const toggleMute = () => {
    const v = !muted;
    setMuted(v);
    try {
      localStorage.setItem(MUTE_KEY, v ? "1" : "0");
    } catch {
      /* the session still honours the toggle */
    }
    if (v) {
      if (timer.current) window.clearTimeout(timer.current);
      queue.current = [];
      setCurrent(null);
    } else {
      setPulse((p) => p + 1);
    }
  };

  const when = useMemo(() => (current?.at ? timeAgo(new Date(current.at * 1000).toISOString()) : "just now"), [current]);

  return (
    <div className="fixed left-4 bottom-[84px] sm:bottom-4 z-50 flex flex-col items-start gap-2 w-[min(330px,calc(100vw-32px))]" aria-live="polite">
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: reduced ? 0.15 : 0.28, ease: "easeOut" }}
            className="card w-full px-3.5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div className="flex items-start gap-2.5">
              {current.account ? <Pfp id={current.account} size={28} /> : <span className="h-7 w-7 shrink-0 rounded-md bg-paper-2" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12.5px] font-medium text-ink truncate">
                    {current.account ? (names[current.account] ?? short(current.account, 20)) : "The vault"}
                  </span>
                  {current.live && <span className="pill !px-1.5 !py-0 !text-[9px] border-ok/50 text-ok">live</span>}
                  {current.demo && <span className="pill !px-1.5 !py-0 !text-[9px]">demo</span>}
                  <span className="ml-auto text-[10.5px] font-mono text-ink-3 shrink-0">{when}</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-snug text-ink-2 break-words">{current.text}</p>
                {current.href && (
                  <Link to={current.href} className="mt-1.5 inline-block text-[11.5px] text-ink-2 hover:text-ink underline-offset-4 hover:underline" onClick={dismiss}>
                    Open
                  </Link>
                )}
              </div>
              <button onClick={dismiss} className="text-ink-3 hover:text-ink leading-none shrink-0" aria-label="Dismiss">
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={toggleMute}
        className="pill cursor-pointer hover:border-ink hover:text-ink !normal-case !tracking-normal"
        title={muted ? "Show activity pop-ups" : "Mute activity pop-ups"}
        aria-pressed={muted}
      >
        {muted ? "activity off" : "activity on"}
      </button>
    </div>
  );
}
