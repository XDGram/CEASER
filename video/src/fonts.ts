import { continueRender, delayRender, staticFile } from "remotion";

// Variable font files bundled in public/fonts (the render browser has no internet).
export const inter = "InterLocal";
export const doto = "DotoLocal";
if (typeof document !== "undefined") {
  const h = delayRender("fonts");
  Promise.all([
    new FontFace(inter, `url(${staticFile("fonts/Inter.woff2")})`, { weight: "100 900" }).load(),
    new FontFace(doto, `url(${staticFile("fonts/Doto.woff2")})`, { weight: "100 900" }).load(),
  ]).then((fs) => { fs.forEach((x) => document.fonts.add(x)); continueRender(h); }).catch(() => continueRender(h));
}

export const C = {
  paper: "#f3f1ec",
  paper2: "#ebe8e1",
  surface: "#ffffff",
  ink: "#141414",
  ink2: "#6f6c66",
  ink3: "#a3a09a",
  line: "#dcd9d2",
  accent: "#e8622a",
  ok: "#2f7d4f",
  bad: "#b23b2a",
};
