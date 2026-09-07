import type { MonthlyProgressReview } from "@/lib/types";

export function currentMonthYearLabel(date = new Date()): string {
  const label = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function createEmptyMonthlyProgressReview(
  monthYear = currentMonthYearLabel(),
): MonthlyProgressReview {
  return {
    id: `mpr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    monthYear,
    individualSessionsAttended: null,
    groupSessionsAttended: null,
    homeworkCompletion: 0,
    personalFocus: "",
    personalProgressNotes: "",
    academicStatus: "",
    problemSubjectsProgress: "",
    academicSkills: "",
    mainProjectProgress: "",
    parallelActivities: "",
    highlights: "",
    growthAreas: "",
    mentorFeedback: "",
    studentReflection: "",
  };
}

export function clampAttendanceOutOfTwo(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(2, Math.round(value)));
}

export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
