"use client";

import type { StudentProfile } from "@/lib/types";
import {
  calculateAcademicSuccessScore,
  clampScore,
} from "@/lib/academic-score";
import { TermHint } from "@/components/ui/TermHint";
import type { TermHintKey } from "@/lib/term-hints";
import { useCountUp } from "@/lib/use-count-up";

interface ScoreCirclesProps {
  student: StudentProfile;
}

/**
 * Индикаторы прогресса. Посещаемость и задания считаются базой из журнала
 * встреч, академ успехи — из паспорта. Кольца заполняются с анимацией.
 */
export function ScoreCircles({ student }: ScoreCirclesProps) {
  const academic = calculateAcademicSuccessScore(student);
  const progress = useCountUp(1800, 250);

  return (
    <section className="sp-glass rounded-3xl border px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          Индикаторы прогресса
        </h3>
        <p className="text-xs text-muted">
          считаются автоматически · шкала 0–100
        </p>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
        <ScoreRing
          label="Посещаемость"
          detail="был 100% · опоздал 50% · не пришёл 0%"
          hintTerm="Посещаемость"
          value={student.attendanceScore}
          color="var(--burgundy)"
          glow="rgba(224,107,128,.55)"
          progress={progress}
        />
        <ScoreRing
          label="Выполнение заданий"
          detail="средняя оценка домашек × 10"
          hintTerm="Выполнение заданий"
          value={student.assignmentsScore}
          color="var(--navy-soft)"
          glow="rgba(143,166,200,.5)"
          progress={progress}
        />
        <ScoreRing
          label="Академ успехи"
          detail="GPA 35% · активность 25% · проекты 20% · навыки 15% · книги 5%"
          hintTerm="Академ успехи"
          value={academic}
          color="var(--gold)"
          glow="rgba(203,176,115,.55)"
          progress={progress}
        />
      </div>
    </section>
  );
}

function ScoreRing({
  label,
  value,
  color,
  glow,
  detail,
  hintTerm,
  progress,
}: {
  label: string;
  value: number;
  color: string;
  glow: string;
  detail?: string;
  hintTerm?: TermHintKey;
  progress: number;
}) {
  const safe = clampScore(value);
  const shown = safe * progress;

  return (
    <div className="flex w-full flex-col items-center text-center">
      <div className="relative size-36 shrink-0 sm:size-40">
        <svg
          viewBox="0 0 120 120"
          className="size-full -rotate-90 overflow-visible"
          aria-hidden
        >
          <circle
            cx="60"
            cy="60"
            r="52"
            pathLength={100}
            fill="none"
            stroke="rgba(255,255,255,.07)"
            strokeWidth={6}
          />
          <circle
            cx="60"
            cy="60"
            r="52"
            pathLength={100}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={100}
            strokeDashoffset={100 - shown}
            style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-light leading-none tracking-tight text-navy sm:text-[44px]">
            {Math.round(shown)}
          </span>
          <span className="mt-1 text-[11px] text-muted">из 100</span>
        </div>
      </div>
      <div className="mt-4 flex max-w-full flex-col items-center gap-1 px-1">
        <p className="flex flex-wrap items-center justify-center gap-1.5 text-base font-medium leading-snug text-navy">
          <span className="break-words">{label}</span>
          {hintTerm ? <TermHint term={hintTerm} /> : null}
        </p>
        {detail ? (
          <p className="max-w-[16rem] text-xs leading-snug text-muted">
            {detail}
          </p>
        ) : null}
      </div>
      <span className="sr-only">
        {label}: {safe} из 100
      </span>
    </div>
  );
}
