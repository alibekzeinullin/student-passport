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

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000);
}

/** Вкладка SAT в кабинете ученика. Обращение — на «вы». */
export function SatCourseTab({ course, studentId }: { course: StudentCourse; studentId: string }) {
  const today = isoDate(new Date());
  const [info, setInfo] = useState<StudentSatInfo | null>(null);
  const [upcoming, setUpcoming] = useState<LessonRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadStudentSatInfo(studentId), loadStudentUpcoming(today, addDays(today, 7))]).then(([i, u]) => {
      if (cancelled) return;
      setInfo(i);
      setUpcoming(u.filter((l) => l.groups?.course_id === "sat"));
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, today]);

  const left = course.sat_date ? daysBetween(today, course.sat_date) : null;
  const upcomingSat = left !== null && left >= 0;
  const week = courseWeek(info?.stream_starts_on ?? null, info?.weeks_total ?? null, today);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sp-glass rounded-3xl border px-5 py-5">
          <p className="text-xs text-muted">До официальной сдачи SAT</p>
          <p className="mt-1 text-5xl font-light text-gold">{upcomingSat ? left : "—"}</p>
          <p className="mt-1 text-xs text-muted">
            {course.sat_date ? `${upcomingSat ? "дней · " : ""}${fmt(course.sat_date)}` : "Дата экзамена пока не назначена"}
          </p>
          {week ? (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted">
                <span>{week.week === 0 ? "Курс ещё не начался" : `Неделя ${week.week} из ${week.total}`}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/10">
                <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.round((100 * week.week) / week.total)}%` }} />
              </div>
            </div>
          ) : null}
        </div>
        <div className="sp-glass rounded-3xl border px-5 py-5">
          <p className="text-xs text-muted">Целевой балл</p>
          <p className="mt-1 text-5xl font-light text-navy">{course.target_score ?? "—"}</p>
          {!course.target_score ? <p className="mt-1 text-xs text-muted">Цель поставит учитель</p> : null}
        </div>
        <div className="sp-glass rounded-3xl border px-5 py-5">
          <p className="text-xs text-muted">Группа</p>
          <p className="mt-1 text-2xl font-light text-navy">{course.group_name ?? "—"}</p>
          <p className="mt-1 text-xs text-muted">{[course.stream_name, `с ${fmt(course.starts_on)}`].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <section className="sp-glass rounded-3xl border px-5 py-5 sm:col-span-2">
          <h3 className="text-lg text-navy">Ближайшие занятия</h3>
          {upcoming.length ? (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {upcoming.map((l) => (
                <li key={l.id} className={`flex gap-4 py-2.5 ${l.status === "cancelled" ? "opacity-50" : ""}`}>
                  <span className="w-28 shrink-0 text-sm font-semibold text-gold">
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
        <section className="sp-glass rounded-3xl border px-5 py-5">
          <p className="text-xs text-muted">Посещаемость</p>
          <p className="mt-1 text-4xl font-light text-navy">{info?.attendance_pct != null ? `${info.attendance_pct}%` : "—"}</p>
          <p className="mt-4 text-xs text-muted">Домашние задания</p>
          <p className="mt-1 text-4xl font-light text-navy">{info?.homework_pct != null ? `${info.homework_pct}%` : "—"}</p>
          {!info?.lessons_marked ? <p className="mt-3 text-xs text-muted">Появится после первых отмеченных занятий.</p> : null}
        </section>
      </div>

      <div className="sp-glass grid gap-4 rounded-3xl border px-5 py-5 sm:grid-cols-2 sm:px-6">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Учитель</p>
          <p className="mt-1 text-navy">{course.teacher_name ?? "назначается"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Куратор</p>
          <p className="mt-1 text-navy">{course.curator_name ?? "назначается"}</p>
        </div>
      </div>
      <p className="text-sm text-muted">Скоро здесь появятся пробные экзамены, практисы и разбор слабых тем.</p>
    </div>
  );
}
