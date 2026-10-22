"use client";

import { useEffect, useState } from "react";
import { hasPlayed, markPlayed } from "@/lib/cache";

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
export function useCountUp(durationMs = 1600, delayMs = 0, key?: string): number {
  // С ключом анимация играет один раз за сессию; дальше сразу итоговое значение
  const [progress, setProgress] = useState(() => (key && hasPlayed(key) ? 1 : 0));

  useEffect(() => {
    if (key && hasPlayed(key)) return;
    let frame = 0;
    let start: number | null = null;

    const tick = (now: number) => {
      if (prefersReducedMotion()) {
        setProgress(1);
        if (key) markPlayed(key);
        return;
      }
      if (start === null) start = now;
      const t = Math.min(1, Math.max(0, (now - start - delayMs) / durationMs));
      setProgress(1 - Math.pow(1 - t, 4));
      if (t < 1) frame = requestAnimationFrame(tick);
      else if (key) markPlayed(key);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, delayMs, key]);

  return progress;
}
