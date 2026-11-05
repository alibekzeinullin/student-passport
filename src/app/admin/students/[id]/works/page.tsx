"use client";

import { use } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { WorksBoard } from "@/components/works/WorksBoard";
import { useStudents } from "@/context/StudentsContext";

export default function AdminStudentWorksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getStudent } = useStudents();
  const student = getStudent(id);
  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <Link href={`/admin/students/${id}`} className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline">
          ← К ученику
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Проекты и исследования</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">
            {student ? `${student.firstName} ${student.lastName}` : "Ученик"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Этапы, сроки и ваши комментарии к этапам — ученик и родители их видят.
          </p>
        </div>
        <WorksBoard studentId={id} mode="admin" />
      </div>
    </RequireAuth>
  );
}
