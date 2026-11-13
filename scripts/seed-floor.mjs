#!/usr/bin/env node
// Seeds The Floor (Supabase) with posts, replies, reactions and display names
// from the accounts that hold the seeded locks on the testnet vault.
// Uses only the public anon key. Run once: node scripts/seed-floor.mjs

const URL = "https://ncbrsrklofofdqdftwjw.supabase.co";
const KEY = "sb_publishable_O3ev7dyTwadU-uAlsB-2Mw_3Y6SFuV7";
const VAULT = "ceaser-vault-756e8a.testnet";
const RPC = "https://test.rpc.fastnear.com";

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path, opts = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers ?? {}) } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function view(method, args) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "query", params: { request_type: "call_function", account_id: VAULT, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"), finality: "optimistic" } }),
  });
  const j = await res.json();
  if (j.error || j.result.error) throw new Error(JSON.stringify(j.error ?? j.result.error));
  return JSON.parse(Buffer.from(j.result.result).toString());
}

// ---- find the seeded accounts on the vault ----
const count = await view("get_lock_count", {});
const locks = [];
for (let id = 1; id <= count; id++) {
  const l = await view("get_lock", { lock_id: id });
  if (l) locks.push(l);
}
const pick = (word) => {
  const owners = locks.map((l) => l.owner).filter((o) => o.includes(`-${word}-`));
  // Prefer the newest seed run (highest lock id owns the tail of the list).
  return owners.length ? owners[owners.length - 1] : null;
};
const whale = pick("whale");
const frog = pick("frog");
const chad = pick("chad");
const degen = pick("degen");
const hodler = pick("hodler");
if (!whale || !frog || !chad || !degen || !hodler) throw new Error("seeded accounts not found on the vault");
// The sponsor account never locks, so its id is the lockers' run suffix applied to "sponsor".
const sponsor = whale.replace("-whale-", "-sponsor-");
console.log({ whale, frog, chad, degen, hodler, sponsor });

const degenExits = locks.filter((l) => l.owner === degen && l.status === "exited");
const chadLadder = locks.find((l) => l.owner === chad && !l.challenge_id);

// Challenge ids on the live vault: 4 diamond hands season, 5 no paper hands,
// 6 founder allocation, 7 hold through the dip.
const C_SEASON = 4, C_LISTING = 5, C_FOUNDER = 6, C_DIP = 7;

const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();

// ---- profiles ----
await rest("profiles", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify([
    { account: whale, display_name: "whalewatch" },
    { account: frog, display_name: "frogmaxi" },
    { account: chad, display_name: "chad.near" },
    { account: degen, display_name: "degen_szn" },
    { account: hodler, display_name: "hodlvan" },
    { account: sponsor, display_name: "treasury_tim" },
  ]),
});
console.log("profiles upserted");

