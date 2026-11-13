import { useWallet } from "../lib/wallet";
import { short } from "../lib/near";
import { Mark } from "./Mark";

const links = [
  ["Lock", "#lock"],
  ["Challenges", "#challenges"],
  ["Claim", "#claim"],
  ["Spec", "https://github.com/XDGram/CEASER/blob/main/INTERFACE.md"],
];

export function Nav() {
  const { ready, accountId, connect, disconnect } = useWallet();
  return (
    <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 h-14 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5">
          <Mark size={22} />
          <span className="text-[13px] font-medium tracking-tight">CEASER</span>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-[12.5px] text-ink-2">
          {links.map(([label, href]) => (
            <a key={label} href={href} className="hover:text-ink transition-colors" target={href.startsWith("http") ? "_blank" : undefined} rel="noopener">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className="pill hidden sm:inline-flex">testnet</span>
          {accountId ? (
            <button className="btn btn-outline btn-sm font-mono normal-case" onClick={disconnect} title="Disconnect">
              {short(accountId, 22)}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={connect} disabled={!ready}>
              Connect wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
