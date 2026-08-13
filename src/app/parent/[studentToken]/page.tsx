"use client";

import { use } from "react";
import Link from "next/link";
import { useStudents } from "@/context/StudentsContext";
import { StudentDashboard } from "@/components/StudentDashboard";
import { Button } from "@/components/ui/Button";

export default function ParentPage({
  params,
}: {
  params: Promise<{ studentToken: string }>;
}) {
  const { studentToken } = use(params);
  const { getStudentByToken } = useStudents();
  const student = getStudentByToken(studentToken);

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <StudentDashboard studentId={student.id} accessMode="parent" />
    </div>
  );
}
