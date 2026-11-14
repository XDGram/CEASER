import { CONFIG } from "../config";
import { Mark } from "./Mark";

export function Footer() {
  const c = CONFIG.contracts;
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 py-10 grid md:grid-cols-[1fr_auto] gap-8">
        <div>
          <div className="flex items-center gap-2.5">
            <Mark tile size={20} />
            <span className="text-[13px] font-medium">CEASER</span>
          </div>
          <p className="mt-3 max-w-[420px] text-[12.5px] leading-relaxed text-ink-2">
            Built on NEAR, for the NEAR Hackathon 2026. Every lock, Challenge and reward lives in a NEAR smart contract on testnet. The price oracle is a mock with real TWAP semantics. Do not use with real value.
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px] font-mono text-ink-2 self-end">
          {Object.entries(c).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="uppercase tracking-[0.12em]">{k.replace("_", " ")}</dt>
              <dd>
                <a href={`${CONFIG.explorerUrl}/address/${v}`} target="_blank" rel="noopener" className="hover:text-ink">
                  {v}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </footer>
  );
}
