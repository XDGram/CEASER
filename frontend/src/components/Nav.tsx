import { Link } from "react-router-dom";
import { useWallet } from "../lib/wallet";
import { markEnter } from "../lib/enter";
import { Mark } from "./Mark";

const links = [
  ["How it works", "#how"],
  ["Mechanics", "#mechanics"],
  ["Challenges", "#live"],
  ["Spec", "https://github.com/XDGram/CEASER/blob/main/INTERFACE.md"],
];

export function ButtonIcon({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-[6px] ${dark ? "bg-ink text-paper" : "bg-white/20 text-white"}`}>
      <Mark tile size={14} className="text-current" />
    </span>
  );
}

export function EnterButton({ className = "btn btn-primary btn-sm", label, icon = false }: { className?: string; label?: string; icon?: boolean }) {
  const { ready, accountId, connect } = useWallet();
  const inner = (
    <>
      {icon && <ButtonIcon dark={!className.includes("btn-accent") && !className.includes("btn-primary")} />}
      {label ?? (accountId ? "Open app" : "Connect wallet")}
    </>
  );
  if (accountId)
    return (
      <Link to="/app" className={className}>
        {inner}
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
      {inner}
    </button>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 h-14 grid grid-cols-[1fr_auto_1fr] items-center">
        <Link to="/" className="flex items-center gap-2.5 justify-self-start">
          <Mark tile size={22} />
          <span className="text-[13px] font-medium tracking-tight">CEASER</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-[12.5px] text-ink-2 justify-self-center">
          {links.map(([label, href]) => (
            <a key={label} href={href} className="hover:text-ink transition-colors" target={href.startsWith("http") ? "_blank" : undefined} rel="noopener">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-5 justify-self-end">
          <a href="https://github.com/XDGram/CEASER" target="_blank" rel="noopener" className="hidden sm:inline text-[12.5px] text-ink-2 hover:text-ink">
            GitHub
          </a>
          <EnterButton />
        </div>
      </div>
    </header>
  );
}
