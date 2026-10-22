import type { MonthlyProgressReview, StudentProfile } from "@/lib/types";
import { currentMonthYearLabel } from "@/lib/monthly-progress";
import { homeworkRating, type Meeting } from "@/lib/meetings";
import type { Deadline } from "@/lib/deadlines";
import { termLabel, type TermGrade } from "@/lib/term-grades";
import { essayScore, essaySummary, type EssaySubmission } from "@/lib/essays";

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function dayMonth(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_GEN[(m || 1) - 1]}`;
}

function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function fmt(v: number): string {
  return v.toFixed(1).replace(".0", "");
}

export interface MonthData {
  student: StudentProfile;
  meetings: Meeting[];
  deadlines: Deadline[];
  grades: TermGrade[];
  essays: EssaySubmission[];
}

export interface MonthFacts {
  prefix: string; // YYYY-MM
  label: string;
  individual: { held: number; attended: number; late: number; absent: number };
  group: { held: number; attended: number; late: number; absent: number };
  homeworkAverage: number | null;
  homeworkCompletion: number; // 0–100
  meetings: Meeting[];
  submittedDeadlines: Deadline[];
  missedDeadlines: Deadline[];
  upcomingDeadlines: Deadline[];
  essaysAccepted: EssaySubmission[];
  essaysSubmitted: number;
  essaysRevision: number;
  essaysTotalAccepted: number;
  essaysAverage: number | null;
  gpaLine: string;
  sprintsDone: StudentProfile["sprintTasks"];
  sprintsOpen: StudentProfile["sprintTasks"];
}

/** «2026-10» из Date */
export function monthPrefix(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function lastDayIso(prefix: string): string {
  const [y, m] = prefix.split("-").map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${prefix}-${String(d).padStart(2, "0")}`;
}

