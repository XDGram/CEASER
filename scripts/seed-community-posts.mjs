#!/usr/bin/env node
// Seeds community conversation on the Floor: announcements, theses, updates,
// confessions, replies and reactions for the three seeded communities.
// Every post carries meta.demo = true so the app labels it "Demo". The copy
// is opinion and discussion only: nothing here claims an on-chain action.
// Uses the public anon key from frontend/src/config.ts. Run once:
//   node scripts/seed-community-posts.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cfg = readFileSync(fileURLToPath(new URL("../frontend/src/config.ts", import.meta.url)), "utf8");
const URL_ = cfg.match(/supabaseUrl:\s*"([^"]+)"/)[1];
const KEY = cfg.match(/supabaseAnonKey:\s*"([^"]+)"/)[1];
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path, opts = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const S = "7e8558";
const whale = `ceaser-whale-${S}.testnet`;
const frog = `ceaser-frog-${S}.testnet`;
const chad = `ceaser-chad-${S}.testnet`;
const degen = `ceaser-degen-${S}.testnet`;
const hodler = `ceaser-hodler-${S}.testnet`;
const sponsor = `ceaser-sponsor-${S}.testnet`;

// Refuse to run twice: the seed is meant to be applied once.
const existing = await rest(`posts?select=id&community_id=not.is.null&meta->>demo=eq.true&limit=1`);
if (existing.length) {
  console.log("community demo posts already exist; nothing to do");
  process.exit(0);
}

const minsAgo = (m) => new Date(Date.now() - m * 60e3).toISOString();
const D = "diamond", X = "cope";

