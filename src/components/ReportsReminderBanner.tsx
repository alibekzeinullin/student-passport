"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { almatyToday, monthNominative, reminderMonth } from "@/lib/parent-report";

/**
 * Плашка в конце месяца (последние 3 дня и 1–5 число): сколько отчётов родителям отправлено.
 * Когда всё отправлено — не показывается.
 */
export function ReportsReminderBanner({ studentIds }: { studentIds: string[] }) {
  const month = reminderMonth(almatyToday());
  const [sent, setSent] = useState<number | null>(null);
  const key = studentIds.join(",");

  useEffect(() => {
    if (!month || !isSupabaseConfigured() || !key) return;
    let cancelled = false;
    void createClient()
      .from("parent_reports")
      .select("student_id")
      .eq("month", month)
      .eq("status", "sent")
      .then(({ data }) => {
        if (cancelled) return;
        const ids = new Set(key.split(","));
        setSent(((data as { student_id: string }[] | null) ?? []).filter((r) => ids.has(r.student_id)).length);
      });
    return () => {
      cancelled = true;
    };
  }, [month, key]);

  if (!month || sent === null || sent >= studentIds.length) return null;
  return (
    <Link
      href="/admin/reports"
      className="group flex items-center justify-between gap-4 rounded-3xl border border-gold/40 bg-gold/[0.08] px-5 py-4 transition hover:border-gold/70"
    >
      <span>
        <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-gold">Конец месяца</span>
        <span className="mt-1 block text-navy">
          Отчёты родителям за {monthNominative(month)}: отправлено {sent} из {studentIds.length}
        </span>
      </span>
      <span className="text-gold transition group-hover:translate-x-1" aria-hidden>
        →
      </span>
    </Link>
  );
}
