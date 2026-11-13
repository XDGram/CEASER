import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "../../lib/wallet";
import { useProtocol } from "../../lib/protocol";
import { short, mult } from "../../lib/near";
import { Mark } from "../../components/Mark";
import { Pfp } from "../../components/Pfp";
import { profilePath } from "../../lib/profile";

const tabs = [
  ["Overview", "/app", true],
  ["Lock", "/app/lock", false],
  ["Challenges", "/app/challenges", false],
  ["My locks", "/app/locks", false],
  ["Community", "/app/community", false],
] as const;

export function AppShell() {
  const { ready, accountId, connect, disconnect } = useWallet();
  const { boostBps, reachable } = useProtocol();
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
            <nav className="flex items-center gap-1 overflow-x-auto">
              {tabs.map(([label, to, end]) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `px-3 py-1.5 rounded-full text-[12.5px] whitespace-nowrap transition ${isActive ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="pill hidden md:inline-flex">boost {mult(boostBps)}</span>
            {accountId ? (
              <>
                <Link to={profilePath(accountId)} className="btn btn-outline btn-sm font-mono !pl-1.5 flex items-center gap-2" title="Your profile">
                  <Pfp id={accountId} size={20} />
                  {short(accountId, 20)}
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
      </header>
      {reachable === false && <div className="bg-bad/10 text-bad text-[12px] text-center py-1.5">The vault is not reachable right now. Reads retry every 30 seconds.</div>}
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <footer className="border-t border-line py-5 text-center text-[11px] font-mono text-ink-3">CEASER · mock oracle · not for real value</footer>
    </div>
  );
}
