// Renders real tweets as uniform cards in the reference style:
// black background, avatar, name, blue check, handle, "X.com" top right, text only.
// Text, name, avatar and verified status come from X's public syndication endpoint.
// Usage: node tweet-cards.cjs <outDir> <tweetUrl> [<tweetUrl> ...]
const { chromium } = require('playwright');

const token = (id) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function fetchTweet(url) {
  const id = url.match(/status\/(\d+)/)[1];
  const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token(id)}`);
  if (!r.ok) throw new Error('syndication ' + r.status);
  const t = await r.json();
  if (!t.text) throw new Error('no text (deleted or protected)');
  // Drop trailing media links; keep the words exactly as written.
  const text = t.text.replace(/\s*https:\/\/t\.co\/\w+\s*$/g, '').trim();
  return {
    id,
    text,
    name: t.user.name,
    handle: t.user.screen_name,
    avatar: t.user.profile_image_url_https.replace('_normal', '_400x400'),
    verified: !!(t.user.is_blue_verified || t.user.verified),
  };
}

const CHECK = `<svg viewBox="0 0 22 22" width="26" height="26"><path fill="#1d9bf0" d="M20.4 11c0-1.3-.8-2.4-1.9-3 .3-1.2 0-2.5-.9-3.4-.9-.9-2.2-1.2-3.4-.9-.6-1.1-1.7-1.9-3-1.9s-2.4.8-3 1.9c-1.2-.3-2.5 0-3.4.9-.9.9-1.2 2.2-.9 3.4-1.1.6-1.9 1.7-1.9 3s.8 2.4 1.9 3c-.3 1.2 0 2.5.9 3.4.9.9 2.2 1.2 3.4.9.6 1.1 1.7 1.9 3 1.9s2.4-.8 3-1.9c1.2.3 2.5 0 3.4-.9.9-.9 1.2-2.2.9-3.4 1.1-.6 1.9-1.7 1.9-3z"/><path fill="#fff" d="M9.6 15.3l-3.5-3.5 1.4-1.4 2.1 2.1 4.8-4.8 1.4 1.4z"/></svg>`;

function html(t) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  html,body{margin:0;background:#000}
  #card{width:1400px;min-height:420px;padding:56px 64px 64px;box-sizing:border-box;background:#000;color:#e7e9ea;font-family:-apple-system,'Segoe UI',Inter,Roboto,sans-serif}
  .top{display:flex;align-items:center;justify-content:space-between}
  .who{display:flex;align-items:center;gap:26px}
  .av{width:128px;height:128px;border-radius:50%;object-fit:cover;background:#222}
  .name{display:flex;align-items:center;gap:10px;font-size:40px;font-weight:700;color:#e7e9ea}
  .handle{font-size:36px;color:#71767b;margin-top:4px}
  .brand{font-size:64px;font-weight:600;color:#e7e9ea;letter-spacing:-0.01em}
  .brand b{font-weight:700}
  .text{margin-top:52px;font-size:44px;line-height:1.38;white-space:pre-wrap;word-wrap:break-word}
  </style></head><body><div id="card">
    <div class="top"><div class="who"><img class="av" src="${t.avatar}"><div>
      <div class="name">${esc(t.name)}${t.verified ? CHECK : ''}</div>
      <div class="handle">@${esc(t.handle)}</div></div></div>
      <div class="brand"><b>𝕏</b>.com</div></div>
    <div class="text">${esc(t.text)}</div>
  </div></body></html>`;
}

(async () => {
  const [out, ...urls] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 400 }, deviceScaleFactor: 1 });
  const rows = [];
  let n = 0;
  for (const url of urls) {
    try {
      const t = await fetchTweet(url);
      n++;
      await p.setContent(html(t), { waitUntil: 'networkidle' });
      await p.locator('#card').screenshot({ path: `${out}/x-${String(n).padStart(2, '0')}-${t.handle}.png` });
      rows.push(`${String(n).padStart(2, '0')} @${t.handle} ${t.verified ? '(verified)' : '(NOT verified)'} ${t.text.length} chars: ${t.text.replace(/\n/g, ' / ')}`);
    } catch (e) {
      rows.push(`SKIP ${url}: ${e.message}`);
    }
  }
  console.log(rows.join('\n'));
  await b.close();
})();
