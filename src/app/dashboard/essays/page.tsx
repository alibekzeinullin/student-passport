"use client";

import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { StudentEssays } from "@/components/essays/StudentEssays";
import { useAuth } from "@/context/AuthContext";

export default function StudentEssaysPage() {
  const { user } = useAuth();
  return (
    <RequireAuth role="student">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/dashboard" className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline">
          ← В кабинет
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Эссе</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">100 тем — сколько ты уже сдал</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Выбери тему, напиши 250–300 слов и сдай на проверку. Ментор оценит по 4 критериям и напишет комментарий. Если вернут на доработку — исправь и сдай новую версию.
          </p>
        </div>
        {user?.studentId ? <StudentEssays studentId={user.studentId} /> : null}
      </div>
    </RequireAuth>
  );
}
