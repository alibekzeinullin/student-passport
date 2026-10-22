import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { EducationSystem, TermSystem } from "@/lib/types";

export const TERM_SYSTEM_LABELS: Record<TermSystem, string> = {
  quarters: "4 четверти",
  trimesters: "3 триместра",
  semesters: "2 полугодия",
};

export const TERM_COUNT: Record<TermSystem, number> = {
  quarters: 4,
  trimesters: 3,
  semesters: 2,
};

const TERM_NAME: Record<TermSystem, string> = {
  quarters: "четверть",
  trimesters: "триместр",
  semesters: "полугодие",
};

export function termLabel(system: TermSystem, n: number, short = false): string {
  if (short) {
    const letter = system === "quarters" ? "Ч" : system === "trimesters" ? "Т" : "П";
    return `${n}${letter}`;
  }
  return `${n} ${TERM_NAME[system]}`;
}

export interface TermGrade {
  id: string;
  studentId: string;
  academicYear: string; // «2026–27»
  termNumber: number;
  gpa: number | null;
  /** false — внёс ученик, ждёт проверки ментора */
  verified: boolean;
}

interface DbTermGrade {
  id: string;
  student_id: string;
  academic_year: string;
  term_number: number;
  gpa: number | string | null;
  verified?: boolean | null;
}

function mapGrade(row: DbTermGrade): TermGrade {
  return {
    id: row.id,
    studentId: row.student_id,
    academicYear: row.academic_year,
    termNumber: row.term_number,
    gpa: row.gpa === null ? null : Number(row.gpa),
    verified: row.verified !== false,
  };
}

function sortGrades(list: TermGrade[]): TermGrade[] {
  return [...list].sort(
    (a, b) =>
      a.academicYear.localeCompare(b.academicYear) || a.termNumber - b.termNumber,
  );
}

/** Учебный год сентябрь–август: в октябре 2026 → «2026–27». */
export function currentAcademicYear(date = new Date()): string {
  const y = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}

export function shiftAcademicYear(year: string, delta: number): string {
  const start = Number.parseInt(year, 10) + delta;
  return `${start}–${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Шкала оценки: IB — до 7, остальные — до 5. */
export function gpaScaleMax(system: EducationSystem): number {
  return system === "IB" ? 7 : 5;
}

export async function fetchTermGrades(studentId: string): Promise<TermGrade[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("term_grades")
    .select("*")
    .eq("student_id", studentId);
  if (error) throw error;
  return sortGrades(((data as DbTermGrade[]) ?? []).map(mapGrade));
}

export async function fetchTermGradesByParentToken(
  token: string,
): Promise<TermGrade[]> {
  if (!isSupabaseConfigured() || !token) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_term_grades_by_parent_token", {
    p_token: token,
  });
  if (error) throw error;
  return sortGrades(((data as DbTermGrade[]) ?? []).map(mapGrade));
}

/** Ментор: поставить или стереть GPA за четверть. */
export async function saveTermGrade(
  studentId: string,
  academicYear: string,
  termNumber: number,
  gpa: number | null,
): Promise<void> {
  const supabase = createClient();
  if (gpa === null) {
    const { error } = await supabase
      .from("term_grades")
      .delete()
      .eq("student_id", studentId)
      .eq("academic_year", academicYear)
      .eq("term_number", termNumber);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("term_grades").upsert(
    {
      student_id: studentId,
      academic_year: academicYear,
      term_number: termNumber,
      gpa,
    },
    { onConflict: "student_id,academic_year,term_number" },
  );
  if (error) throw error;
}

/** Ментор: подтвердить оценку, которую внёс ученик. */
export async function verifyTermGrade(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("term_grades").update({ verified: true }).eq("id", id);
  if (error) throw error;
}

/** Ментор: все непроверенные оценки (для «Что требует внимания»). */
export async function fetchUnverifiedGrades(): Promise<TermGrade[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data, error } = await supabase.from("term_grades").select("*").eq("verified", false);
  if (error) throw error;
  return ((data as DbTermGrade[]) ?? []).map(mapGrade);
}
