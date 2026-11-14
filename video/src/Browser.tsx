import React from "react";
import { Img, staticFile } from "remotion";
import { C, inter } from "./fonts";

export const WIN = { x: 240, y: 67, w: 1440, h: 900, chrome: 46 };

/** A browser window showing a full-page capture scrolled to `scrollY` (CSS px). Children are drawn in page coordinates. */
export function Browser({ url, src, src2, mix = 0, scrollY = 0, children }: { url: string; src: string; src2?: string; mix?: number; scrollY?: number; children?: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h + WIN.chrome, borderRadius: 18, overflow: "hidden",
      background: C.paper, boxShadow: "0 60px 140px rgba(20,20,20,.28), 0 12px 30px rgba(20,20,20,.12), 0 0 0 1px rgba(20,20,20,.08)" }}>
      <div style={{ height: WIN.chrome, background: "#e7e4dd", display: "flex", alignItems: "center", padding: "0 18px", gap: 9, borderBottom: `1px solid ${C.line}` }}>
        {["#ec6a5e", "#f4bf4f", "#61c554"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <div style={{ marginLeft: 120, flex: 1, maxWidth: 820, height: 28, borderRadius: 8, background: "#f6f4ef", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: inter, fontSize: 14, color: C.ink2 }}>{url}</div>
      </div>
      <div style={{ position: "relative", width: WIN.w, height: WIN.h, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: -scrollY, width: WIN.w }}>
          <Img src={staticFile(src)} style={{ width: WIN.w, display: "block" }} />
          {src2 && <Img src={staticFile(src2)} style={{ position: "absolute", left: 0, top: 0, width: WIN.w, display: "block", opacity: mix }} />}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Page (CSS px) to stage coordinates for a given scroll. */
export const toStage = (px: number, py: number, scrollY = 0) => ({ x: WIN.x + px, y: WIN.y + WIN.chrome + py - scrollY });
