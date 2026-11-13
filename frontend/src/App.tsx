import { WalletProvider } from "./lib/wallet";
import { ProtocolProvider } from "./lib/protocol";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { Stats } from "./components/Stats";
import { Intro } from "./components/Intro";
import { LockSection } from "./components/LockSection";
import { ChallengesSection } from "./components/ChallengesSection";
import { ClaimSection } from "./components/ClaimSection";
import { Footer } from "./components/Footer";
import { Toasts } from "./components/Toasts";

export default function App() {
  return (
    <WalletProvider>
      <ProtocolProvider>
        <Nav />
        <main>
          <Hero />
          <Stats />
          <Intro />
          <LockSection />
          <ChallengesSection />
          <ClaimSection />
        </main>
        <Footer />
        <Toasts />
      </ProtocolProvider>
    </WalletProvider>
  );
}
