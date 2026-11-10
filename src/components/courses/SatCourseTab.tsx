"use client";

import type { StudentCourse } from "@/lib/courses";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" })}T00:00:00`);
  return Math.ceil((new Date(`${iso}T00:00:00`).getTime() - today.getTime()) / 86400000);
}

/** Вкладка SAT в кабинете ученика (этап 1: группа, команда, цель, дата экзамена). */
export function SatCourseTab({ course }: { course: StudentCourse }) {
  const left = daysLeft(course.sat_date);
  const upcoming = left !== null && left >= 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sp-glass rounded-3xl border px-5 py-5">
          <p className="text-xs text-muted">Цель</p>
          <p className="mt-1 text-5xl font-light text-navy">{course.target_score ?? "—"}</p>
          {!course.target_score ? <p className="mt-1 text-xs text-muted">Цель поставит учитель</p> : null}
        </div>
        <div className="sp-glass rounded-3xl border px-5 py-5">
          <p className="text-xs text-muted">До SAT</p>
          <p className="mt-1 text-5xl font-light text-gold">{upcoming ? left : "—"}</p>
          <p className="mt-1 text-xs text-muted">
            {course.sat_date ? `${upcoming ? "дней · " : ""}${fmt(course.sat_date)}` : "Дата экзамена пока не назначена"}
          </p>
        </div>
        <div className="sp-glass rounded-3xl border px-5 py-5">
          <p className="text-xs text-muted">Группа</p>
          <p className="mt-1 text-2xl font-light text-navy">{course.group_name ?? "—"}</p>
          <p className="mt-1 text-xs text-muted">{[course.stream_name, `с ${fmt(course.starts_on)}`].filter(Boolean).join(" · ")}</p>
        </div>
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
      <p className="text-sm text-muted">Скоро здесь появятся расписание, практисы и результаты пробных экзаменов.</p>
    </div>
  );
}
