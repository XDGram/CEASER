import { Link } from "react-router-dom";
import { useWallet } from "../lib/wallet";
import { markEnter } from "../lib/enter";
import { short } from "../lib/near";
import { Mark } from "./Mark";

const links = [
  ["How it works", "#how"],
  ["Mechanics", "#mechanics"],
  ["Challenges", "#live"],
  ["Spec", "https://github.com/XDGram/CEASER/blob/main/INTERFACE.md"],
];

export function EnterButton({ className = "btn btn-primary btn-sm", label }: { className?: string; label?: string }) {
  const { ready, accountId, connect } = useWallet();
  if (accountId)
    return (
      <Link to="/app" className={className}>
        {label ?? "Open app"}
      </Link>
    );
  return (
    <button
      className={className}
      disabled={!ready}
      onClick={() => {
        markEnter();
        connect();
      }}
    >
      {label ?? "Connect wallet"}
    </button>
  );
}

export function Nav() {
  const { accountId } = useWallet();
  return (
    <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <Mark size={22} />
          <span className="text-[13px] font-medium tracking-tight">CEASER</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-[12.5px] text-ink-2">
          {links.map(([label, href]) => (
            <a key={label} href={href} className="hover:text-ink transition-colors" target={href.startsWith("http") ? "_blank" : undefined} rel="noopener">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className="pill hidden sm:inline-flex">testnet</span>
          {accountId && <span className="hidden sm:inline-flex pill border-ink text-ink normal-case tracking-normal">{short(accountId, 20)}</span>}
          <EnterButton />
        </div>
      </div>
    </header>
  );
}
