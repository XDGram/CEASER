# CEASER demo video: working brief

Saved so this direction survives across sessions.

## Role
Act as a senior motion-graphics designer: years of product intro and launch videos.
The video must feel cinematic, fast and emotional, not like a screen recording.

## Direction (from the user)
- Format: a motion video, not a plain walkthrough. Required by the hackathon: attach it to the X post.
- Opening: a fast, emotional montage of real tweets from crypto / memecoin traders regretting
  selling too early ("I should have held", "fumbled", "missed $X"). Real profiles visible.
  Cards fly in quickly, stacked, cut on the beat. This is the product intro hook.
- Then the product: CEASER as the answer (lock your moonbag, dumpers pay the diamond hands,
  communities hold together, built on and powered by NEAR).
- Needs a script with voiceover narration first. Not written yet; next step.
- Keep the site's visual identity: warm paper #f3f1ec, ink #141414, orange #e8622a accent,
  Doto dot-matrix display type, Inter for text.

## Tooling status (checked 14 Nov 2026)
- uiverse.io: blocked from this environment (403 through the proxy). Elements must be pasted in by hand if wanted.
- Remotion 4 installed in `video/` (separate from the app). ffmpeg is installed.
- X: tweet pages load and the official embed (publish.twitter.com oEmbed + widgets.js) renders
  real tweets, which is how the screenshots below were made.

## Intro tweet cards
Style (from the user's references): SHORT one-line regret tweets ("I should have held longer",
"roundtripped", "sold too early"), from verified, mid-size crypto accounts, not huge ones.
Card: black background, avatar, name, blue check, handle, "X.com" top right, text only, no stats,
all the same size (1400 wide, min 420 tall). Target about 15.

Renderer: `video/tools/tweet-cards.cjs` pulls text, name, avatar and verified status from X's
public syndication endpoint and renders the card. Run it with the tweet links:
`node video/tools/tweet-cards.cjs <outDir> <link> <link> ...` (from a folder with playwright).

### Chosen intro tweets (user-supplied screenshots, docs/video/tweets/)
All 1179px wide, X dark style; heights differ, so the montage places each on a fixed 16:9 frame.
Two moods: regret (the problem) and "hold your bags" (the mantra CEASER enforces).

| File | Account | Text | Mood |
|---|---|---|---|
| 01-mztacat.jpg | @mztacat (verified) | "You think your bags will disappear when u sell the top? someone's gonna hold the bag for you bro.. Just don't be the last!" | warning |
| 02-ToolySOL.jpg | @ToolySOL (verified) | "I should have held longer" | regret |
| 03-0xSweep.jpg | @0xSweep (verified) | "I should have held instead of panic selling" | regret |
| 04-reply-holding-on.jpg | reply, no header visible | "In the end holding on was always better than selling for a lose" | regret, lesson |
| 05-DonWedge.jpg | @DonWedge (verified) | "Hold your bags like you hold grudges with passion" | mantra |
| 06-shahh.jpg | @shahh (verified) | "Hold your bags / We will bounce soon" | mantra |
| 07-lynk0x.jpg | @lynk0x (verified) | "Hold your bags" | mantra |
| 08-ramonos.jpg | @ramonos (verified) | "great things takes time / hold your bags" | mantra |
| 09-nyhrox.png | @nyhrox (verified) | "i just roundtripped 25k because of this tweet" (rendered by tweet-cards.cjs) | regret |

Note: 04 is a cropped reply with no name or avatar; use it as a text-only beat or find its source link.

Note: these are public posts by real people. Using them as quoted, unaltered screenshots in a
hackathon demo is normal practice; do not edit their text, and credit "Posts from X" on screen.