// [community, author, kind, minutesAgo, body, challenge_id|null, replies[[author, minutesAgo, body]], reactions[[account, kind]]]
const posts = [
  // ---------------- diamond-hands (leader: chad) ----------------
  ["diamond-hands", chad, "announcement", 4200,
    "Welcome to Diamond Hands DAO. Two campaigns are live: the season Challenge and Hold through the dip. Committed is past the 2.5M milestone; 5M is next. Lock into either campaign and you count toward it. Penalties from anyone who leaves early go to the people who stay.", null,
    [[hodler, 4150, "Good summary. Pinning this in my head too."], [degen, 4100, "5M is a stretch. Not saying no, saying it is a stretch."]],
    [[hodler, D], [whale, D], [frog, D], [degen, D]]],
  ["diamond-hands", chad, "announcement", 900,
    "House rules for the season: no begging people not to exit, no shaming people who do. The penalty does the talking. Post your thesis, post your fumbles, and keep it about holding.", null,
    [[whale, 860, "Best rule set I have seen in a holder chat."]],
    [[whale, D], [hodler, D], [sponsor, D]]],
  ["diamond-hands", hodler, "thesis", 3900,
    "The season Challenge is the cleanest bet in this market. It is past its threshold, and if it stays there to the deadline the sponsor pool pays out by conviction. If it slips, principal comes back anyway and penalties still go to whoever stayed. Downside is time, not money.", 4,
    [[degen, 3850, "Downside is also every pump you sit through without selling."], [hodler, 3820, "That is the point of the lock. The pump is not the plan."], [chad, 3800, "Time as the only cost is the whole pitch. Well put."]],
    [[chad, D], [whale, D], [frog, D], [degen, X]]],
  ["diamond-hands", whale, "update", 2600,
    "Where we stand: committed is past the 2.5M milestone, 5M is next. The season Challenge deadline is close, so staying matters more this week than joining. If you were going to join, join early, conviction weights time to the deadline.", 4,
    [[frog, 2560, "Early beats big here. People keep missing that."]],
    [[chad, D], [hodler, D], [sponsor, D]]],
  ["diamond-hands", degen, "confession", 1800,
    "Confession: I watched the dip campaign open, told myself I would join after one more green day, and the green day never came. Still on the sidelines. Nobody else make my mistake.", 7,
    [[hodler, 1760, "The min lock on that one is only an hour. There is no good reason to wait."], [chad, 1740, "Respect for posting it. Half this chat has the same story and will not say it."]],
    [[chad, D], [hodler, D], [whale, D], [frog, D]]],
  ["diamond-hands", sponsor, "thesis", 1200,
    "Treasury view: a sponsor pool that only pays if the community hits its number is the most accountable marketing spend we have. If the season fails, the sponsors get it back. If it succeeds, it went to the people who held. Hard to argue with either outcome.", 4,
    [[degen, 1150, "Accountable marketing is a phrase I did not expect to read today."]],
    [[chad, D], [whale, D], [hodler, D]]],
  ["diamond-hands", frog, "update", 300,
    "Hold through the dip is already past its threshold with days to spare. Feels like the one this community wins first, as long as nobody bails before the deadline.", 7,
    [[degen, 260, "Famous last words. But yes."], [hodler, 240, "Watching it daily. The gap is small."]],
    [[chad, D], [hodler, D], [whale, D]]],
  ["diamond-hands", hodler, "thesis", 45,
    "Reading the ladder wrong is the most common mistake I see. The first rung is your exit plan, not your top. Set it where you would be happy taking profit, and let the last rung be the moonbag you never touch.", null,
    [[chad, 30, "Saving this for every new member."]],
    [[chad, D], [whale, D], [frog, D], [sponsor, D]]],

  // ---------------- listing-army (leader: frog) ----------------
  ["listing-army", frog, "announcement", 4000,
    "Listing Army has one job: do not dump into the first listing pump. One campaign, No paper hands until the listing. Threshold is 1M CSTEST. Sponsors are backing the holders, and every early exit pays the rest of us.", null,
    [[hodler, 3950, "Simple and clear. In."], [degen, 3920, "One job. I can do one job. Probably."]],
    [[hodler, D], [whale, D], [chad, D]]],
  ["listing-army", frog, "announcement", 600,
    "Check-in: the campaign is past its 1M threshold and every milestone this community set is reached. The job now is not leaving before the deadline. If you are holding outside the campaign, consider moving that conviction somewhere it counts.", null,
    [[hodler, 560, "Clean update, thanks frog."]],
    [[hodler, D], [degen, D], [sponsor, D]]],
  ["listing-army", hodler, "thesis", 3600,
    "Listings are where holders get wrecked. Everyone sells into the first candle, the chart prints a top in an hour, and the people who sold call it smart. Holding through it is not about the listing. It is about not being exit liquidity for each other.", 5,
    [[degen, 3550, "Counterpoint: some of us need the money."], [hodler, 3520, "Then do not lock what you need. Lock what you would otherwise panic-sell."], [frog, 3500, "This exchange should be on the landing page."]],
    [[frog, D], [whale, D], [chad, D], [degen, X]]],
  ["listing-army", degen, "confession", 2500,
    "Last cycle I sold my whole bag the hour a token listed. It doubled twice over the next month. The worst part is I had written down that I would hold. A note on my desk is not a lock.", null,
    [[frog, 2460, "That is exactly why this campaign exists."], [whale, 2440, "A note is a promise to yourself. The vault is a promise to everyone else."]],
    [[frog, D], [hodler, D], [chad, D], [whale, D]]],
  ["listing-army", whale, "update", 1500,
    "Sponsor pool for the listing campaign is 160K CSTEST, and early-exit penalties have added to it. Pro-rata by conviction means the people who joined early get the larger share.", 5,
    [[degen, 1460, "So the pool rewards patience twice. Time held and time to deadline."]],
    [[frog, D], [hodler, D]]],
  ["listing-army", hodler, "update", 700,
    "Reminder that committing early counts more than committing big. Conviction is amount times time to the deadline, so the same amount locked today outweighs it locked next week.", 5,
    [[frog, 650, "Every week someone learns this the hard way."]],
    [[frog, D], [whale, D], [degen, D]]],
  ["listing-army", degen, "thesis", 120,
    "Contrarian take: even if the listing campaign slipped back under its threshold, it would still be fine for holders. Principal comes back, penalties still pay whoever stayed. The only people who lose on a miss are the sponsors, and they signed up for that.", 5,
    [[frog, 90, "Technically true. Still want to hit it."], [sponsor, 70, "Can confirm the sponsors signed up for that. Would still prefer the win."]],
    [[hodler, D], [whale, D], [frog, X]]],

  // ---------------- founders-circle (leader: whale) ----------------
  ["founders-circle", whale, "announcement", 4300,
    "Founders Circle is for teams who lock their own allocation in public. The point is simple: holders should be able to check that the people building cannot dump on them. Our first campaign is Founder allocation, locked in public.", null,
    [[frog, 4250, "More teams should be here. This is the trust signal that actually means something."]],
    [[frog, D], [chad, D], [hodler, D], [sponsor, D]]],
  ["founders-circle", whale, "announcement", 1100,
    "Committed across founder campaigns has passed every milestone the circle set, 1M included. If you run a project and want to start a campaign for your own allocation, the Start a campaign button on this page sets it up for the circle.", null,
    [[chad, 1050, "Going to point a few founders here."]],
    [[chad, D], [frog, D], [hodler, D]]],
  ["founders-circle", chad, "thesis", 3700,
    "A founder lock with a long safety release says more than any roadmap. If the team is still locked when the roadmap slips, they feel it with everyone else.", 6,
    [[whale, 3650, "That is exactly the incentive I wanted to make visible."], [degen, 3620, "And if the token moons, they wait like everyone else. Fair."]],
    [[whale, D], [frog, D], [hodler, D]]],
  ["founders-circle", hodler, "update", 2200,
    "The founder campaign is at double its 500K threshold, with a deadline still weeks out. Nothing to finalize until then, but it is already the healthiest number in the circle.", 6,
    [[whale, 2150, "Appreciate people watching it."]],
    [[whale, D], [chad, D], [frog, D]]],
  ["founders-circle", degen, "confession", 1600,
    "I used to treat founder unlocks as the signal to sell first and ask questions later. Got front-run by the team twice. A public lock is the first thing that has made me relax about a founder bag.", null,
    [[whale, 1550, "That is the whole reason this circle exists. Thank you for saying it."]],
    [[whale, D], [chad, D], [hodler, D], [frog, D]]],
  ["founders-circle", frog, "thesis", 400,
    "If you are a holder, the question is not whether the founders believe. It is whether they can sell. A public lock answers the second question, which is the only one that matters.", 6,
    [[whale, 360, "Believing is free. Locking costs something."]],
    [[whale, D], [hodler, D], [chad, D]]],
  ["founders-circle", sponsor, "update", 20,
    "Treasury side note: founder campaigns have no sponsor pool yet. If one gets funded, sponsors only keep it on a miss, so it is a clean way to back a founder who commits in public.", 6,
    [[whale, 12, "Would welcome that."]],
    [[whale, D], [frog, D]]],
];

let tops = 0, replies = 0, reactions = 0;
for (const [community_id, author, kind, m, body, challenge_id, rs, rx] of posts) {
  const [row] = await rest("posts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ author, kind, body, community_id, challenge_id, created_at: minsAgo(m), meta: { demo: true } }),
  });
  tops++;
  for (const [ra, rm, rb] of rs) {
    // Replies to an announcement are plain updates; to anything else they keep the parent's kind.
    await rest("posts", {
      method: "POST",
      body: JSON.stringify({ author: ra, kind: kind === "announcement" ? "update" : kind, body: rb, parent_id: row.id, community_id, challenge_id, created_at: minsAgo(rm), meta: { demo: true } }),
    });
    replies++;
  }
  for (const [account, rk] of rx) {
    await rest("reactions", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ post_id: row.id, account, kind: rk }) });
    reactions++;
  }
  process.stdout.write(".");
}
console.log(`\nseeded ${tops} posts, ${replies} replies, ${reactions} reactions across 3 communities`);
