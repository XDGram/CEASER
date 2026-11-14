import { motion } from "framer-motion";
import { EnterButton } from "../Nav";
import { Halftone } from "../Halftone";
import { Reveal } from "./Reveal";

export function Closing() {
  return (
    <Reveal className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <div className="relative card overflow-hidden p-8 sm:p-14 text-center">
        <Halftone seed={7} cols={90} rows={24} className="absolute inset-0 w-full h-full opacity-60 pointer-events-none" />
        <div className="relative">
          <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }} className="pixel text-[clamp(26px,5vw,56px)] text-ink">
            DUMPS PAY
            <br />
            DIAMOND HANDS.
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2, duration: 0.7 }} className="mx-auto mt-5 max-w-[440px] text-[14px] leading-relaxed text-ink-2">
            Connect a NEAR wallet, or take a free NEAR testnet account with test NEAR and CSTEST in one click, and watch the mechanic work end to end in minutes.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 0.7 }} className="mt-8 flex flex-wrap justify-center gap-3">
            <EnterButton className="btn btn-accent" icon />
            <a href="https://github.com/XDGram/CEASER" target="_blank" rel="noopener" className="btn btn-outline">
              View the code
            </a>
          </motion.div>
        </div>
      </div>
    </Reveal>
  );
}
