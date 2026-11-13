import { motion } from "framer-motion";
import { Select } from "./Select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fmtDur, fromUnits, short, timeAgo } from "../lib/near";
import { createPost, toggleReaction, type ConvictionInfo, type FloorPost, type PostKind } from "../lib/floor";
import { errorText, useWallet } from "../lib/wallet";
import { Pfp } from "./Pfp";
import { profilePath } from "../lib/profile";
import { Busy } from "./SectionHead";

// Pixel glyphs for reactions, drawn in the page palette: a diamond for
// conviction, a wilting line for cope.
export function DiamondGlyph({ on }: { on: boolean }) {
  const c = on ? "var(--color-accent)" : "var(--color-ink-3)";
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden>
      {[
        [4, 1], [5, 1], [6, 1], [7, 1],
        [3, 2], [8, 2],
        [2, 3], [9, 3],
        [3, 4], [8, 4],
        [4, 5], [7, 5],
        [5, 6], [6, 6],
        [5, 7], [6, 7],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill={c} />
      ))}
    </svg>
  );
}

export function CopeGlyph({ on }: { on: boolean }) {
  const c = on ? "var(--color-bad)" : "var(--color-ink-3)";
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden>
      {[
        [2, 2], [3, 3], [4, 4], [5, 5], [6, 5], [7, 6], [8, 7], [9, 8],
        [8, 3], [9, 2],
        [2, 8], [3, 9],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill={c} />
      ))}
    </svg>
  );
}

export function KindTag({ kind }: { kind: PostKind }) {
  const cls = kind === "thesis" ? "tag-live" : kind === "confession" ? "tag-bad" : kind === "pledge" ? "tag-ok" : "tag-muted";
  return <span className={`tag ${cls}`}>{kind}</span>;
}

export function AccountLine({ account, names, conviction }: { account: string; names: Record<string, string>; conviction?: ConvictionInfo }) {
  return (
    <span className="flex items-center gap-2 min-w-0 flex-wrap">
      <Link to={profilePath(account)} className="text-[13px] font-medium text-ink truncate hover:underline underline-offset-4">
        {names[account] ?? short(account, 22)}
      </Link>
      {names[account] && <span className="font-mono text-[10.5px] text-ink-3 truncate hidden sm:inline">{short(account, 24)}</span>}
      {conviction && conviction.lockedNow > 0n && (
        <span className="pill border-ok/40 text-ok !normal-case !tracking-normal">
          {fromUnits(conviction.lockedNow, 18, 0)} locked · {fmtDur(conviction.longestSec)}
        </span>
      )}
    </span>
  );
}

