"use client";

import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { VisionMapView } from "@/components/VisionMapView";
import { useAuth } from "@/context/AuthContext";
import { useStudents } from "@/context/StudentsContext";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Vision Map ученика: смотрит всю карту, сам меняет только свои цели года. */
export default function StudentVisionPage() {
  const { user } = useAuth();
  const { getStudent, loading, refreshStudents } = useStudents();
  const student = user?.studentId ? getStudent(user.studentId) : undefined;
  const timer = useRef<number | undefined>(undefined);
  const [draft, setDraft] = useState<typeof student>(undefined);

  return (
    <RequireAuth role="student">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/dashboard" className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline">
          ← В кабинет
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Vision Map</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Мои цели на год</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Карту составляет ментор. Свои цели года (раздел Future Review внизу) ты можешь вписывать и отмечать сам.
          </p>
        </div>
        {loading && !student ? (
          <p className="text-sm text-muted">Загрузка…</p>
        ) : student ? (
          <VisionMapView
            student={draft ?? student}
            goalsEditable
            onChange={(patch) => {
              const vm = patch.visionMap;
              if (!vm) return;
              setDraft({ ...(draft ?? student), visionMap: vm });
              // Сохраняем через полсекунды после последней правки
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => {
                const supabase = createClient();
                void supabase
                  .rpc("update_my_vision_goals", {
                    p_academic: vm.futureAcademicGoals,
                    p_other: vm.futureOtherGoals,
                  })
                  .then(({ error }) => {
                    if (error) console.error(error);
                    else void refreshStudents();
                  });
              }, 500);
            }}
          />
        ) : null}
      </div>
    </RequireAuth>
  );
}
