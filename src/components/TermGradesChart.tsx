"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudentProfile, TermSystem } from "@/lib/types";
import { Input, Label, Select } from "@/components/ui/Field";
import { isTableMissing } from "@/lib/deadlines";
import {
  TERM_COUNT,
  TERM_SYSTEM_LABELS,
  currentAcademicYear,
  fetchTermGrades,
  fetchTermGradesByParentToken,
  gpaScaleMax,
  saveTermGrade,
  shiftAcademicYear,
  termLabel,
  verifyTermGrade,
  type TermGrade,
} from "@/lib/term-grades";
import { useCountUp } from "@/lib/use-count-up";

type Mode = "admin" | "student" | "parent";

/**
 * GPA по четвертям / триместрам / полугодиям: анимированный график
 * и (для ментора) таблица ввода за выбранный учебный год.
 */
export function TermGradesChart({
  student,
  mode,
  parentToken,
  onTermSystemChange,
}: {
  student: StudentProfile;
  mode: Mode;
  parentToken?: string;
  onTermSystemChange?: (system: TermSystem) => void;
}) {
  const [grades, setGrades] = useState<TermGrade[]>([]);
  const [error, setError] = useState("");
  const [year, setYear] = useState(currentAcademicYear());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const system = student.termSystem;
  const termCount = TERM_COUNT[system];
  const scaleMax = gpaScaleMax(student.educationSystem);
  const isAdmin = mode === "admin";
  // Ученик тоже вносит оценки — они ждут проверки ментора
  const editable = mode === "admin" || mode === "student";

  const fetchList = useCallback(
    () =>
      mode === "parent"
        ? fetchTermGradesByParentToken(parentToken ?? "")
        : fetchTermGrades(student.id),
    [mode, parentToken, student.id],
  );

  const applyResult = useCallback((r: PromiseSettledResult<TermGrade[]>) => {
    if (r.status === "fulfilled") {
      setGrades(r.value);
      setError("");
    } else {
      console.error(r.reason);
      setError(
        isTableMissing(r.reason, "term_grades")
          ? "Оценки по четвертям ещё не подключены: выполните supabase/migration-platform.sql в Supabase."
          : "Не удалось загрузить оценки.",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchList().then(
      (value) => !cancelled && applyResult({ status: "fulfilled", value }),
      (reason: unknown) => !cancelled && applyResult({ status: "rejected", reason }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchList, applyResult]);

  // Точки графика: все годы по порядку, только четверти текущей системы
  const points = useMemo(
    () =>
      grades
        .filter((g) => g.gpa !== null && g.termNumber <= termCount)
        .map((g) => ({
          key: `${g.academicYear}-${g.termNumber}`,
          label: termLabel(system, g.termNumber, true),
          year: g.academicYear,
          value: g.gpa as number,
        })),
    [grades, system, termCount],
  );

  const gradeFor = (n: number) =>
    grades.find((g) => g.academicYear === year && g.termNumber === n)?.gpa ?? null;

  const commit = async (n: number) => {
    const key = `${year}-${n}`;
    const raw = drafts[key];
    if (raw === undefined) return;
    const trimmed = raw.trim().replace(",", ".");
    const value = trimmed === "" ? null : Number.parseFloat(trimmed);
    if (value !== null && (Number.isNaN(value) || value < 0 || value > 10)) {
      setError(`GPA должен быть от 0 до ${scaleMax}`);
      return;
    }
    setSavingKey(key);
    try {
      await saveTermGrade(student.id, year, n, value);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      applyResult(...(await Promise.allSettled([fetchList()])));
    } catch (err) {
      console.error(err);
      setError("Не удалось сохранить оценку.");
    } finally {
      setSavingKey(null);
    }
  };

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const delta = last && prev ? last.value - prev.value : null;

  return (
    <section className="sp-glass rounded-3xl border px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-medium text-navy sm:text-lg">
            GPA по {system === "quarters" ? "четвертям" : system === "trimesters" ? "триместрам" : "полугодиям"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {last ? (
              <>
                Сейчас <span className="text-navy">{last.value.toFixed(2)}</span>
                {delta !== null ? (
                  <span className={delta >= 0 ? "text-emerald-300" : "text-burgundy"}>
                    {" "}
                    {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}
                  </span>
                ) : null}{" "}
                · шкала до {scaleMax}
              </>
            ) : (
              `Шкала до ${scaleMax}`
            )}
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <div className="min-w-36">
              <Label>Школа делит год на</Label>
              <Select
                value={system}
                onChange={(e) => onTermSystemChange?.(e.target.value as TermSystem)}
              >
                {(Object.keys(TERM_SYSTEM_LABELS) as TermSystem[]).map((s) => (
                  <option key={s} value={s}>
                    {TERM_SYSTEM_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-2 text-sm text-burgundy">
          {error}
        </p>
      ) : null}

      <LineChart points={points} max={scaleMax} />

      {grades.some((g) => !g.verified) ? (
        <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/[0.06] px-4 py-3">
          <p className="text-xs uppercase tracking-[0.12em] text-gold">Ждут проверки ментора</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {grades
              .filter((g) => !g.verified)
              .map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm text-navy">
                  <span className="min-w-0 flex-1">
                    {g.academicYear}, {termLabel(system, g.termNumber)} — {g.gpa?.toFixed(2) ?? "—"}
                  </span>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() =>
                        void verifyTermGrade(g.id).then(
                          async () => applyResult(...(await Promise.allSettled([fetchList()]))),
                          (err: unknown) => {
                            console.error(err);
                            setError("Не удалось подтвердить оценку.");
                          },
                        )
                      }
                      className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold transition hover:bg-gold/10"
                    >
                      Подтвердить
                    </button>
                  ) : (
                    <span className="text-xs text-muted">ментор проверит</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {editable ? (
        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Учебный год
            </span>
            <button
              type="button"
              onClick={() => setYear((y) => shiftAcademicYear(y, -1))}
              className="rounded-full border border-white/10 px-3 py-1 text-sm text-navy hover:bg-white/5"
              aria-label="Предыдущий год"
            >
              ←
            </button>
            <span className="min-w-20 text-center text-sm text-navy">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => shiftAcademicYear(y, 1))}
              className="rounded-full border border-white/10 px-3 py-1 text-sm text-navy hover:bg-white/5"
              aria-label="Следующий год"
            >
              →
            </button>
          </div>
          <div
            className="mt-3 grid gap-3"
            style={{ gridTemplateColumns: `repeat(${termCount}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: termCount }, (_, i) => i + 1).map((n) => {
              const key = `${year}-${n}`;
              const current = gradeFor(n);
              return (
                <div key={key}>
                  <Label htmlFor={`gpa-${key}`}>{termLabel(system, n)}</Label>
                  <Input
                    id={`gpa-${key}`}
                    inputMode="decimal"
                    placeholder="—"
                    value={drafts[key] ?? (current === null ? "" : String(current))}
                    disabled={savingKey === key}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    onBlur={() => void commit(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            {isAdmin
              ? "Сохраняется автоматически, когда уходите из поля. Пустое поле — удалить оценку."
              : "Впиши GPA из электронного дневника — сохранится автоматически, ментор проверит."}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function LineChart({
  points,
  max,
}: {
  points: { key: string; label: string; year: string; value: number }[];
  max: number;
}) {
  const progress = useCountUp(1600, 200);
  const W = 640;
  const H = 220;
  const padL = 72;
  const padR = 40;
  const padTop = 20;
  const padBottom = 40;

  if (points.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted">
        Оценок по четвертям пока нет — график появится после первой.
      </div>
    );
  }

  const min = Math.max(0, Math.floor(Math.min(...points.map((p) => p.value)) - 1));
  const span = Math.max(0.5, max - min);
  const stepX = points.length > 1 ? (W - padL - padR) / (points.length - 1) : 0;
  const xy = points.map((p, i) => ({
    ...p,
    x: points.length > 1 ? padL + i * stepX : (W + padL - padR) / 2,
    y: padTop + (1 - (p.value - min) / span) * (H - padTop - padBottom),
  }));
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1].x.toFixed(1)},${H - padBottom} L${xy[0].x.toFixed(1)},${H - padBottom} Z`;
  const gridValues = Array.from({ length: 4 }, (_, i) => min + (span * i) / 3);

  // Годовые разделители: где меняется учебный год
  const yearStarts = xy.filter((p, i) => i === 0 || p.year !== xy[i - 1].year);

  return (
    <div className="mt-5 overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[480px]"
        role="img"
        aria-label={`GPA по периодам: ${points.map((p) => `${p.year} ${p.label} — ${p.value}`).join(", ")}`}
      >
        <defs>
          <linearGradient id="gpaArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#cbb073" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#cbb073" stopOpacity="0" />
          </linearGradient>
          <clipPath id="gpaReveal">
            <rect x="0" y="0" width={W * progress} height={H} />
          </clipPath>
        </defs>
        {gridValues.map((v) => {
          const y = padTop + (1 - (v - min) / span) * (H - padTop - padBottom);
          return (
            <g key={v}>
              <line x1={padL - 16} x2={W - padR + 16} y1={y} y2={y} stroke="rgba(255,255,255,.06)" />
              <text x={padL - 24} y={y + 4} textAnchor="end" fontSize="11" fill="#a3afc0">
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}
        {yearStarts.map((p) => (
          <text key={`y-${p.key}`} x={p.x} y={H - 6} textAnchor="middle" fontSize="10" fill="#6f7c8f">
            {p.year}
          </text>
        ))}
        <g clipPath="url(#gpaReveal)">
          <path d={area} fill="url(#gpaArea)" />
          <path
            d={line}
            fill="none"
            stroke="#cbb073"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 6px rgba(203,176,115,.5))" }}
          />
        </g>
        {xy.map((p, i) => {
          const visible = progress >= (points.length > 1 ? i / (points.length - 1) : 0) - 0.001;
          return (
            <g key={p.key} style={{ opacity: visible ? 1 : 0, transition: "opacity .3s" }}>
              <circle cx={p.x} cy={p.y} r={5} fill="#121b29" stroke="#cbb073" strokeWidth={2} />
              <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="12" fill="#eef1f5">
                {p.value.toFixed(2)}
              </text>
              <text x={p.x} y={H - padBottom + 18} textAnchor="middle" fontSize="11" fill="#a3afc0">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
