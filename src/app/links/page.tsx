"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { LinksBoard } from "@/components/LinksBoard";
import { useAuth } from "@/context/AuthContext";
import { hasMentoring, loadStudentCourses, type StudentCourse } from "@/lib/courses";

/** Полезные ссылки для ученика — по его курсам. */
export default function StudentLinksPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<{ id: string; name: string }[] | null>(null);
  const [tab, setTab] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.studentId) return;
    let cancelled = false;
    void loadStudentCourses(user.studentId).then((list: StudentCourse[]) => {
      if (cancelled) return;
      const out = [
        ...(hasMentoring(list) ? [{ id: "mentoring", name: "Менторство" }] : []),
        ...list.filter((c) => c.course_id !== "mentoring").map((c) => ({ id: c.course_id, name: c.course_name })),
      ];
      setCourses(out);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.studentId]);

  const current = tab ?? courses?.[0]?.id ?? null;
  return (
    <RequireAuth role="student">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Материалы</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Полезные ссылки</h2>
        </div>
        {courses && courses.length > 1 ? (
          <div role="tablist" className="flex w-fit gap-1 rounded-full border border-white/10 p-1">
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={current === c.id}
                onClick={() => setTab(c.id)}
                className={`rounded-full px-5 py-2 text-sm ${current === c.id ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}
        {current ? <LinksBoard key={current} courseId={current} editable={false} /> : <p className="text-sm text-muted">Загрузка…</p>}
      </div>
    </RequireAuth>
  );
}
