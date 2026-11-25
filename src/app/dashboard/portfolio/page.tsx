"use client";

import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { PortfolioView } from "@/components/PortfolioView";
import { useAuth } from "@/context/AuthContext";
import { useStudents } from "@/context/StudentsContext";
import { canOpenMentoring } from "@/lib/staff";

export default function StudentPortfolioPage() {
  const { user } = useAuth();
  const { getStudent } = useStudents();
  const student = user?.studentId ? getStudent(user.studentId) : undefined;
  return (
    <RequireAuth role="student" allow={canOpenMentoring}>
      <div className="sp-rise mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/dashboard" className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline print:hidden">
          ← В кабинет
        </Link>
        <div className="print:hidden">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Портфолио</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Мои активности</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Всё, что пригодится для поступления, в одном списке. Олимпиады с результатами, проекты и экзамены попадают сюда сами. Волонтёрство, клубы, спорт и лидерство добавляйте сами — ментор подтвердит.
          </p>
        </div>
        {student ? <PortfolioView student={student} mode="student" /> : <p className="text-sm text-muted">Загрузка…</p>}
      </div>
    </RequireAuth>
  );
}
