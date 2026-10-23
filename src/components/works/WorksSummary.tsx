"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORK_KIND_LABELS, currentStage, fetchWorks, peekWorks, stageProgress, type StudentWork } from "@/lib/works";
import { daysLeft, formatDueDate } from "@/lib/deadlines";

/** Короткая сводка в кабинете ученика: что в работе и текущий этап. Полный раздел — на отдельной странице. */
export function WorksSummary({ studentId }: { studentId: string }) {
  const [works, setWorks] = useState<StudentWork[] | null>(() => peekWorks(studentId) ?? null);

  useEffect(() => {
    let cancelled = false;
    fetchWorks(studentId).then(
      (l) => !cancelled && setWorks(l),
      () => !cancelled && setWorks([]),
    );
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const active = (works ?? []).filter((w) => w.status !== "done").slice(0, 3);
  const doneCount = (works ?? []).filter((w) => w.status === "done").length;

  return (
    <div className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
      {works && works.length === 0 ? (
        <p className="text-sm text-muted">Пока нет проектов и исследований. Начни с одного — этапы уже подготовлены.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((w) => {
            const { done, total } = stageProgress(w);
            const cur = currentStage(w);
            const late = cur?.due && daysLeft(cur.due) < 0;
            return (
              <li key={w.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <span className="min-w-0 flex-1">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-gold">{WORK_KIND_LABELS[w.kind]}</span>
                  <span className="block truncate text-navy">{w.title}</span>
                </span>
                {cur ? (
                  <span className={`text-sm ${late ? "text-burgundy" : "text-muted"}`}>
                    {cur.title}
                    {cur.due ? ` · ${formatDueDate(cur.due)}` : ""}
                  </span>
                ) : null}
                <span className="text-xs tabular-nums text-muted">
                  {done}/{total}
                </span>
              </li>
            );
          })}
          {doneCount ? <li className="text-xs text-muted">Завершено: {doneCount}</li> : null}
        </ul>
      )}
      <Link href="/dashboard/works" className="mt-4 inline-block text-sm text-gold underline-offset-2 hover:underline">
        Открыть проекты и исследования →
      </Link>
    </div>
  );
}
