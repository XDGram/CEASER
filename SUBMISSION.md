# Submission notes

## X post draft

```
Memecoin dumps pay the diamond hands. Diamond hands who back NEAR get paid more.

Built CEASER at NEAR HACKATHON: lock your bag, and anyone who dumps early pays a penalty to the holders who stayed.

https://ceaser-nine.vercel.app
@NEARProtocol #NEARHackathon
```

Attach the 60-second screencast to the post: the rules require a video when judges can't run the demo themselves. Optional extra tags: @NearLegion @NearBuilders. Put the repo link in the form, not the post, to stay under 280 characters.

## "What did you build?" (form field, 20 to 2,000 characters)

```
CEASER is a commitment protocol on NEAR that turns memecoin holding from a solo gamble into a coordinated game. Holders lock NEP-141 tokens behind strategies their future self cannot override: time locks, ROI ladders that unlock in tranches as an oracle TWAP crosses price targets, or the outcome of a community Challenge. A Challenge is a public goal (lock X tokens together before a deadline) with a sponsor reward pool. The signature mechanic: leaving a lock early costs a penalty, and that penalty is paid into the Challenge pool, so dumpers pay the diamond hands who stayed. Rewards are split by conviction (amount x time), and lockers with NEAR staked in a whitelisted pool get up to a 2x boost, turning memecoin activity into NEAR staking demand. Price unlocks are protected by a TWAP, a two-read commit with cooldown, a liquidity floor, minimum lock durations, an immutable reference price and a max-duration cap. Shipped on testnet: a Rust vault contract with 18 sandbox integration tests (7 core flows, 11 adversarial tests from an audit pass), a mock oracle, a test token and a mock staking pool; ./demo.sh runs the full arc against the live deployment with 49 assertions; and a web app with a landing page, lock flow, Challenge pages with conviction leaderboards, an early-exit dialog, and The Floor, a community feed of theses, confessions and on-chain receipts. The oracle is a mock with real TWAP semantics; a Ref Finance integration is on the roadmap.
```


Replace the two bracketed placeholders with the required hackathon tags before
posting. The draft is under 280 characters with the placeholders in place, and
the real tags are shorter than the placeholders.

## 60-second screencast shot list

Record at 1366px wide in a desktop browser with a NEAR testnet wallet already
connected, against https://ceaser-nine.vercel.app. One line per shot: what is
on screen, then the on-screen caption.

| Time | On screen | Caption |
|---|---|---|
| 0 to 12s | Landing hero with the pitch line, then a slow scroll through the demo-arc story: A locks, B locks with staked NEAR, A dumps, the penalty lands in the Challenge, B claims principal plus a boosted reward. | Memecoin dumps pay the diamond hands. |
| 12 to 18s | Click Launch app, the wallet connects, the Overview loads: CSTEST balance, locked total, NEAR boost tier, claimable locks, your Challenges. | Your bag, your boost tier, your Challenges. |
| 18 to 30s | Lock tab. Pick the ROI ladder 50/25/25 at +50/+100/+200%, choose a Challenge, type a pledge note, submit. The animated lock flow runs (waiting for wallet, confirming on NEAR, locked) and jumps to the new lock in My locks. | Lock behind price, time or a Challenge. Say why. |
| 30 to 40s | Open a Challenge detail page. Scroll the lockers leaderboard ordered by conviction, the paper hands list, the sponsors, and the estimated reward for your lock, then the Floor feed for this Challenge. | Earlier and bigger locks earn more. Everyone can see who held. |
| 40 to 52s | My locks. Click Exit early on a lock. The dialog shows the breakdown: what is paid out now, the penalty, and that the penalty goes to the lockers who stay. Press and hold the confirm button until it completes. | Leave early and you pay the people who stayed. |
| 52 to 60s | The Floor. Scroll confessions, theses and pledges with pixel avatars and conviction badges, ending on an exit receipt. Cut to the pitch line. | Diamond hands who back NEAR get paid more. |
