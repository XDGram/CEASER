import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../lib/wallet";
import { takeEnter } from "../lib/enter";
import { Nav } from "../components/Nav";
import { Hero } from "../components/landing/Hero";
import { Stats } from "../components/landing/Stats";
import { Intro, Statement } from "../components/landing/Intro";
import { Story } from "../components/landing/Story";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Mechanics } from "../components/landing/Mechanics";
import { WhoFor } from "../components/landing/WhoFor";
import { Defenses } from "../components/landing/Defenses";
import { LiveChallenges } from "../components/landing/LiveChallenges";
import { Closing } from "../components/landing/Closing";
import { Footer } from "../components/Footer";
import { NearCore } from "../components/landing/NearCore";
import { CommunitiesPreview } from "../components/landing/CommunitiesPreview";
import { ActivityToasts } from "../components/ActivityToasts";

export function Landing() {
  const { accountId } = useWallet();
  const navigate = useNavigate();

  useEffect(() => {
    if (accountId && takeEnter()) navigate("/app", { replace: true });
  }, [accountId, navigate]);

  return (
    <>
      <Nav />
      <main className="overflow-x-clip">
        <Hero />
        <Stats />
        <NearCore />
        <Intro />
        <Story />
        <HowItWorks />
        <Mechanics />
        <Statement />
        <WhoFor />
        <Defenses />
        <CommunitiesPreview />
        <LiveChallenges />
        <Closing />
      </main>
      <Footer />
      <ActivityToasts />
    </>
  );
}