// ---- posts: [author, kind, hoursAgo, body, challenge_id?, lock_id?, replies?, reactions?] ----
// reactions: [[account, "diamond"|"cope"], ...]; replies: [author, hoursAgo, body][]
const D = "diamond", X = "cope";
const posts = [
  [whale, "thesis", 118, "The ladder is the only honest way to take profit. 50% out at 1.5x pays the bills, the back half rides to 3x where the real money was every single cycle. Selling the whole bag at the first green candle is how you end up posting confessions here.", null, null,
    [[frog, 116, "based and ladder-pilled"], [degen, 114, "3x targets in this market is hopium, the mid rung never fills"], [whale, 112, "it filled in the sandbox tests and it will fill here. conviction is a muscle"]],
    [[frog, D], [chad, D], [hodler, D], [degen, X]]],
  [degen, "confession", 110, "sold at 3x for a laptop, it did 400x. the laptop died in 2 years. the bag would have paid for the apartment i now rent. every time i open the chart i see the ghost of that sell button.", null, null,
    [[chad, 108, "the laptop confession gets me every time. pour one out"], [hodler, 106, "this is why the penalty exists. you needed a 20% reason to close the tab"]],
    [[whale, D], [frog, D], [chad, D], [hodler, D]]],
  [hodler, "thesis", 104, "Locks do not make the token go up. They make you stop making it go down. The protocol is a seatbelt, not an engine, and anyone selling it as an engine is lying to you. I lock because my worst trades were all made at 2am in a drawdown.", null, null,
    [[whale, 102, "seatbelt not engine is the cleanest pitch this protocol has"], [degen, 100, "2am me is a different person with my keys, can confirm"]],
    [[whale, D], [frog, D], [chad, D], [degen, D]]],
  [frog, "thesis", 96, `Why I am in "No paper hands until the listing": the listing either happens inside 12 days or it does not. If it does, the pool pays everyone who sat still. If it does not, I get my principal back and the sponsors eat the loss. That is a free option on other people's panic.`, C_LISTING, null,
    [[hodler, 94, "free option on other people's panic belongs on the landing page"], [chad, 92, "sponsors are not eating a loss, refunds on failure. read the spec anon"], [frog, 90, "the loss is opportunity cost, treasury money sat frozen for 12 days. still counts"]],
    [[whale, D], [hodler, D], [degen, D]]],
  [chad, "confession", 88, "i have early exited exactly once in my life, in 2022, eight days before the pump that retired two people in my group chat. the penalty here would have been 20%. the pump was 11x. do the math on which one hurts.", null, null,
    [[degen, 86, "eight days. brutal"], [whale, 84, "11x minus the 20% you kept paying in regret"]],
    [[whale, D], [frog, D], [hodler, D]]],
  [sponsor, "thesis", 80, "Sponsoring the season pool because a floor of locked supply is cheaper than any marketing spend. 150k in the pool bought two million tokens of sell pressure taken off the book for a week. CPMs wish they converted like this.", C_SEASON, null,
    [[whale, 78, "the treasury finally discovers mechanism design"], [frog, 76, "tim the intern cooked with this one"]],
    [[whale, D], [frog, D], [chad, D], [hodler, D], [degen, D]]],
  [degen, "confession", 72, "joined the season challenge, lasted 36 hours, paid 40k in penalties across two exits. my penalties are now literally the yield the diamond hands are farming. i am the pool. it is me.", C_SEASON, degenExits[0]?.id ?? null,
    [[frog, 70, "thank you for your service, the pool remembers"], [hodler, 68, "the bridge working exactly as designed"], [chad, 66, "dumpers pay diamond hands is not a slogan it is an invoice"]],
    [[whale, D], [frog, D], [chad, D], [hodler, D]]],
  [whale, "thesis", 64, "Founder allocation locked in public, 31 days, receipts on chain. If you are building and your own bag is liquid, you are not building, you are exiting slowly. Watch the lock, not the roadmap.", C_FOUNDER, null,
    [[hodler, 62, "this should be a listing requirement anywhere serious"]],
    [[frog, D], [chad, D], [hodler, D], [sponsor, D]]],
  [frog, "confession", 58, "once set a price alert at my exact break even so i could finally sell at zero loss. it wicked to 2 cents under, reversed, and did a 40x. break even is a cursed number, it only exists in your head.", null, null,
    [[degen, 56, "the market can smell your entry price"], [whale, 54, "anchoring is the tax everyone pays once"]],
    [[whale, D], [chad, D], [degen, D], [hodler, D]]],
  [hodler, "thesis", 50, "Ran the numbers on the dip challenge: threshold 250k, 200k already in, 3 days left. One mid locker closes it. The pool is small but the min lock is only an hour, so the floor is basically free to defend. This one should not fail.", C_DIP, null,
    [[chad, 48, "i am 140k of that 200k. come join before i start charging rent"], [frog, 46, "60k reporting in, we ride at dawn"]],
    [[whale, D], [frog, D], [chad, D]]],
  [chad, "thesis", 44, "The two read commit is the most underrated part of the vault. You cannot flash pump a tranche open, you have to hold the price through the TWAP window AND a cooldown. It prices manipulation out and patience in. More protocols should make time the scarce asset.", null, chadLadder?.id ?? null,
    [[whale, 42, "time as the scarce asset. stealing this"]],
    [[whale, D], [hodler, D], [frog, D]]],
  [degen, "thesis", 38, "contrarian take: the cope button is the real alpha on this feed. count the copes on a thesis, that is your exit liquidity forming in real time.", null, null,
    [[frog, 36, "using sentiment as an indicator on a feed of six people is peak degen"], [degen, 34, "six people with 2.8 million locked. weighted sentiment"]],
    [[chad, D], [whale, X], [hodler, X]]],
  [sponsor, "confession", 30, "treasury confession: we almost put the sponsor budget into a CEX listing instead. the quote was 180k for a tier 2 venue and a month of wash volume. the pool was cheaper and the volume here is real. still feel like i should apologize to someone.", C_SEASON, null,
    [[whale, 28, "apology accepted, send the rest of the budget to challenge 7"]],
    [[whale, D], [frog, D], [chad, D], [hodler, D]]],
  [frog, "thesis", 24, "listing challenge is at 59%. twelve days, 410k to go. every lock added now earns more conviction weight than the same lock tomorrow, time in counts. early is the whole trade.", C_LISTING, null,
    [[hodler, 22, "conviction is amount times seconds, the compounding is in the clock"]],
    [[whale, D], [hodler, D], [sponsor, D]]],
  [hodler, "confession", 18, "i check the vault views more often than my actual bank account. get_claimable at breakfast, get_challenge at lunch. this protocol has not fixed my habits, it has just given them an API.", null, null,
    [[frog, 16, "an API for the affliction"], [chad, 14, "same but it is healthier than checking the chart"]],
    [[whale, D], [frog, D], [chad, D], [degen, D]]],
  [whale, "confession", 12, "in 2021 i moved a nine figure bag to a hardware wallet to stop myself trading it. then i bought a second hardware wallet to trade with. the vault is the first thing that has actually worked, because the penalty is real and public.", null, null,
    [[degen, 10, "the second wallet is the most relatable thing a whale has ever said"]],
    [[frog, D], [chad, D], [hodler, D], [degen, D]]],
  [chad, "thesis", 8, "Dip challenge closes in under 3 days and sits at 80%. If it fails on a 50k gap with a 25k pool refunded to sponsors, this community deserves the chart it gets. Lock the gap.", C_DIP, null,
    [[frog, 6, "the gap is one whale sneeze. whalewatch do your thing"], [whale, 4, "already in challenge 6 with 500k. someone else can carry a bag for once"]],
    [[hodler, D], [frog, D], [sponsor, D]]],
  [degen, "thesis", 3, "day 2 of not exiting anything. the trick is i put the penalty math on a sticky note on my monitor. 20% of 120k is a used car. i do not need a third used car.", null, null,
    [[hodler, 2, "whatever works. the sticky note is load bearing now"]],
    [[whale, D], [frog, D], [chad, D], [hodler, D], [sponsor, D]]],
];

let topCount = 0, replyCount = 0, reactionCount = 0;
for (const [author, kind, h, body, challenge_id, lock_id, replies = [], reactions = []] of posts) {
  const [row] = await rest("posts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ author, kind, body, challenge_id: challenge_id ?? null, lock_id: lock_id ?? null, created_at: hoursAgo(h) }),
  });
  topCount++;
  for (const [ra, rh, rb] of replies) {
    await rest("posts", { method: "POST", body: JSON.stringify({ author: ra, kind, body: rb, parent_id: row.id, challenge_id: challenge_id ?? null, created_at: hoursAgo(rh) }) });
    replyCount++;
  }
  for (const [acct, rkind] of reactions) {
    await rest("reactions", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ post_id: row.id, account: acct, kind: rkind }) });
    reactionCount++;
  }
  process.stdout.write(".");
}
console.log(`\nseeded ${topCount} posts, ${replyCount} replies, ${reactionCount} reactions`);
