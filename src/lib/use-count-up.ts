"use client";

import { useEffect, useState } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Плавный прогресс 0 → 1 после появления на экране (ease-out).
 * Используется для заполнения колец и полосок и «набегающих» цифр.
 */
export function useCountUp(durationMs = 1600, delayMs = 0): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    let start: number | null = null;

    const tick = (now: number) => {
      if (prefersReducedMotion()) {
        setProgress(1);
        return;
      }
      if (start === null) start = now;
      const t = Math.min(1, Math.max(0, (now - start - delayMs) / durationMs));
      setProgress(1 - Math.pow(1 - t, 4));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, delayMs]);

  return progress;
}
