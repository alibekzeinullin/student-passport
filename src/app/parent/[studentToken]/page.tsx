"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useStudents } from "@/context/StudentsContext";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import {
  REPORT_DESCRIPTIONS,
  REPORT_LABELS,
  REPORT_TYPES,
} from "@/lib/report-types";
import type { StudentProfile } from "@/lib/types";
import { MeetingsJournal } from "@/components/MeetingsJournal";
import { logParentVisit } from "@/lib/activity";
import { StudentOverview } from "@/components/StudentOverview";
import { TermGradesChart } from "@/components/TermGradesChart";

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
      if (next) logParentVisit(studentToken);
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
    <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      <div className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2.5 text-center text-sm text-navy">
        Режим родителя / гостя — только просмотр. Редактирование недоступно.
      </div>

      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
          Родитель / Гость
        </p>
        <h2 className="mt-2 text-3xl font-light tracking-tight text-navy sm:text-4xl">
          {student.lastName} {student.firstName}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Откройте любой раздел: полный паспорт, ежемесячный обзор или карту целей
          на год.
        </p>
      </div>

      <Link
        href={`${base}/month`}
        className="sp-glass group flex items-center justify-between gap-4 rounded-3xl border border-gold/30 px-5 py-4 transition hover:border-gold/60"
      >
        <span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-gold">Коротко</span>
          <span className="mt-1 block text-lg text-navy">Итоги месяца — посещаемость, домашки, эссе, главное</span>
        </span>
        <span className="text-gold transition group-hover:translate-x-1" aria-hidden>→</span>
      </Link>

      <StudentOverview student={student} mode="parent" parentToken={studentToken} />

      <TermGradesChart student={student} mode="parent" parentToken={studentToken} />

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        {REPORT_TYPES.map((type) => (
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

      <MeetingsJournal
        studentId={student.id}
        mode="parent"
        parentToken={studentToken}
      />
    </div>
  );
}
