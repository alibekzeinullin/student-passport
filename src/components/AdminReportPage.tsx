"use client";

import { useStudents } from "@/context/StudentsContext";
import { RequireAuth } from "@/components/RequireAuth";
import { ReportPageShell } from "@/components/ReportPageShell";
import { StudentReportView } from "@/components/StudentReportView";
import type { ReportType } from "@/lib/report-types";

export function AdminReportPage({
  studentId,
  reportType,
}: {
  studentId: string;
  reportType: ReportType;
}) {
  const { getStudent, loading } = useStudents();
  const student = getStudent(studentId);

  return (
    <RequireAuth role="admin">
      <div className="mx-auto min-w-0 max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
        {loading && !student ? (
          <div className="rounded-lg border border-light-gray bg-card p-8 text-center text-muted">
            Загрузка отчёта…
          </div>
        ) : !student ? (
          <div className="rounded-lg border border-light-gray bg-card p-8 text-center text-muted">
            Профиль ученика не найден.
          </div>
        ) : (
          <ReportPageShell
            student={student}
            reportType={reportType}
            shortHref={`/admin/students/${studentId}/short`}
            longHref={`/admin/students/${studentId}/long`}
            backHref={`/admin/students/${studentId}`}
            backLabel="← К редактированию профиля"
          >
            <StudentReportView student={student} reportType={reportType} />
          </ReportPageShell>
        )}
      </div>
    </RequireAuth>
  );
}
