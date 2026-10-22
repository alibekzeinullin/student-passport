"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStudents } from "@/context/StudentsContext";
import type { StudentProfile } from "@/lib/types";
import { fetchMeetingsByParentToken, type Meeting } from "@/lib/meetings";
import { fetchDeadlinesByParentToken, type Deadline } from "@/lib/deadlines";
import { fetchTermGradesByParentToken, type TermGrade } from "@/lib/term-grades";
import { fetchSubmissionsByParentToken, type EssaySubmission } from "@/lib/essays";
import { buildMonthlyDraft, collectMonthFacts, monthPrefix } from "@/lib/monthly-draft";

function shift(prefix: string, delta: number): string {
  const [y, m] = prefix.split("-").map(Number);
  return monthPrefix(new Date(y, m - 1 + delta, 1));
}

function normalize(label: string): string {
  return label.toLowerCase().replace(/\s*г\.?\s*$/, "").replace(/\s+/g, " ").trim();
}

/** Короткие итоги месяца для родителя: цифры + главное + над чем работаем. */
export default function ParentMonthPage({ params }: { params: Promise<{ studentToken: string }> }) {
  const { studentToken } = use(params);
  const { fetchStudentByToken } = useStudents();
  const [student, setStudent] = useState<StudentProfile | null | undefined>(undefined);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [grades, setGrades] = useState<TermGrade[]>([]);
  const [essays, setEssays] = useState<EssaySubmission[]>([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return monthPrefix(now.getDate() <= 7 ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now);
  });

  useEffect(() => {
    let cancelled = false;
    void fetchStudentByToken(studentToken).then((s) => {
      if (!cancelled) setStudent(s);
    });
    void Promise.allSettled([
      fetchMeetingsByParentToken(studentToken),
      fetchDeadlinesByParentToken(studentToken),
      fetchTermGradesByParentToken(studentToken),
      fetchSubmissionsByParentToken(studentToken),
    ]).then(([m, d, g, e]) => {
      if (cancelled) return;
      if (m.status === "fulfilled") setMeetings(m.value);
      if (d.status === "fulfilled") setDeadlines(d.value);
      if (g.status === "fulfilled") setGrades(g.value);
      if (e.status === "fulfilled") setEssays(e.value);
    });
    return () => {
      cancelled = true;
    };
  }, [studentToken, fetchStudentByToken]);

  const facts = useMemo(
    () => (student ? collectMonthFacts({ student, meetings, deadlines, grades, essays }, month) : null),
    [student, meetings, deadlines, grades, essays, month],
  );
  const draft = useMemo(() => (facts && student ? buildMonthlyDraft(facts, student) : null), [facts, student]);
  const review = student && facts ? student.monthlyProgressReviews.find((r) => normalize(r.monthYear) === normalize(facts.label)) : undefined;

  if (student === undefined) return <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted">Загрузка…</div>;
  if (student === null || !facts || !draft) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h2 className="text-xl font-semibold text-navy">Ссылка недействительна</h2>
        <p className="mt-2 text-sm text-muted">Запросите новую ссылку у ментора.</p>
      </div>
    );
  }

  const isCurrent = month >= monthPrefix(new Date());
  const ind = facts.individual;
  const grp = facts.group;
  const highlights = (review?.highlights.trim() || draft.highlights || "").split("\n").filter(Boolean);
  const growth = (review?.growthAreas.trim() || draft.growthAreas || "").split("\n").filter(Boolean);

  return (
    <div className="sp-rise mx-auto min-w-0 max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:py-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/parent/${studentToken}`} className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline">
          ← Ко всему паспорту
        </Link>
        <button type="button" onClick={() => window.print()} className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline">
          Распечатать / PDF
        </button>
      </div>

      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Итоги месяца</p>
        <h2 className="mt-2 text-3xl font-light tracking-tight text-navy sm:text-4xl">
          {student.firstName} {student.lastName}
        </h2>
        <div className="mt-3 flex items-center justify-center gap-3 print:hidden">
          <button type="button" onClick={() => setMonth((m) => shift(m, -1))} className="rounded-full border border-white/10 px-3 py-1 text-muted hover:text-navy" aria-label="Предыдущий месяц">
            ←
          </button>
          <span className="min-w-36 text-lg text-navy">{facts.label}</span>
          <button
            type="button"
            onClick={() => setMonth((m) => shift(m, 1))}
            disabled={isCurrent}
            className="rounded-full border border-white/10 px-3 py-1 text-muted hover:text-navy disabled:opacity-30"
            aria-label="Следующий месяц"
          >
            →
          </button>
        </div>
        <p className="mt-1 hidden text-lg text-navy print:block">{facts.label}</p>
        {isCurrent ? <p className="mt-1 text-xs text-muted">месяц ещё идёт — данные на сегодня</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Индивидуальные встречи"
          value={ind.held ? `${ind.attended} из ${ind.held}` : "—"}
          tone={ind.absent ? "warn" : "ok"}
        />
        <Tile label="Групповые встречи" value={grp.held ? `${grp.attended} из ${grp.held}` : "—"} tone={grp.absent ? "warn" : "ok"} />
        <Tile
          label="Домашние задания"
          value={facts.homeworkAverage === null ? "—" : `${facts.homeworkAverage.toFixed(1).replace(".0", "")}/10`}
          tone={facts.homeworkAverage !== null && facts.homeworkAverage < 6 ? "warn" : "ok"}
        />
        <Tile label="Эссе за месяц" value={String(facts.essaysAccepted.length)} sub={`всего ${facts.essaysTotalAccepted} из 100`} />
      </div>

      {facts.gpaLine ? <p className="text-center text-sm text-muted">{facts.gpaLine}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Block title="Главное за месяц" items={highlights} empty="Пока нечего отметить" tone="ok" />
        <Block title="Над чем работаем" items={growth} empty="Замечаний нет" tone="warn" />
      </div>

      {facts.upcomingDeadlines.length ? (
        <Block
          title="Впереди"
          items={facts.upcomingDeadlines.map((d) => `${d.title} — ${new Date(d.dueDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`)}
          empty=""
        />
      ) : null}

      {review?.mentorFeedback.trim() ? (
        <section className="sp-glass rounded-3xl border px-5 py-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">Комментарий ментора</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-navy">{review.mentorFeedback}</p>
        </section>
      ) : null}

      <p className="text-center text-xs text-muted print:hidden">
        Подробный отчёт — в разделе{" "}
        <Link href={`/parent/${studentToken}/monthly`} className="text-gold underline-offset-2 hover:underline">
          Monthly Review
        </Link>
      </p>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="sp-glass rounded-3xl border px-4 py-4 text-center">
      <p className={`text-3xl font-light tabular-nums ${tone === "warn" ? "text-burgundy" : "text-navy"}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
      {sub ? <p className="text-[11px] text-muted">{sub}</p> : null}
    </div>
  );
}

function Block({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone?: "ok" | "warn" }) {
  return (
    <section className="sp-glass rounded-3xl border px-5 py-4">
      <h3 className={`text-[11px] font-medium uppercase tracking-[0.16em] ${tone === "warn" ? "text-burgundy" : tone === "ok" ? "text-emerald-300" : "text-muted"}`}>{title}</h3>
      {items.length ? (
        <ul className="mt-2 space-y-1.5 text-sm text-navy">
          {items.map((t) => (
            <li key={t}>{t.replace(/^•\s*/, "· ")}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}