/** Все факты месяца из журнала, дедлайнов, оценок и эссе. */
export function collectMonthFacts(data: MonthData, prefix: string): MonthFacts {
  const [y, m] = prefix.split("-").map(Number);
  const label = currentMonthYearLabel(new Date(y, m - 1, 1));
  const inMonth = (iso: string | null | undefined) => Boolean(iso && iso.startsWith(prefix));
  const meetings = data.meetings.filter((x) => inMonth(x.meetingDate)).sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));

  const count = (format: Meeting["format"]) => {
    const list = meetings.filter((x) => x.format === format);
    return {
      held: list.length,
      attended: list.filter((x) => x.attendance === "present" || x.attendance === "late").length,
      late: list.filter((x) => x.attendance === "late").length,
      absent: list.filter((x) => x.attendance === "absent").length,
    };
  };

  const hw = meetings.map(homeworkRating).filter((v): v is number => v !== null);
  const homeworkAverage = avg(hw);

  const end = lastDayIso(prefix);
  const monthDeadlines = data.deadlines.filter((d) => inMonth(d.dueDate));
  const submittedDeadlines = monthDeadlines.filter((d) => d.status === "submitted");
  const missedDeadlines = monthDeadlines.filter((d) => d.status === "planned" && d.dueDate < new Date().toISOString().slice(0, 10));
  const upcomingDeadlines = data.deadlines
    .filter((d) => d.status === "planned" && d.dueDate > end)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  const essaysAccepted = data.essays.filter((e) => e.status === "accepted" && inMonth(e.reviewedAt));
  const essaysSubmitted = data.essays.filter((e) => inMonth(e.submittedAt)).length;
  const essaysRevision = data.essays.filter((e) => e.status === "revision" && inMonth(e.reviewedAt)).length;
  const essaysTotalAccepted = essaySummary(data.essays.filter((e) => !e.reviewedAt || e.reviewedAt.slice(0, 7) <= prefix)).accepted;
  const essaysAverage = avg(essaysAccepted.map(essayScore).filter((v): v is number => v !== null));

  // GPA: последняя внесённая четверть и изменение к предыдущей
  const graded = data.grades.filter((g) => g.gpa !== null && g.verified);
  let gpaLine = "";
  if (graded.length) {
    const last = graded[graded.length - 1];
    const prev = graded[graded.length - 2];
    const diff = prev?.gpa != null && last.gpa != null ? last.gpa - prev.gpa : null;
    gpaLine = `GPA за ${termLabel(data.student.termSystem, last.termNumber)} ${last.academicYear}: ${last.gpa?.toFixed(2)}`;
    if (diff !== null) {
      gpaLine += ` (${diff === 0 ? "без изменений" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)} к прошлому периоду`})`;
    }
  }

  const monthName = MONTHS_NOM[m - 1];
  const sprintsNow = data.student.sprintTasks.filter(
    (t) => t.sprintLabel.toLowerCase().includes(monthName) && t.sprintLabel.includes(String(y)),
  );

  return {
    prefix,
    label,
    individual: count("individual"),
    group: count("group"),
    homeworkAverage,
    homeworkCompletion: homeworkAverage === null ? 0 : Math.round(homeworkAverage * 10),
    meetings,
    submittedDeadlines,
    missedDeadlines,
    upcomingDeadlines,
    essaysAccepted,
    essaysSubmitted,
    essaysRevision,
    essaysTotalAccepted,
    essaysAverage,
    gpaLine,
    sprintsDone: sprintsNow.filter((t) => t.completed),
    sprintsOpen: sprintsNow.filter((t) => !t.completed),
  };
}

function lines(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join("\n");
}

/** Черновик Monthly Review: только то, что видно из данных. Тексты-оценки пишет ментор. */
export function buildMonthlyDraft(f: MonthFacts, student: StudentProfile): Partial<MonthlyProgressReview> {
  const summaries = f.meetings
    .filter((x) => x.summary.trim())
    .map((x) => `• ${dayMonth(x.meetingDate)}: ${x.summary.trim().split("\n")[0]}`);

  const activeProjects = student.projects.filter((p) => p.title.trim()).slice(0, 3);

  const highlights = lines(
    ...f.submittedDeadlines.map((d) => `• Подал: ${d.title} (${dayMonth(d.dueDate)})`),
    f.essaysAccepted.length > 0 &&
      `• Сдано эссе: ${f.essaysAccepted.length}${f.essaysAverage !== null ? `, средняя оценка ${fmt(f.essaysAverage)}/10` : ""}`,
    f.individual.held + f.group.held > 0 &&
      f.individual.absent + f.group.absent === 0 &&
      "• Ни одного пропуска за месяц",
    f.homeworkAverage !== null && f.homeworkAverage >= 8 && `• Сильные домашки: в среднем ${fmt(f.homeworkAverage)}/10`,
    ...f.sprintsDone.map((t) => `• Спринт выполнен: ${t.title}`),
  );

  const growth = lines(
    f.individual.absent + f.group.absent > 0 &&
      `• Пропуски: ${f.individual.absent + f.group.absent}${f.individual.absent ? ` (индивидуальных — ${f.individual.absent})` : ""}`,
    f.individual.late + f.group.late > 0 && `• Опоздания: ${f.individual.late + f.group.late}`,
    f.homeworkAverage !== null && f.homeworkAverage < 6 && `• Домашка: в среднем ${fmt(f.homeworkAverage)}/10 — подтянуть качество`,
    ...f.missedDeadlines.map((d) => `• Не подал: ${d.title} (${dayMonth(d.dueDate)})`),
    f.essaysRevision > 0 && `• Эссе на доработке: ${f.essaysRevision}`,
    ...f.sprintsOpen.map((t) => `• Спринт не завершён: ${t.title}`),
  );

  return {
    monthYear: f.label,
    individualSessionsAttended: f.individual.held ? f.individual.attended : null,
    groupSessionsAttended: f.group.held ? f.group.attended : null,
    homeworkCompletion: f.homeworkCompletion,
    personalProgressNotes: summaries.length ? lines("Что обсуждали на встречах:", ...summaries) : "",
    academicStatus: f.gpaLine,
    academicSkills:
      f.essaysSubmitted || f.essaysTotalAccepted
        ? lines(
            `Эссе: за месяц сдано ${f.essaysAccepted.length}, всего ${f.essaysTotalAccepted} из 100.`,
            f.essaysAverage !== null && `Средняя оценка за месяц: ${fmt(f.essaysAverage)}/10.`,
          )
        : "",
    mainProjectProgress: activeProjects.length
      ? activeProjects.map((p) => `• ${p.title}${p.status ? ` — ${p.status}` : ""}`).join("\n")
      : "",
    parallelActivities: lines(
      ...f.submittedDeadlines.map((d) => `• ${d.title} — подал`),
      ...f.upcomingDeadlines.map((d) => `• ${d.title} — готовится, дедлайн ${dayMonth(d.dueDate)}`),
    ),
    highlights,
    growthAreas: growth,
  };
}

/** Заполнить только пустые поля существующего обзора. */
export function mergeIntoEmpty(review: MonthlyProgressReview, draft: Partial<MonthlyProgressReview>): MonthlyProgressReview {
  const next = { ...review };
  for (const [k, v] of Object.entries(draft) as [keyof MonthlyProgressReview, unknown][]) {
    const cur = next[k];
    const empty = cur === null || cur === "" || (k === "homeworkCompletion" && cur === 0);
    if (empty && v !== undefined) (next as Record<string, unknown>)[k] = v;
  }
  return next;
}
