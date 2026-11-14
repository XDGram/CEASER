import { motion } from "framer-motion";
import { Select } from "./Select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fmtDur, fromUnits, short, timeAgo, txHash } from "../lib/near";
import {
  ANNOUNCE_BALANCE_YOCTO,
  createPost,
  isDemo,
  MIN_BALANCE_YOCTO,
  nearBalance,
  POST_FEE_YOCTO,
  POSTED_EVENT,
  savePendingPost,
  takePendingPost,
  toggleReaction,
  type ConvictionInfo,
  type FloorPost,
  type PostDraft,
  type PostKind,
} from "../lib/floor";
import { CONFIG } from "../config";
import { errorText, useWallet } from "../lib/wallet";
import { Pfp } from "./Pfp";
import { profilePath } from "../lib/profile";
import { Busy } from "./SectionHead";


// ---------- paid posting ----------

const FEE_NOTE = "Fee verified in the app; the feed database is open on this testnet demo.";
export const LOW_BALANCE = "Posting needs 1 Ⓝ in your account. NEAR is the cost of a voice here.";

const balanceCache = new Map<string, { at: number; p: Promise<bigint | null> }>();
/** Liquid NEAR of an account, cached for 20 seconds; null when unreadable. */
function readBalance(account: string, fresh = false): Promise<bigint | null> {
  const hit = balanceCache.get(account);
  if (!fresh && hit && Date.now() - hit.at < 20_000) return hit.p;
  const p = nearBalance(account).catch(() => null);
  balanceCache.set(account, { at: Date.now(), p });
  return p;
}

/** The connected account's NEAR balance, refreshed after each post. */
export function useNearBalance(account: string | null): bigint | null | undefined {
  const [bal, setBal] = useState<bigint | null | undefined>(undefined);
  useEffect(() => {
    if (!account) return setBal(undefined);
    let live = true;
    const load = (fresh: boolean) => readBalance(account, fresh).then((b) => live && setBal(b));
    load(false);
    const onPosted = () => load(true);
    window.addEventListener(POSTED_EVENT, onPosted);
    return () => {
      live = false;
      window.removeEventListener(POSTED_EVENT, onPosted);
    };
  }, [account]);
  return bal;
}

/**
 * Pays the 0.01 NEAR fee to the treasury, then publishes the post with that
 * transaction as its receipt. The draft is saved first so a browser wallet's
 * redirect can finish it on return (see WalletProvider).
 */
function usePaidPost() {
  const { transfer } = useWallet();
  return useCallback(
    async (draft: PostDraft) => {
      const bal = await readBalance(draft.author, true);
      if (bal !== null && bal < MIN_BALANCE_YOCTO) throw new Error(LOW_BALANCE);
      if (draft.kind === "announcement" && bal !== null && bal < ANNOUNCE_BALANCE_YOCTO) throw new Error("Announcements need 25 Ⓝ held in your account.");
      savePendingPost(draft);
      let hash: string | null;
      try {
        hash = txHash(await transfer(CONFIG.contracts.treasury, POST_FEE_YOCTO.toString()));
      } finally {
        takePendingPost();
      }
      if (!hash) throw new Error("The fee transfer returned no transaction id.");
      await createPost({ ...draft, fee_tx: hash });
      window.dispatchEvent(new Event(POSTED_EVENT));
    },
    [transfer],
  );
}

/** "paid 0.01 Ⓝ", linking to the fee transaction. */
export function FeeTag({ tx }: { tx: string }) {
  return (
    <a href={`${CONFIG.explorerUrl}/txns/${tx}`} target="_blank" rel="noopener" className="text-[10.5px] font-mono text-ink-3 hover:text-ink underline-offset-2 hover:underline" title="Verified posting fee transaction">
      paid 0.01 Ⓝ
    </a>
  );
}

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
  const cls = kind === "thesis" || kind === "announcement" ? "tag-live" : kind === "confession" ? "tag-bad" : kind === "pledge" ? "tag-ok" : "tag-muted";
  return <span className={`tag ${cls}`}>{kind}</span>;
}

/** Seeded demonstration content. Real posts carry no label. */
export function DemoTag() {
  return (
    <span className="pill !px-1.5 !py-0 !text-[9px] !tracking-[0.1em] !border-line text-ink-3" title="Seeded demonstration post">
      Demo
    </span>
  );
}

