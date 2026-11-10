"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StudentDashboard } from "@/components/StudentDashboard";
import { SatCourseTab } from "@/components/courses/SatCourseTab";
import { useAuth } from "@/context/AuthContext";
import { hasMentoring, loadStudentCourses, type StudentCourse } from "@/lib/courses";

const MENTORING = "mentoring";

export default function DashboardPage() {
  const { user } = useAuth();
  const studentId = user?.studentId;
  const [courses, setCourses] = useState<StudentCourse[] | null>(null);
  const [tab, setTab] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    void loadStudentCourses(studentId).then((list) => {
      if (!cancelled) setCourses(list);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const extra = (courses ?? []).filter((c) => c.course_id !== MENTORING);
  const tabs = [
    ...(courses && hasMentoring(courses) ? [{ id: MENTORING, label: "Менторство" }] : []),
    ...extra.map((c) => ({ id: c.course_id, label: c.course_name })),
  ];
  // Пока курсы грузятся — показываем менторство, как раньше
  const current = tab && tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? MENTORING);
  const course = extra.find((c) => c.course_id === current);

  return (
    <RequireAuth role="student">
      <div className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {tabs.length > 1 ? (
          <div role="tablist" aria-label="Курсы" className="mb-6 flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 sm:w-fit">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={current === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-full px-5 py-2 text-sm transition sm:flex-none ${
                  current === t.id ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        {studentId && current === MENTORING ? <StudentDashboard studentId={studentId} accessMode="student" /> : null}
        {course?.course_id === "sat" ? <SatCourseTab course={course} /> : null}
      </div>
    </RequireAuth>
  );
}
