import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "../../lib/wallet";
import { useProtocol } from "../../lib/protocol";
import { short, mult } from "../../lib/near";
import { Mark } from "../../components/Mark";
import { Pfp } from "../../components/Pfp";
import { profilePath } from "../../lib/profile";
import { ActivityToasts } from "../../components/ActivityToasts";
import { tierOf, useNearBacking } from "../../lib/nearTier";

const tabs = [
  ["Overview", "/app", true],
  ["Lock", "/app/lock", false],
  ["Challenges", "/app/challenges", false],
  ["Communities", "/app/communities", false],
  ["My locks", "/app/locks", false],
  ["Floor", "/app/community", false],
] as const;

function Tabs() {
  return (
    <>
      {tabs.map(([label, to, end]) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `px-3 py-1.5 rounded-full text-[12.5px] whitespace-nowrap transition shrink-0 ${isActive ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>
          {label}
        </NavLink>
      ))}
    </>
  );
}

export function AppShell() {
  const { ready, accountId, isDemo, connect, disconnect } = useWallet();
  const { boostBps, reachable } = useProtocol();
  const { backing } = useNearBacking(accountId);
  const navigate = useNavigate();
  // Profiles are public: anyone can read /app/u/:account without a wallet.
  const publicPage = useLocation().pathname.startsWith("/app/u/");

  useEffect(() => {
    if (ready && !accountId && !publicPage) navigate("/", { replace: true });
  }, [ready, accountId, publicPage, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur border-b border-line">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <Mark tile size={22} />
              <span className="text-[13px] font-medium tracking-tight hidden sm:inline">CEASER</span>
            </Link>
            <nav className="hidden lg:flex items-center gap-1 overflow-x-auto" aria-label="App">
              <Tabs />
            </nav>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {accountId && backing && (
              <Link to={`${profilePath(accountId)}#near-backing`} className="pill max-sm:hidden! hover:border-ink hover:text-ink" title="Your NEAR backing and what it unlocks in the app">
                {tierOf(backing.total).name}
              </Link>
            )}
            <span className="pill max-md:hidden!" title="Reward multiplier the vault applies, from staked NEAR only">boost {mult(boostBps)}</span>
            {accountId ? (
              <>
                {isDemo && (
                  <span className="pill max-sm:hidden!" title="A testnet account created in this browser. Its key lives only here.">
                    demo account
                  </span>
                )}
                <Link to={profilePath(accountId)} className="btn btn-outline btn-sm font-mono !pl-1.5 flex items-center gap-2" title="Your profile">
                  <Pfp id={accountId} size={20} />
                  {/* Shorter on phones so the chip and Sign out fit beside the nav without overflowing. */}
                  <span className="sm:hidden">{short(accountId, 12)}</span>
                  <span className="hidden sm:inline">{short(accountId, 20)}</span>
                </Link>
                <button className="btn btn-ghost btn-sm !px-2" onClick={disconnect} title="Disconnect">
                  Sign out
                </button>
              </>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={connect}>
                Connect
              </button>
            )}
          </div>
        </div>
              {/* Below lg the account chip leaves too little room beside the logo, so the tabs get their own scrolling row. */}
        <nav className="lg:hidden flex items-center gap-1 overflow-x-auto px-3 sm:px-5 pb-2 -mt-1" aria-label="App">
          <Tabs />
        </nav>
      </header>
      {reachable === false && <div className="bg-bad/10 text-bad text-[12px] text-center py-1.5">The vault is not reachable right now. Reads retry every 30 seconds.</div>}
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <footer className="border-t border-line py-5 text-center text-[11px] font-mono text-ink-3">CEASER · mock oracle · not for real value</footer>
      <ActivityToasts />
    </div>
  );
}
