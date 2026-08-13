import type { StudentProfile } from "./types";

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function latestGpa(student: StudentProfile): number | null {
  const values = [
    student.gpa.july2027,
    student.gpa.january2027,
    student.gpa.start,
  ].filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  return values.length ? values[0] : null;
}

function gpaScore(student: StudentProfile): number {
  const gpa = latestGpa(student);
  if (gpa === null) return 0;
  // 4.0 scale → 100 баллов
  return clamp((gpa / 4) * 100);
}

function academicActivitiesScore(student: StudentProfile): number {
  if (student.academicActivities.length === 0) return 0;
  const points = student.academicActivities.reduce((sum, item) => {
    const byStatus =
      item.status === "Завершено"
        ? 22
        : item.status === "В процессе"
          ? 14
          : item.status === "Подана"
            ? 10
            : 6;
    return sum + byStatus;
  }, 0);
  return clamp(points);
}

function projectsScore(student: StudentProfile): number {
  if (student.projects.length === 0) return 0;
  const points = student.projects.reduce((sum, item) => {
    const byStatus =
      item.status === "Завершён"
        ? 28
        : item.status === "В работе"
          ? 18
          : item.status === "На паузе"
            ? 10
            : 8;
    return sum + byStatus;
  }, 0);
  return clamp(points);
}

function booksScore(student: StudentProfile): number {
  if (student.books.length === 0) return 0;
  const points = student.books.reduce((sum, item) => {
    const byStatus =
      item.status === "Прочитано" ? 28 : item.status === "Читаю" ? 16 : 8;
    return sum + byStatus;
  }, 0);
  return clamp(points);
}

function skillsScore(student: StudentProfile): number {
  if (student.skills.length === 0) return 0;
  const points = student.skills.reduce((sum, item) => {
    const byStatus =
      item.status === "Освоен"
        ? 28
        : item.status === "В процессе"
          ? 16
          : 8;
    return sum + byStatus;
  }, 0);
  return clamp(points);
}

/**
 * Автоматический балл академических успехов (0–100).
 * Учитывает GPA, академ активность, проекты, книги и навыки.
 */
export function calculateAcademicSuccessScore(student: StudentProfile): number {
  const weighted =
    gpaScore(student) * 0.3 +
    academicActivitiesScore(student) * 0.25 +
    projectsScore(student) * 0.2 +
    booksScore(student) * 0.125 +
    skillsScore(student) * 0.125;

  return Math.round(clamp(weighted));
}

export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.round(clamp(value));
}
