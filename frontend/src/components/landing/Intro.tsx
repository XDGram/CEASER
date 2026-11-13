import { motion } from "framer-motion";
import { Halftone } from "../Halftone";
import { ButtonIcon } from "../Nav";
import { Reveal } from "./Reveal";

export function Intro() {
  return (
    <Reveal className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-x-10 gap-y-12 items-start">
        <div>
          <h2 className="h-display max-w-[560px]" style={{ fontSize: "clamp(28px, 3.5vw, 42px)" }}>
            <span className="block text-ink">Introducing CEASER</span>
            <span className="text-ink-3">
              The first lock that pays you <span className="text-ink">when other people sell</span>
            </span>
          </h2>
        </div>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1.2 }} className="lg:-mt-6 lg:justify-self-end w-full max-w-[560px]">
          <Halftone seed={3} cols={72} rows={44} className="w-full h-auto" />
        </motion.div>
        <div className="lg:mt-2 max-w-[340px]">
          <p className="text-[13.5px] leading-relaxed text-ink-2">A new kind of token lock. Your bag unlocks on the targets you set. Your community's Challenge pools the penalties of everyone who left early and pays them to everyone who held, weighted by how much and how long.</p>
          <a href="#how" className="btn btn-outline mt-7">
            <ButtonIcon dark />
            Read more
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
