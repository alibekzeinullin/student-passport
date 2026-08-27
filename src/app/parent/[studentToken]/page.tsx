"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useStudents } from "@/context/StudentsContext";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { REPORT_DESCRIPTIONS, REPORT_LABELS } from "@/lib/report-types";
import type { StudentProfile } from "@/lib/types";

export default function ParentHubPage({
  params,
}: {
  params: Promise<{ studentToken: string }>;
}) {
  const { studentToken } = use(params);
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
        Загрузка…
      </div>
    );
  }

  if (!student) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h2 className="text-xl font-semibold text-navy">Ссылка недействительна</h2>
        <p className="mt-2 text-sm text-muted">
          Гостевой токен не найден или был обновлён ментором. Запросите новую
          ссылку у администратора программы.
        </p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="secondary">На главную</Button>
        </Link>
      </div>
    );
  }

  const base = `/parent/${studentToken}`;

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-burgundy">
          Родитель / Гость
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-navy">
          {student.lastName} {student.firstName}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Выберите отчёт: краткосрочный — для ежемесячных обновлений, долгосрочный — полный паспорт.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["short", "long"] as const).map((type) => (
          <Link key={type} href={`${base}/${type}`} className="group block">
            <Card className="h-full transition group-hover:border-burgundy/40 group-hover:shadow-md">
              <CardBody className="space-y-3">
                <h3 className="text-lg font-semibold text-navy">
                  {REPORT_LABELS[type]}
                </h3>
                <p className="text-sm leading-relaxed text-muted">
                  {REPORT_DESCRIPTIONS[type]}
                </p>
                <span className="inline-block text-sm font-medium text-burgundy group-hover:underline">
                  Открыть →
                </span>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
