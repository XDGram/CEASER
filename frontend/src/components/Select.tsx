import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

/* A dropdown in the page's own style: hairline card, paper hover, check on the selected row. */
export function Select({ value, onChange, options, placeholder = "Select", compact = false }: { value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && options[active]) pick(options[active].value);
      else setOpen(true);
    }
  };

  return (
    <div ref={ref} className={`relative ${compact ? "inline-block" : "w-full"}`}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        className={`flex w-full items-center justify-between gap-3 border text-left transition outline-none ${open ? "border-ink bg-surface" : "border-line bg-paper hover:border-line-2"} ${
          compact ? "rounded-full px-3 py-1 text-[12px]" : "rounded-lg px-3.5 py-2.5 text-[14px]"
        }`}
      >
        <span className={`truncate ${current ? "text-ink" : "text-ink-3"}`}>{current?.label ?? placeholder}</span>
        <motion.svg animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-ink-2" aria-hidden>
          <path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={`absolute z-30 mt-1.5 max-h-[280px] overflow-auto rounded-xl border border-line bg-surface p-1 shadow-[0_12px_32px_rgba(20,20,20,0.10)] ${compact ? "min-w-[240px] left-0" : "left-0 right-0"}`}
          >
            {options.map((o, i) => {
              const selected = o.value === value;
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o.value);
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px] ${i === active ? "bg-paper" : ""} ${selected ? "text-ink" : "text-ink-2"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block truncate text-[11px] text-ink-3">{o.hint}</span>}
                  </span>
                  {selected && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-ink" aria-hidden>
                      <path d="M2.5 6.2 L5 8.5 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
