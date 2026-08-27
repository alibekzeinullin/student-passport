"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { TERM_HINTS, type TermHintKey } from "@/lib/term-hints";

export function TermHint({ term }: { term: TermHintKey }) {
  const text = TERM_HINTS[term];
  const [open, setOpen] = useState(false);
  const [supportsHover, setSupportsHover] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setSupportsHover(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  const getTooltipStyle = () => {
    if (typeof window === "undefined" || !rootRef.current) return undefined;
    const rect = rootRef.current.getBoundingClientRect();
    const width = Math.min(256, window.innerWidth - 24);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    return {
      top: rect.top - 8,
      left,
      width: `${width}px`,
      transform: "translateY(-100%)",
    } as const;
  };

  return (
    <span
      ref={rootRef}
      className="relative inline-flex shrink-0 align-middle"
      onMouseEnter={() => {
        if (supportsHover) setOpen(true);
      }}
      onMouseLeave={() => {
        if (supportsHover) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`Пояснение: ${term}`}
        aria-expanded={open}
        onClick={() => {
          if (!supportsHover) setOpen((prev) => !prev);
        }}
        className="inline-flex size-5 items-center justify-center rounded-full border border-navy/25 bg-white text-[10px] font-bold leading-none text-navy/70 transition hover:border-burgundy hover:bg-burgundy hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
      >
        ?
      </button>
      {open ? (
        <span
          role="tooltip"
          style={getTooltipStyle()}
          className="fixed z-[9999] rounded-md border border-navy/15 bg-navy px-3 py-2 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-white shadow-xl"
        >
          {text}
          <span
            aria-hidden
            className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-4 border-transparent border-t-navy"
          />
        </span>
      ) : null}
    </span>
  );
}

export function TermLabel({
  term,
  children,
  className = "",
}: {
  term: TermHintKey;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-1.5 ${className}`}
    >
      <span className="break-words">{children}</span>
      <TermHint term={term} />
    </span>
  );
}
