import React from "react";
import { Composition } from "remotion";
import { CeaserVideo } from "./Video";
import { END, FPS } from "./time";
import "./fonts";

export function Root() {
  return (
    <>
      <Composition id="Ceaser" component={CeaserVideo} durationInFrames={Math.ceil(END * FPS)} fps={FPS} width={1920} height={1080} />
    </>
  );
}
