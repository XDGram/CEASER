import { motion } from "framer-motion";
import { Halftone } from "../Halftone";
import { ButtonIcon } from "../Nav";
import { Reveal } from "./Reveal";

export function Intro() {
  return (
    <Reveal className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-x-10 gap-y-12 items-start">
        <div>
          <h2 className="h-display max-w-[600px]" style={{ fontSize: "clamp(28px, 3.5vw, 42px)" }}>
            <span className="block text-ink">You sold at 2x because you were scared.</span>
            <span className="text-ink-3">
              Then it did 50x, and you did the maths on <span className="text-ink">the retirement you fumbled.</span>
            </span>
          </h2>
        </div>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1.2 }} className="lg:-mt-6 lg:justify-self-end w-full max-w-[560px]">
          <Halftone seed={3} cols={72} rows={44} className="w-full h-auto" />
        </motion.div>
        <div className="lg:mt-2 max-w-[360px]">
          <p className="text-[13.5px] leading-relaxed text-ink-2">Every cycle has the same story. Moonbags get sold on a red candle, not on a target. CEASER locks your bag behind the targets you set while you are calm, so the scared version of you can't sell it. And if someone else sells scared, their penalty is paid to you.</p>
          <a href="#how" className="btn btn-outline mt-7">
            <ButtonIcon dark />
            See how it works
          </a>
        </div>
      </div>
    </Reveal>
  );
}

export function Statement() {
  return (
    <Reveal className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <div className="grid md:grid-cols-[1fr_300px] gap-x-16 gap-y-8 items-end">
        <h2 className="h-display">
          <span className="text-ink">Dumps pay the diamond hands,</span> <span className="text-ink-3">and diamond hands who back NEAR get paid more.</span>
        </h2>
        <p className="text-[13px] leading-relaxed text-ink-2 md:text-right">The first protocol that turns memecoin activity into NEAR staking demand. Lockers with NEAR staked earn up to 2x their share of any Challenge pool.</p>
      </div>
    </Reveal>
  );
}
