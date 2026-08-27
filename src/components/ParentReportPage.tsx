"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStudents } from "@/context/StudentsContext";
import { ReportPageShell } from "@/components/ReportPageShell";
import { StudentReportView } from "@/components/StudentReportView";
import { Button } from "@/components/ui/Button";
import type { StudentProfile } from "@/lib/types";
import type { ReportType } from "@/lib/report-types";

export function ParentReportPage({
  studentToken,
  reportType,
}: {
  studentToken: string;
  reportType: ReportType;
}) {
  const { fetchStudentByToken } = useStudents();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const next = await fetchStudentByToken(studentToken);
      if (!cancelled) {
        setStudent(next);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentToken, fetchStudentByToken]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted">
        Загрузка отчёта…
      </div>
    );
  }

  if (!student) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h2 className="text-xl font-semibold text-navy">Ссылка недействительна</h2>
        <p className="mt-2 text-sm text-muted">
          Гостевой токен не найден или был обновлён ментором.
        </p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="secondary">На главную</Button>
        </Link>
      </div>
    );
  }

  const base = `/parent/${studentToken}`;

  return (
    <ReportPageShell
      student={student}
      reportType={reportType}
      shortHref={`${base}/short`}
      longHref={`${base}/long`}
      backHref={base}
      backLabel="← Выбор отчёта"
    >
      <StudentReportView student={student} reportType={reportType} />
    </ReportPageShell>
  );
}
