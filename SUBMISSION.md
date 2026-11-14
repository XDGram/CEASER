# Submission notes

Deadline: 14 Nov 2026, 23:59 UTC (00:59 Sunday, Nigerian time). Submit once at https://nearhackathon.com/#apply; later changes go through the site's request-changes page, never a second submission.

## Form fields

| Field | Value |
|---|---|
| Project name | CEASER |
| Tracks | Memecoins With Mechanics, Open Innovation |
| NEAR wallet (prize payout, mainnet) | ceasern1.near |
| Repository | https://github.com/XDGram/CEASER |
| Demo post | link to the X post below |
| Website | https://ceaser-nine.vercel.app |
| What did you build? | the paragraph below |

## X post draft

```
Memecoin dumps pay the diamond hands. Diamond hands who back NEAR get paid more.

Built CEASER at NEAR HACKATHON: lock your bag, and anyone who dumps early pays a penalty to the holders who stayed.

https://ceaser-nine.vercel.app
@NEARProtocol #NEARHackathon
```

Attach the 60-second screencast to the post: the rules require a video when judges can't run the demo themselves. Optional extra tags: @NearLegion @NearBuilders. The repo link goes in the form, not the post, to stay under 280 characters.

## "What did you build?" (form field, 20 to 2,000 characters)

```
CEASER is a commitment protocol on NEAR that stops holders fumbling their moonbags. Most memecoin holders sell scared at 2x and watch it do 50x. With CEASER you lock your bag behind an ROI ladder you choose while calm, for example 10% at 5x, 10% at 10x, 20% at 25x and 60% at 100x, and your scared future self cannot sell early. Every tranche also releases at a maximum duration you set, so principal is never trapped. Communities run Challenges: shared holding goals with sponsor reward pools. The signature mechanic: leaving a lock early costs a penalty that is paid into the Challenge pool, so dumpers pay the diamond hands who stayed. NEAR sits at the core: staked NEAR boosts your reward share up to 2x in the contract, every post costs 0.01 NEAR to the treasury with a verified fee transaction, and NEAR backing tiers gate who can post, launch campaigns, create communities and publish announcements, so memecoin activity becomes NEAR demand. Price unlocks resist manipulation with a TWAP, a two-read commit with cooldown, a liquidity floor and an immutable reference price. Shipped on testnet: a Rust vault contract with 18 sandbox tests (7 core flows, 11 adversarial tests from an audit pass); ./demo.sh runs the full arc on the live deployment with 49 assertions; and a web app with the moonbag lock flow, live ladder progress, an early-exit dialog that shows exactly who receives your penalty, Challenge pages with conviction leaderboards, Communities with milestones, treasury and cross-community rankings, member profiles, a NEAR-paid community feed, live activity pop-ups driven by real on-chain events, and one-click demo accounts so judges can try it without a wallet. Demo content is labelled; the oracle is a mock with real TWAP semantics.
```

## 60-second screencast shot list

Record at about 1366px wide in a desktop browser with your NEAR testnet wallet connected, against https://ceaser-nine.vercel.app. Leave activity pop-ups on; they appear bottom left.

| Time | On screen | Caption |
|---|---|---|
| 0 to 8s | Landing hero, LOCK. HOLD. GET PAID., then scroll to "You sold at 2x because you were scared." | You sold scared. It did 50x. |
| 8 to 20s | Lock tab: Protect a moonbag, pick the Moonbag preset (10% 5x, 10% 10x, 20% 25x, 60% 100x), point at the safety-release line, lock. The lock animation lands on the new card in My locks with its live ladder and % protected. | Lock it behind targets your future self can't override. |
| 20 to 32s | Communities tab: the leaderboard, then open Diamond Hands DAO: member avatars, milestones, pinned announcement, a pop-up arriving bottom left. | Communities hold together. |
| 32 to 42s | A Challenge page: lockers by conviction, paper hands list, sponsors, your estimated reward. | Earlier and bigger locks earn more. |
| 42 to 54s | My locks: Early exit. The dialog: "You get back X. You lose Y", who receives the penalty, the unlocks you cancel. Hold to confirm, or click Stay locked. | Dump early and you pay the people who stayed. |
| 54 to 60s | Back to the landing hero with the pitch line. | Diamond hands who back NEAR get paid more. |
