import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthlyProgressReview } from "@/lib/types";
import type { DbStudent } from "@/lib/supabase/database.types";
import { mapDbStudentToProfile } from "@/lib/supabase/mappers";
import { MEETING_COLUMNS, mapMeeting, type DbMeeting } from "@/lib/meetings";
import { mapDeadline, type DbDeadline } from "@/lib/deadlines";
import { mapGrade, type DbTermGrade } from "@/lib/term-grades";
import { mapSubmission, type DbSubmission } from "@/lib/essays";
import { createEmptyMonthlyProgressReview } from "@/lib/monthly-progress";
import { buildMonthlyDraft, collectMonthFacts, mergeIntoEmpty } from "@/lib/monthly-draft";

function normalize(label: string): string {
  return label.toLowerCase().replace(/\s*г\.?\s*$/, "").replace(/\s+/g, " ").trim();
}

/** Прошлый месяц по времени Астаны: «2026-10» */
export function previousMonthPrefix(now = new Date()): string {
  const local = new Date(now.getTime() + 5 * 3600 * 1000);
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function all<T>(admin: SupabaseClient, table: string, columns = "*"): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + 999);
    if (error) {
      // Таблица ещё не создана — просто без этих данных
      if (/does not exist|schema cache|could not find/i.test(error.message)) return rows;
      throw error;
    }
    rows.push(...((data as T[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export interface AutoDraftResult {
  month: string;
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Собрать черновики Monthly Review за месяц у всех активных учеников.
 * Новый обзор помечается autoDraft; в уже существующем заполняются только пустые поля.
 */
export async function buildAllMonthlyDrafts(admin: SupabaseClient, prefix: string): Promise<AutoDraftResult> {
  const [studentsRaw, meetingsRaw, deadlinesRaw, gradesRaw, essaysRaw] = await Promise.all([
    all<DbStudent & { status?: string | null }>(admin, "students"),
    all<DbMeeting>(admin, "meetings", MEETING_COLUMNS),
    all<DbDeadline>(admin, "student_deadlines"),
    all<DbTermGrade>(admin, "term_grades"),
    all<DbSubmission>(admin, "essay_submissions"),
  ]);

  const meetings = meetingsRaw.map(mapMeeting);
  const deadlines = deadlinesRaw.map(mapDeadline);
  const grades = gradesRaw.map(mapGrade).sort(
    (a, b) => a.academicYear.localeCompare(b.academicYear) || a.termNumber - b.termNumber,
  );
  const essays = essaysRaw.map(mapSubmission);

  const result: AutoDraftResult = { month: prefix, created: 0, updated: 0, skipped: 0 };

  for (const row of studentsRaw) {
    if (row.status === "paused") {
      result.skipped += 1;
      continue;
    }
    const student = mapDbStudentToProfile(row);
    const own = {
      student,
      meetings: meetings.filter((m) => m.studentId === student.id),
      deadlines: deadlines.filter((d) => d.studentId === student.id),
      grades: grades.filter((g) => g.studentId === student.id),
      essays: essays.filter((e) => e.studentId === student.id),
    };
    const facts = collectMonthFacts(own, prefix);
    // Нечего собирать — не создаём пустой обзор
    if (facts.meetings.length === 0 && facts.essaysAccepted.length === 0 && facts.submittedDeadlines.length === 0) {
      result.skipped += 1;
      continue;
    }
    const draft = buildMonthlyDraft(facts, student);
    const reviews = student.monthlyProgressReviews ?? [];
    const existing = reviews.find((r) => normalize(r.monthYear) === normalize(facts.label));
    let next: MonthlyProgressReview[];
    if (existing) {
      const merged = mergeIntoEmpty(existing, draft);
      if (JSON.stringify(merged) === JSON.stringify(existing)) {
        result.skipped += 1;
        continue;
      }
      next = reviews.map((r) => (r.id === existing.id ? merged : r));
      result.updated += 1;
    } else {
      const fresh = { ...createEmptyMonthlyProgressReview(facts.label), ...draft, autoDraft: true } as MonthlyProgressReview;
      next = [fresh, ...reviews];
      result.created += 1;
    }
    const { error } = await admin.from("students").update({ monthly_progress_reviews: next }).eq("id", student.id);
    if (error) throw error;
  }
  return result;
}
