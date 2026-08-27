"use client";

import Link from "next/link";
import { use } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { StudentDashboard } from "@/components/StudentDashboard";

export default function AdminStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <RequireAuth role="admin">
      <div className="mx-auto min-w-0 max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/admin"
          className="inline-flex text-sm font-medium text-muted underline-offset-2 hover:text-burgundy hover:underline"
        >
          ← К реестру учеников
        </Link>
        <StudentDashboard studentId={id} accessMode="admin" />
      </div>
    </RequireAuth>
  );
}
