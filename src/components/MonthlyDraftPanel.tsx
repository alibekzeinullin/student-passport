"use client";

import { useState } from "react";
import type { MonthlyProgressReview, StudentProfile } from "@/lib/types";
import { createEmptyMonthlyProgressReview } from "@/lib/monthly-progress";
import { fetchMeetingsForStudent } from "@/lib/meetings";
import { fetchDeadlines } from "@/lib/deadlines";
import { fetchTermGrades } from "@/lib/term-grades";
import { fetchSubmissions } from "@/lib/essays";
import { buildMonthlyDraft, collectMonthFacts, mergeIntoEmpty, monthPrefix } from "@/lib/monthly-draft";
import { Button } from "@/components/ui/Button";

function normalize(label: string): string {
  return label.toLowerCase().replace(/\s*г\.?\s*$/, "").replace(/\s+/g, " ").trim();
}

/** До 10-го числа по умолчанию предлагаем прошлый месяц, потом — текущий. */
function defaultMonth(): string {
  const now = new Date();
  const d = now.getDate() <= 10 ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now;
  return monthPrefix(d);
}

/**
 * «Собрать черновик»: посещаемость, домашки, дедлайны, GPA, эссе и спринты за месяц
 * подставляются в Monthly Review. Заполненные вручную поля не трогаем — дальше ментор правит сам.
 */
export function MonthlyDraftPanel({
  student,
  reviews,
  onApply,
}: {
  student: StudentProfile;
  reviews: MonthlyProgressReview[];
  onApply: (next: MonthlyProgressReview[], selectedId: string) => void;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      const settle = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
      const [meetings, deadlines, grades, essays] = await Promise.all([
        settle(fetchMeetingsForStudent(student.id), []),
        settle(fetchDeadlines(student.id), []),
        settle(fetchTermGrades(student.id), []),
        settle(fetchSubmissions(student.id), []),
      ]);
      const facts = collectMonthFacts({ student, meetings, deadlines, grades, essays }, month);
      const draft = buildMonthlyDraft(facts, student);
      const existing = reviews.find((r) => normalize(r.monthYear) === normalize(facts.label));
      if (existing) {
        const merged = mergeIntoEmpty(existing, draft);
        onApply(reviews.map((r) => (r.id === existing.id ? merged : r)), existing.id);
        setMsg(`Обзор за ${facts.label} уже был — дополнил только пустые поля. Проверьте и допишите оценку от себя.`);
      } else {
        const fresh = { ...createEmptyMonthlyProgressReview(facts.label), ...draft } as MonthlyProgressReview;
        onApply([fresh, ...reviews], fresh.id);
        setMsg(
          `Черновик за ${facts.label} готов: встреч ${facts.meetings.length}, домашка ${facts.homeworkAverage === null ? "—" : `${facts.homeworkCompletion}%`}. Допишите фокус месяца и обратную связь — всё можно править.`,
        );
      }
    } catch (err) {
      console.error(err);
      setMsg("Не удалось собрать данные.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sp-glass flex flex-col gap-3 rounded-3xl border border-gold/25 px-5 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-navy">Собрать черновик автоматически</p>
        <p className="mt-0.5 text-xs text-muted">
          Посещаемость, домашки, дедлайны, GPA, эссе и спринты за месяц. Ваши тексты не затираются — дальше правите как обычно.
        </p>
        {msg ? <p className="mt-2 text-sm text-gold">{msg}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Месяц"
          className="rounded-xl border border-white/10 bg-field px-3 py-2 text-sm text-navy outline-none focus:border-gold/60"
        />
        <Button type="button" disabled={busy || !month} onClick={() => void run()}>
          {busy ? "Собираю…" : "Собрать"}
        </Button>
      </div>
    </div>
  );
}