function Reactions({ post, onChanged }: { post: FloorPost; onChanged: () => void }) {
  const { accountId, toast } = useWallet();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<{ my: "diamond" | "cope" | null; d: number; c: number }>({ my: post.myReaction, d: post.diamonds, c: post.copes });
  useEffect(() => setLocal({ my: post.myReaction, d: post.diamonds, c: post.copes }), [post.myReaction, post.diamonds, post.copes]);

  const react = async (kind: "diamond" | "cope") => {
    if (post.derived) return;
    if (!accountId) return toast("Connect a wallet to react", "err");
    if (busy) return;
    setBusy(true);
    const prev = local;
    const next = prev.my === kind ? null : kind;
    setLocal({
      my: next,
      d: prev.d + (next === "diamond" ? 1 : 0) - (prev.my === "diamond" ? 1 : 0),
      c: prev.c + (next === "cope" ? 1 : 0) - (prev.my === "cope" ? 1 : 0),
    });
    try {
      await toggleReaction(post.id, accountId, kind, prev.my);
      onChanged();
    } catch (e) {
      setLocal(prev);
      toast(errorText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  if (post.derived) return <span className="text-[10.5px] font-mono text-ink-3">on-chain receipt</span>;
  return (
    <span className="flex items-center gap-3">
      <button className={`flex items-center gap-1.5 text-[12px] ${local.my === "diamond" ? "text-accent-2" : "text-ink-3 hover:text-ink"}`} onClick={() => react("diamond")} title="Diamond hands">
        <DiamondGlyph on={local.my === "diamond"} />
        <span className="pixel text-[12px]">{local.d}</span>
      </button>
      <button className={`flex items-center gap-1.5 text-[12px] ${local.my === "cope" ? "text-bad" : "text-ink-3 hover:text-ink"}`} onClick={() => react("cope")} title="Cope">
        <CopeGlyph on={local.my === "cope"} />
        <span className="pixel text-[12px]">{local.c}</span>
      </button>
    </span>
  );
}

export function PostCard({ post, names, conviction, onChanged, showChallengeLink = true }: { post: FloorPost; names: Record<string, string>; conviction?: ConvictionInfo; onChanged: () => void; showChallengeLink?: boolean }) {
  const { accountId, toast } = useWallet();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const sendReply = async () => {
    if (!accountId) return toast("Connect a wallet to reply", "err");
    setBusy(true);
    try {
      await createPost({ author: accountId, kind: post.kind, body: reply, parent_id: post.id, challenge_id: post.challenge_id });
      setReply("");
      setReplying(false);
      onChanged();
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Link to={profilePath(post.author)} className="shrink-0" title={post.author}>
          <Pfp id={post.author} size={34} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <AccountLine account={post.author} names={names} conviction={conviction} />
            <span className="flex items-center gap-2 shrink-0">
              <KindTag kind={post.kind} />
              <span className="text-[11px] text-ink-3">{timeAgo(post.created_at)}</span>
            </span>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap break-words">{post.body}</p>
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <Reactions post={post} onChanged={onChanged} />
            {!post.derived && (
              <button className="text-[12px] text-ink-3 hover:text-ink" onClick={() => setReplying((v) => !v)}>
                {post.replies.length ? `${post.replies.length} repl${post.replies.length === 1 ? "y" : "ies"}` : "reply"}
              </button>
            )}
            {showChallengeLink && post.challenge_id !== null && (
              <Link to={`/app/challenges/${post.challenge_id}`} className="text-[11px] font-mono text-ink-3 hover:text-ink">
                Challenge #{post.challenge_id}
              </Link>
            )}
          </div>

          {post.replies.length > 0 && (
            <div className="mt-3 border-l border-line pl-4 flex flex-col gap-3">
              {post.replies.map((r) => (
                <div key={r.id} className="flex items-start gap-2.5">
                  <Link to={profilePath(r.author)} className="shrink-0" title={r.author}>
                    <Pfp id={r.author} size={24} />
                  </Link>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <Link to={profilePath(r.author)} className="text-[12.5px] font-medium text-ink hover:underline underline-offset-4">
                        {names[r.author] ?? short(r.author, 22)}
                      </Link>
                      <span className="text-[10.5px] text-ink-3">{timeAgo(r.created_at)}</span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-ink-2 whitespace-pre-wrap break-words">{r.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {replying && (
            <div className="mt-3 flex items-start gap-2">
              <textarea className="input min-h-[60px] text-[13px]" maxLength={600} placeholder="Say it to their face" value={reply} onChange={(e) => setReply(e.target.value)} />
              <button className="btn btn-primary btn-sm shrink-0" disabled={busy || !reply.trim()} onClick={sendReply}>
                <Busy on={busy}>Reply</Busy>
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}

export function Composer({ challengeId, challenges, onPosted, compact = false }: { challengeId?: number; challenges?: { id: number; title: string }[]; onPosted: () => void; compact?: boolean }) {
  const { accountId, connect, toast } = useWallet();
  const [kind, setKind] = useState<"thesis" | "confession">("thesis");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<string>(challengeId !== undefined ? String(challengeId) : "");
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!accountId) return connect();
    setBusy(true);
    try {
      await createPost({ author: accountId, kind, body, challenge_id: target ? parseInt(target, 10) : null });
      setBody("");
      onPosted();
      toast("Posted to the floor", "ok");
    } catch (e) {
      toast(errorText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start gap-3">
        {accountId && <Pfp id={accountId} size={34} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {(["thesis", "confession"] as const).map((k) => (
              <button key={k} className={`pill !normal-case !tracking-normal cursor-pointer ${kind === k ? "border-ink text-ink" : ""}`} onClick={() => setKind(k)}>
                {k === "thesis" ? "Thesis" : "Confession"}
              </button>
            ))}
            {challengeId === undefined && challenges && (
              <Select compact value={target} onChange={setTarget} options={[{ value: "", label: "No Challenge" }, ...challenges.map((c) => ({ value: String(c.id), label: `#${c.id} · ${c.title}` }))]} />
            )}
          </div>
          <textarea
            className="input mt-3 min-h-[76px] text-[13.5px]"
            maxLength={600}
            placeholder={kind === "thesis" ? "Why this holds. Make the case." : "What you sold, when, and what it cost you."}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-mono text-ink-3">{body.length}/600 · posts as {accountId ? short(accountId, 22) : "your wallet"}</span>
            <button className="btn btn-accent btn-sm" disabled={busy || (!!accountId && !body.trim())} onClick={post}>
              <Busy on={busy}>{accountId ? "Post" : "Connect to post"}</Busy>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useAutoRefresh(fn: () => void, ms = 30000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export function useFeedState() {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  return useMemo(() => ({ tick, bump }), [tick, bump]);
}