/** An announcement by a verified leader of its community. */
export function LeaderTag() {
  return (
    <span className="pill !px-1.5 !py-0 !text-[9px] !tracking-[0.1em] border-accent/50 text-accent-2" title="Community creator or campaign creator, checked in the app">
      Leader
    </span>
  );
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

export function PostCard({ post, names, conviction, onChanged, showChallengeLink = true, pinned = false }: { post: FloorPost; names: Record<string, string>; conviction?: ConvictionInfo; onChanged: () => void; showChallengeLink?: boolean; pinned?: boolean }) {
  const { accountId, toast } = useWallet();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const publish = usePaidPost();
  const sendReply = async () => {
    if (!accountId) return toast("Connect a wallet to reply", "err");
    setBusy(true);
    try {
      // Replies to announcements are ordinary replies, not announcements.
      await publish({ author: accountId, kind: post.kind === "announcement" || post.derived ? "update" : post.kind, body: reply, parent_id: post.id, challenge_id: post.challenge_id, community_id: post.community_id });
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
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={`card relative overflow-hidden p-4 sm:p-5 ${pinned ? "pt-5 sm:pt-6" : ""}`}>
      {pinned && (
        <>
          <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
          <div className="mb-3 text-[10.5px] font-mono uppercase tracking-[0.14em] text-accent-2">Pinned announcement</div>
        </>
      )}
      <div className="flex items-start gap-3">
        <Link to={profilePath(post.author)} className="shrink-0" title={post.author}>
          <Pfp id={post.author} size={34} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <AccountLine account={post.author} names={names} conviction={conviction} />
            <span className="flex items-center gap-2 shrink-0">
              {isDemo(post) && <DemoTag />}
              {post.kind === "announcement" && post.leader && <LeaderTag />}
              <KindTag kind={post.kind} />
              <span className="text-[11px] text-ink-3">{timeAgo(post.created_at)}</span>
              {post.fee_tx && <FeeTag tx={post.fee_tx} />}
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
                      {isDemo(r) && <DemoTag />}
                      {r.fee_tx && <FeeTag tx={r.fee_tx} />}
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
                <Busy on={busy}>Reply · 0.01 Ⓝ</Busy>
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}

const KIND_LABEL: Partial<Record<PostKind, string>> = { thesis: "Thesis", confession: "Confession", update: "Update", announcement: "Announcement" };

export function Composer({
  challengeId,
  challenges,
  onPosted,
  compact = false,
  communityId,
  kinds = ["thesis", "confession"],
  note,
}: {
  challengeId?: number;
  challenges?: { id: number; title: string }[];
  onPosted: () => void;
  compact?: boolean;
  /** Tags every post with this community. */
  communityId?: string;
  kinds?: PostKind[];
  note?: string;
}) {
  const { accountId, connect, toast } = useWallet();
  const [kind, setKind] = useState<PostKind>(kinds[0]);
  // A kind that is no longer offered (the viewer changed) falls back to the first.
  useEffect(() => {
    if (!kinds.includes(kind)) setKind(kinds[0]);
  }, [kinds, kind]);
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<string>(challengeId !== undefined ? String(challengeId) : "");
  const [busy, setBusy] = useState(false);

  const publish = usePaidPost();
  const balance = useNearBalance(accountId);
  const tooPoor = balance !== undefined && balance !== null && balance < MIN_BALANCE_YOCTO;
  const canAnnounce = balance === undefined || balance === null || balance >= ANNOUNCE_BALANCE_YOCTO;
  const post = async () => {
    if (!accountId) return connect();
    setBusy(true);
    try {
      await publish({ author: accountId, kind, body, challenge_id: target ? parseInt(target, 10) : null, community_id: communityId ?? null });
      setBody("");
      onPosted();
      toast("Posted · 0.01 NEAR fee paid", "ok");
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
            {kinds.map((k) => (
              <button
                key={k}
                disabled={k === "announcement" && !canAnnounce}
                title={k === "announcement" && !canAnnounce ? "Announcements need 25 Ⓝ held in your account" : undefined}
                className={`pill !normal-case !tracking-normal cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${kind === k ? "border-ink text-ink" : ""} ${k === "announcement" ? "!border-accent/50 text-accent-2" : ""}`}
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k] ?? k}
              </button>
            ))}
            {challengeId === undefined && challenges && (
              <Select compact value={target} onChange={setTarget} options={[{ value: "", label: "No Challenge" }, ...challenges.map((c) => ({ value: String(c.id), label: `#${c.id} · ${c.title}` }))]} />
            )}
          </div>
          <textarea
            className="input mt-3 min-h-[76px] text-[13.5px]"
            disabled={tooPoor}
            maxLength={600}
            placeholder={
              kind === "thesis"
                ? "Why this holds. Make the case."
                : kind === "confession"
                  ? "What you sold, when, and what it cost you."
                  : kind === "announcement"
                    ? "What the community needs to know."
                    : "Where things stand, and what comes next."
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-mono text-ink-3">{body.length}/600 · posts as {accountId ? short(accountId, 22) : "your wallet"}</span>
            <button className="btn btn-accent btn-sm" disabled={busy || tooPoor || (!!accountId && !body.trim()) || (kind === "announcement" && !canAnnounce)} onClick={post}>
              <Busy on={busy}>{accountId ? "Post · 0.01 Ⓝ" : "Connect to post"}</Busy>
            </button>
          </div>
          {tooPoor && <p className="mt-2 text-[12px] text-bad">{LOW_BALANCE}</p>}
          {!tooPoor && kinds.includes("announcement") && !canAnnounce && <p className="mt-2 text-[12px] text-ink-2">Announcements need 25 Ⓝ held in your account, besides being a community leader.</p>}
          <p className="mt-2 text-[11px] text-ink-3">{FEE_NOTE}</p>
          {note && <p className="mt-1 text-[11px] text-ink-3">{note}</p>}
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
    // A post published anywhere, including after a wallet redirect, refreshes open feeds.
    const onPosted = () => ref.current();
    window.addEventListener(POSTED_EVENT, onPosted);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(POSTED_EVENT, onPosted);
    };
  }, [ms]);
}

export function useFeedState() {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  return useMemo(() => ({ tick, bump }), [tick, bump]);
}
