"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daysLeft, fetchDeadlines, formatDaysLeft, type Deadline } from "@/lib/deadlines";
import { fetchSubmissions, fetchTopics, type EssaySubmission, type EssayTopic } from "@/lib/essays";
import { goalPct, loadGoals, termLabel, termOf, type StudentGoal } from "@/lib/goals";
import { isoDate } from "@/lib/lessons";
import { ATTENDANCE_LABELS, fetchMeetingsWithNotes, formatMeetingDate, homeworkRating, type MeetingWithNotes } from "@/lib/meetings";
import { currentMonth, entryFor, isGrade10, loadPlan, type PlanEntry } from "@/lib/program-plan";
import { currentStage, fetchWorks, stageProgress, type StudentWork } from "@/lib/works";

interface BriefData {
  meetings: MeetingWithNotes[];
  deadlines: Deadline[];
  essays: EssaySubmission[];
  topics: EssayTopic[];
  works: StudentWork[];
  goals: StudentGoal[];
  plan: PlanEntry | null;
}

/**
 * Бриф перед встречей — всё на один экран: прошлая встреча и ДЗ, цели четверти, ближайшие дедлайны,
 * эссе на проверке, проекты, фокус месяца. Только для ментора, над журналом встреч.
 */
export function MeetingBrief({ studentId, className }: { studentId: string; className: string }) {
  const [d, setD] = useState<BriefData | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchMeetingsWithNotes(studentId).catch(() => [] as MeetingWithNotes[]),
      fetchDeadlines(studentId).catch(() => [] as Deadline[]),
      fetchSubmissions(studentId).catch(() => [] as EssaySubmission[]),
      fetchTopics().catch(() => [] as EssayTopic[]),
      fetchWorks(studentId).catch(() => [] as StudentWork[]),
      loadGoals(studentId),
      loadPlan(createClient()).catch(() => [] as PlanEntry[]),
    ]).then(([meetings, deadlines, essays, topics, works, goals, plan]) => {
      if (!cancelled) setD({ meetings, deadlines, essays, topics, works, goals, plan: entryFor(plan, currentMonth()) });
    });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (!d) return <p className="text-sm text-muted">Собираю бриф к встрече…</p>;

  const sorted = [...d.meetings].sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));
  const last = sorted[0] ?? null;
  const lastIndividual = sorted.find((m) => m.format === "individual") ?? null;
  const recent = sorted.slice(0, 5);
  const missed = recent.filter((m) => m.attendance === "absent").length;
  const term = termOf(isoDate(new Date()));
  const goals = d.goals.filter((g) => g.term === term);
  const upcoming = d.deadlines
    .filter((x) => x.status === "planned" && daysLeft(x.dueDate) >= -3 && daysLeft(x.dueDate) <= 30)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  const waiting = d.essays.filter((e) => e.status === "submitted");
  const topicTitle = (id: string) => d.topics.find((t) => t.id === id)?.title ?? "эссе";
  const lastReviewed = d.essays.filter((e) => e.reviewedAt).sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))[0];
  const activeWorks = d.works.filter((w) => w.status === "active");
  const focus = d.plan ? (isGrade10(className) && d.plan.grade10 ? d.plan.grade10 : d.plan.focus) : "";

  return (
    <section className="rounded-3xl border border-gold/40 bg-gold/[0.05] px-5 py-4 sm:px-6" aria-label="Бриф перед встречей">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <h3 className="text-lg text-navy">Бриф перед встречей</h3>
        <span className="text-sm text-muted">{open ? "свернуть" : "показать"}</span>
      </button>
      {open ? (
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Прошлая встреча</p>
            {lastIndividual ?? last ? (
              (() => {
                const m = (lastIndividual ?? last) as MeetingWithNotes;
                const hw = homeworkRating(m);
                return (
                  <div className="mt-1 space-y-1 text-navy">
                    <p>
                      {formatMeetingDate(m.meetingDate)} · {m.format === "individual" ? "индивидуальная" : "групповая"}
                      {m.attendance ? <span className="text-muted"> · {ATTENDANCE_LABELS[m.attendance].toLowerCase()}</span> : null}
                    </p>
                    {m.summary ? <p className="whitespace-pre-wrap text-muted">{m.summary}</p> : null}
                    {m.homework ? (
                      <p>
                        <span className="text-gold">Задали:</span> {m.homework}
                      </p>
                    ) : null}
                    {m.notes.parentFocus ? (
                      <p>
                        <span className="text-gold">Фокус:</span> {m.notes.parentFocus}
                      </p>
                    ) : null}
                    {hw !== null ? <p className="text-xs text-muted">Оценка ДЗ с прошлого раза: {hw}/10</p> : null}
                  </div>
                );
              })()
            ) : (
              <p className="mt-1 text-muted">Встреч ещё не было.</p>
            )}
            {recent.length > 1 ? (
              <p className={`mt-1 text-xs ${missed >= 2 ? "text-burgundy" : "text-muted"}`}>
                Последние {recent.length} встреч: пропусков {missed}
              </p>
            ) : null}
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Цели · {termLabel(term)}</p>
            {goals.length ? (
              <ul className="mt-1 space-y-1">
                {goals.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 text-navy">
                    <span className="h-1.5 w-16 shrink-0 rounded-full bg-navy/10">
                      <span className={`block h-1.5 rounded-full ${g.done >= g.target ? "bg-emerald-500" : "bg-gold"}`} style={{ width: `${goalPct(g)}%` }} />
                    </span>
                    <span className="tabular-nums text-xs text-muted">
                      {g.done}/{g.target}
                    </span>
                    <span className="truncate">{g.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-burgundy">Целей на четверть нет — поставьте на этой встрече.</p>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Дедлайны на месяц</p>
            {upcoming.length ? (
              <ul className="mt-1 space-y-0.5 text-navy">
                {upcoming.map((x) => {
                  const left = daysLeft(x.dueDate);
                  return (
                    <li key={x.id}>
                      {x.title}{" "}
                      <span className={left < 0 ? "text-burgundy" : left <= 7 ? "text-gold" : "text-muted"}>
                        · {left < 0 ? `просрочен ${formatDaysLeft(left)}` : formatDaysLeft(left)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-muted">Ближайших дедлайнов нет.</p>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Эссе и проекты</p>
            <ul className="mt-1 space-y-0.5 text-navy">
              {waiting.length ? (
                <li className="text-gold">
                  На проверке: {waiting.length} ({waiting.slice(0, 2).map((e) => topicTitle(e.topicId)).join(", ")})
                </li>
              ) : (
                <li className="text-muted">Эссе на проверке нет.</li>
              )}
              {lastReviewed ? <li className="text-muted">Последнее проверено: «{topicTitle(lastReviewed.topicId)}»</li> : null}
              {activeWorks.map((w) => {
                const st = currentStage(w);
                const pr = stageProgress(w);
                return (
                  <li key={w.id}>
                    {w.title || "Проект"} <span className="text-muted">· этапы {pr.done}/{pr.total}</span>
                    {st ? <span className="block text-xs text-muted">сейчас: {st.title}{st.due ? ` · до ${st.due}` : ""}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>

          {focus ? (
            <div className="md:col-span-2">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Фокус месяца по плану</p>
              <p className="mt-1 text-navy">
                {d.plan?.title ? <span className="font-semibold">{d.plan.title}. </span> : null}
                {focus}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
