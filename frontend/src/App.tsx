import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { WalletProvider } from "./lib/wallet";
import { ProtocolProvider } from "./lib/protocol";
import { Toasts } from "./components/Toasts";
import { Landing } from "./pages/Landing";
import { AppShell } from "./pages/app/AppShell";
import { Overview } from "./pages/app/Overview";
import { LockSection } from "./components/LockSection";
import { ChallengesSection } from "./components/ChallengesSection";
import { ChallengeDetail } from "./pages/app/ChallengeDetail";
import { ClaimSection } from "./components/ClaimSection";

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <ProtocolProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Overview />} />
              <Route path="lock" element={<LockSection />} />
              <Route path="challenges" element={<ChallengesSection />} />
              <Route path="challenges/:id" element={<ChallengeDetail />} />
              <Route path="locks" element={<ClaimSection />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toasts />
        </ProtocolProvider>
      </WalletProvider>
    </BrowserRouter>
  );
}
