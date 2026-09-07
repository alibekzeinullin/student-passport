"use client";

import { useState } from "react";
import { useStudents } from "@/context/StudentsContext";
import { RequireAuth } from "@/components/RequireAuth";
import { ReportPageShell } from "@/components/ReportPageShell";
import { StudentReportView } from "@/components/StudentReportView";
import type { ReportType } from "@/lib/report-types";
import type { StudentProfile } from "@/lib/types";

function formatSaveError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "Неизвестная ошибка");

  if (
    message.includes("monthly_progress_reviews") ||
    message.includes("vision_map") ||
    message.toLowerCase().includes("column") ||
    message.toLowerCase().includes("schema cache")
  ) {
    return "В Supabase ещё нет новых колонок. Откройте SQL Editor и выполните файл supabase/migration-monthly-vision.sql, затем обновите страницу.";
  }

  return `Не удалось сохранить: ${message}`;
}

export function AdminReportPage({
  studentId,
  reportType,
}: {
  studentId: string;
  reportType: ReportType;
}) {
  const { getStudent, loading, updateStudent } = useStudents();
  const student = getStudent(studentId);
  const [saveError, setSaveError] = useState("");

  const handleChange = async (patch: Partial<StudentProfile>) => {
    setSaveError("");
    try {
      await updateStudent(studentId, patch);
    } catch (error) {
      console.error(error);
      setSaveError(formatSaveError(error));
    }
  };

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
          <>
            {saveError ? (
              <div className="rounded-lg border border-burgundy/30 bg-burgundy/5 px-4 py-3 text-sm text-burgundy">
                {saveError}
              </div>
            ) : null}
            <ReportPageShell
              student={student}
              reportType={reportType}
              basePath={`/admin/students/${studentId}`}
              backHref={`/admin/students/${studentId}`}
              backLabel="← К редактированию профиля"
            >
              <StudentReportView
                student={student}
                reportType={reportType}
                editable
                onChange={(patch) => {
                  void handleChange(patch);
                }}
              />
            </ReportPageShell>
          </>
        )}
      </div>
    </RequireAuth>
  );
}
