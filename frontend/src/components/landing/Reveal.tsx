import { motion, useMotionTemplate, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";

/* Sections arrive out of focus and sharpen as they reach the viewport, then soften as they leave. */
export function Reveal({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const blur = useTransform(p, [0, 0.28, 0.72, 1], reduce ? [0, 0, 0, 0] : [18, 0, 0, 12]);
  const filter = useMotionTemplate`blur(${blur}px)`;
  const opacity = useTransform(p, [0, 0.28, 0.75, 1], reduce ? [1, 1, 1, 1] : [0, 1, 1, 0.15]);
  const y = useTransform(p, [0, 0.28], reduce ? [0, 0] : [72, 0]);
  const scale = useTransform(p, [0, 0.28, 0.75, 1], reduce ? [1, 1, 1, 1] : [0.965, 1, 1, 0.985]);
  return (
    <motion.section ref={ref} id={id} style={{ filter, opacity, y, scale, willChange: "filter, transform, opacity" }} className={`scroll-mt-20 ${className}`}>
      {children}
    </motion.section>
  );
}

export function SectionIntro({ title, ghost, text, action }: { title: string; ghost: string; text?: string; action?: ReactNode }) {
  return (
    <div className="grid md:grid-cols-[1fr_340px] gap-x-12 gap-y-6 items-end">
      <h2 className="h-display">
        <span className="text-ink">{title}</span>
        <br />
        <span className="text-ink-3">{ghost}</span>
      </h2>
      <div className="md:justify-self-end w-full">
        {text && <p className="text-[14px] leading-relaxed text-ink-2">{text}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
