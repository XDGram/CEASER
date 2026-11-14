import { Composition } from "remotion";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const Probe = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#f3f1ec", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: "sans-serif", fontSize: 120, opacity: interpolate(f, [0, 20], [0, 1]) }}>CEASER</div>
    </AbsoluteFill>
  );
};

export const Root = () => <Composition id="Probe" component={Probe} durationInFrames={30} fps={30} width={1920} height={1080} />;
