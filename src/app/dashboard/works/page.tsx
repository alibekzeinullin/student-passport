"use client";

import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { WorksBoard } from "@/components/works/WorksBoard";
import { useAuth } from "@/context/AuthContext";

export default function StudentWorksPage() {
  const { user } = useAuth();
  return (
    <RequireAuth role="student">
      <div className="sp-rise mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/dashboard" className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline">
          ← В кабинет
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Проекты и исследования</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Мои проекты и исследования</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Опиши идею, разбей работу на этапы со сроками и отмечай выполненное. Ментор оставляет комментарии к этапам, родители видят прогресс.
          </p>
        </div>
        {user?.studentId ? <WorksBoard studentId={user.studentId} mode="student" /> : null}
      </div>
    </RequireAuth>
  );
}
