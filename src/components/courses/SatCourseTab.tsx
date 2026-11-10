"use client";

import { useEffect, useState } from "react";
import type { StudentCourse } from "@/lib/courses";
import {
  addDays,
  courseWeek,
  fmtDay,
  hhmm,
  isoDate,
  loadStudentSatInfo,
  loadStudentUpcoming,
  type LessonRow,
  type StudentSatInfo,
} from "@/lib/lessons";
import {
  loadComments,
  loadResults,
  pathToTarget,
  pctTone,
  SECTION_LABELS,
  studentMocks,
  studentPractices,
  weakTopics,
  type CommentRow,
  type ResultsData,
} from "@/lib/results";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000);
}

const TONE_BAR = { low: "bg-burgundy/80", mid: "bg-gold", high: "bg-emerald-400/80" } as const;
const TONE_CARD = { low: "bg-burgundy/15 border-burgundy/30", mid: "bg-gold/10 border-gold/25", high: "bg-emerald-400/10 border-emerald-400/20" } as const;

/** Вкладка SAT в кабинете ученика. Обращение — на «вы». */
export function SatCourseTab({ course, studentId }: { course: StudentCourse; studentId: string }) {
  const today = isoDate(new Date());
  const [info, setInfo] = useState<StudentSatInfo | null>(null);
  const [upcoming, setUpcoming] = useState<LessonRow[]>([]);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [comment, setComment] = useState<CommentRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadStudentSatInfo(studentId),
      loadStudentUpcoming(today, addDays(today, 7)),
      loadResults().catch(() => null),
      loadComments(studentId).catch(() => [] as CommentRow[]),
    ]).then(([i, u, r, c]) => {
      if (cancelled) return;
      setInfo(i);
      setUpcoming(u.filter((l) => l.groups?.course_id === "sat"));
      setResults(r);
      setComment(c.find((x) => x.visibility === "family") ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, today]);

  const left = course.sat_date ? daysBetween(today, course.sat_date) : null;
  const upcomingSat = left !== null && left >= 0;
  const week = courseWeek(info?.stream_starts_on ?? null, info?.weeks_total ?? null, today);
  const mocks = results ? studentMocks(studentId, results) : [];
  const last = mocks.at(-1) ?? null;
  const target = course.target_score;
  const path = pathToTarget(mocks[0]?.result.total ?? null, last?.result.total ?? null, target);
  const practices = results ? studentPractices(studentId, results) : [];
  const weak = weakTopics(practices);
  const toRedo = weak.filter((w) => w.pct < 80).slice(0, 3);
  const fine = weak.filter((w) => w.pct >= 80);
  const chartMax = 1600;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <section className="sp-glass rounded-3xl border px-6 py-6 lg:col-span-2">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">До официальной сдачи SAT</p>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="text-6xl font-light text-gold">{upcomingSat ? left : "—"}</span>
            {upcomingSat ? <span className="text-lg text-navy">дней</span> : null}
          </p>
          <p className="mt-1 text-sm text-muted">{course.sat_date ? fmt(course.sat_date) : "Дата экзамена пока не назначена"}</p>
          {week ? (
            <div className="mt-5">
              <div className="flex justify-between text-xs text-muted">
                <span>{week.week === 0 ? "Курс ещё не начался" : `Неделя ${week.week} из ${week.total}`}</span>
                <span>
                  {course.group_name}
                  {course.stream_name ? ` · ${course.stream_name}` : ""}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-gold" style={{ width: `${Math.round((100 * week.week) / week.total)}%` }} />
              </div>
            </div>
          ) : null}
        </section>

        <section className="sp-glass rounded-3xl border px-6 py-6">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Целевой балл</p>
          <p className="mt-2 text-5xl font-light text-navy">{target ?? "—"}</p>
          {last ? (
            <>
              <p className="mt-2 text-sm text-muted">
                Сейчас {last.result.total} · {last.mock.title}
              </p>
              {path !== null ? (
                <>
                  <div className="mt-3 h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-burgundy" style={{ width: `${path}%` }} />
                  </div>
                  {target && (last.result.total ?? 0) < target ? (
                    <p className="mt-1.5 text-xs text-muted">Осталось набрать {target - (last.result.total ?? 0)} баллов</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-emerald-300">Цель достигнута</p>
                  )}
                </>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-navy">Verbal {last.result.verbal}</span>
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-navy">Math {last.result.math}</span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{target ? "Результат появится после первого пробного экзамена." : "Цель поставит учитель."}</p>
          )}
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="sp-glass rounded-3xl border px-6 py-6 lg:col-span-3">
          <h3 className="text-lg text-navy">Динамика по пробным экзаменам</h3>
          <p className="mt-1 text-sm text-muted">Только ваши результаты.</p>
          {mocks.length ? (
            <>
              <div className="relative mt-6 h-44">
                {target ? (
                  <div className="absolute inset-x-0 border-t border-dashed border-burgundy" style={{ bottom: `${(target / chartMax) * 100}%` }}>
                    <span className="absolute -top-5 right-0 text-xs font-semibold text-burgundy">Цель {target}</span>
                  </div>
                ) : null}
                <div className="absolute inset-0 flex items-end gap-4">
                  {mocks.map((m) => (
                    <div key={m.mock.id} className="flex min-w-0 flex-1 flex-col justify-end" style={{ height: "100%" }}>
                      <div
                        className="flex justify-center rounded-t-lg bg-navy/90 pt-1.5 text-sm font-semibold text-[#121b29]"
                        style={{ height: `${((m.result.total ?? 0) / chartMax) * 100}%` }}
                      >
                        {m.result.total}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex gap-4">
                {mocks.map((m) => (
                  <div key={m.mock.id} className="min-w-0 flex-1 text-center">
                    <p className="truncate text-sm text-navy">{m.mock.title}</p>
                    <p className="text-xs text-muted">{fmtDay(m.mock.mock_date)}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">Пробных экзаменов пока не было.</p>
          )}
        </section>

        <section className="sp-glass rounded-3xl border px-6 py-6 lg:col-span-2">
          <h3 className="text-lg text-navy">Ближайшие занятия</h3>
          {upcoming.length ? (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {upcoming.slice(0, 6).map((l) => (
                <li key={l.id} className={`flex gap-4 py-2.5 ${l.status === "cancelled" ? "opacity-50" : ""}`}>
                  <span className="w-24 shrink-0 text-sm font-semibold text-gold">
                    {l.lesson_date === today ? "Сегодня" : fmtDay(l.lesson_date)}
                    <span className="block text-navy">{hhmm(l.starts_at)}</span>
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className={`block text-navy ${l.status === "cancelled" ? "line-through" : ""}`}>{l.title || "Занятие"}</span>
                    <span className="block text-xs text-muted">
                      {l.status === "cancelled" ? "отменено" : l.moved_from ? `перенесено с ${l.moved_from}` : `${l.duration_min} мин`}
                      {l.topic ? ` · ${l.topic}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">На ближайшую неделю занятий нет.</p>
          )}
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="sp-glass rounded-3xl border px-6 py-6 lg:col-span-3">
          <h3 className="text-lg text-navy">История практисов</h3>
          <p className="mt-1 text-sm text-muted">Тему и результат вносит учитель. Засчитывается лучшая попытка.</p>
          {practices.length ? (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {practices.map((p) => (
                <li key={p.practiceId} className="flex items-center gap-4 py-2.5">
                  <span className="w-24 shrink-0 text-xs font-semibold text-muted">{fmtDay(p.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-navy">{p.name}</span>
                    <span className="block text-xs text-muted">
                      {p.section ? SECTION_LABELS[p.section] : "Практис"}
                      {p.attempts > 1 ? ` · попыток: ${p.attempts}` : ""}
                    </span>
                  </span>
                  <span className="h-1.5 w-24 rounded-full bg-white/10">
                    <span className={`block h-1.5 rounded-full ${TONE_BAR[pctTone(p.pct)]}`} style={{ width: `${p.pct}%` }} />
                  </span>
                  <span className="w-12 text-right text-sm font-semibold text-navy">{p.pct}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Практисов пока не было.</p>
          )}
        </section>

        <section className="sp-glass rounded-3xl border px-6 py-6 lg:col-span-2">
          <h3 className="text-lg text-navy">Что перерешать</h3>
          <p className="mt-1 text-sm text-muted">Темы от самой слабой — по вашим практисам.</p>
          {weak.length ? (
            <div className="mt-3 space-y-2">
              {toRedo.map((w, i) => (
                <div key={w.practiceId} className={`rounded-2xl border px-4 py-3 ${TONE_CARD[pctTone(w.pct)]}`}>
                  <p className="flex justify-between gap-2 text-sm font-semibold text-navy">
                    <span>
                      {i + 1}. {w.name}
                    </span>
                    <span>{w.pct}%</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{w.pct < 50 ? "Приоритет: перерешать на этой неделе" : "Повторить в течение 2 недель"}</p>
                </div>
              ))}
              {fine.length ? (
                <div className={`rounded-2xl border px-4 py-3 ${TONE_CARD.high}`}>
                  <p className="flex justify-between gap-2 text-sm font-semibold text-navy">
                    <span>Остальные темы</span>
                    <span>80%+</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{fine.map((f) => f.name).join(", ")}: можно не трогать</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Появится после первых практисов.</p>
          )}
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="sp-glass rounded-3xl border px-6 py-6">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Посещаемость</p>
          <p className="mt-1 text-4xl font-light text-navy">{info?.attendance_pct != null ? `${info.attendance_pct}%` : "—"}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">Домашние задания</p>
          <p className="mt-1 text-4xl font-light text-navy">{info?.homework_pct != null ? `${info.homework_pct}%` : "—"}</p>
        </section>
        <section className="rounded-3xl border border-gold/25 bg-gold/[0.07] px-6 py-6 lg:col-span-2">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Комментарий учителя</p>
          {comment ? (
            <>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-navy">{comment.body}</p>
              <p className="mt-3 text-xs text-muted">
                {comment.author_name} · {new Date(comment.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">Пока нет комментариев.</p>
          )}
        </section>
        <section className="sp-glass rounded-3xl border px-6 py-6 lg:col-span-2">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Учитель</p>
          <p className="mt-1 text-navy">{course.teacher_name ?? "назначается"}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">Куратор</p>
          <p className="mt-1 text-navy">{course.curator_name ?? "назначается"}</p>
          <p className="mt-4 text-xs text-muted">В группе с {fmt(course.starts_on)}</p>
        </section>
      </div>

      <p className="text-xs text-muted">Здесь видны только ваши данные. Результаты других учеников и внутренние заметки учителей вам не показываются.</p>
    </div>
  );
}
