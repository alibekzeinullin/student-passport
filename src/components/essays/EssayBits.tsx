"use client";

import { ESSAY_STATUS_LABELS, WORDS_MAX, WORDS_MIN, wordsTone, type EssayStatus } from "@/lib/essays";
import { useCountUp } from "@/lib/use-count-up";

export const STATUS_PILL: Record<EssayStatus | "none", string> = {
  none: "border-white/10 text-muted",
  draft: "border-navy-soft/40 text-navy-soft",
  submitted: "border-gold/50 text-gold",
  revision: "border-burgundy/50 text-burgundy",
  accepted: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
};

export function StatusPill({ status, className = "" }: { status: EssayStatus | "none"; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] ${STATUS_PILL[status]} ${className}`}>
      {ESSAY_STATUS_LABELS[status]}
    </span>
  );
}

/** Кольцо «N из 100». */
export function ProgressRing({
  value,
  goal,
  size = 148,
  animKey,
}: {
  value: number;
  goal: number;
  size?: number;
  animKey: string;
}) {
  const progress = useCountUp(1600, 200, animKey);
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const shown = Math.round(value * progress);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2.6" />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke="var(--gold)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray={100}
          strokeDashoffset={100 - pct * 100 * progress}
          style={{ filter: "drop-shadow(0 0 6px rgba(203,176,115,.45))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-light tabular-nums text-navy">{shown}</span>
        <span className="text-xs text-muted">из {goal}</span>
      </div>
    </div>
  );
}

export function WordCounter({ words }: { words: number }) {
  const tone = wordsTone(words);
  const color = tone === "ok" ? "text-emerald-300" : tone === "long" ? "text-gold" : "text-muted";
  const pct = Math.min(100, (words / WORDS_MAX) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gold/60"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-y-0 border-l border-white/40" style={{ left: `${(WORDS_MIN / WORDS_MAX) * 100}%` }} />
      </div>
      <span className={`text-xs tabular-nums ${color}`}>
        {words} слов · цель {WORDS_MIN}–{WORDS_MAX}
        {tone === "long" ? " — длинновато" : ""}
      </span>
    </div>
  );
}

export function formatScore(v: number | null): string {
  return v === null ? "—" : v.toFixed(1).replace(".0", "");
}
