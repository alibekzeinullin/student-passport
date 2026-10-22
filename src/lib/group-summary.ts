import type { StudentProfile } from "@/lib/types";
import { homeworkRating, reflectionAverage, type MeetingWithNotes } from "@/lib/meetings";
import type { Deadline } from "@/lib/deadlines";
import type { TermGrade } from "@/lib/term-grades";
import { essaySummary, type EssaySubmission } from "@/lib/essays";

export interface Range {
  from: string; // YYYY-MM-DD включительно
  to: string;
}

export interface StudentRow {
  student: StudentProfile;
  name: string;
  indHeld: number;
  indAttended: number;
  grpHeld: number;
  grpAttended: number;
  absences: number;
  hwAvg: number | null;
  essaysInPeriod: number;
  essaysTotal: number;
  deadlinesSubmitted: Deadline[];
  deadlinesMissed: Deadline[];
  gpa: number | null;
  gpaDiff: number | null;
}

export interface GroupTotals {
  students: number;
  paused: number;
  indSessions: number;
  grpSessions: number;
  attendancePct: number | null;
  hwAvg: number | null;
  essays: number;
  essaysTotal: number;
  deadlinesSubmitted: number;
  deadlinesMissed: number;
  reflectionAvg: number | null;
  reflectionCount: number;
}

const inRange = (iso: string | null | undefined, r: Range) => Boolean(iso && iso.slice(0, 10) >= r.from && iso.slice(0, 10) <= r.to);

function avg(v: number[]): number | null {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function previousRange(r: Range): Range {
  const from = new Date(`${r.from}T00:00:00`);
  const to = new Date(`${r.to}T00:00:00`);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const pTo = new Date(from);
  pTo.setDate(pTo.getDate() - 1);
  const pFrom = new Date(pTo);
  pFrom.setDate(pFrom.getDate() - days + 1);
  // Для целых месяцев — ровно предыдущие месяцы
  if (r.from.endsWith("-01")) {
    const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1;
    const f = new Date(from.getFullYear(), from.getMonth() - months, 1);
    const t = new Date(from.getFullYear(), from.getMonth(), 0);
    return { from: iso(f), to: iso(t) };
  }
  return { from: iso(pFrom), to: iso(pTo) };
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildGroupSummary(
  students: StudentProfile[],
  meetings: MeetingWithNotes[],
  deadlines: Deadline[],
  grades: TermGrade[],
  essays: EssaySubmission[],
  range: Range,
): { rows: StudentRow[]; totals: GroupTotals } {
  const active = students.filter((s) => s.status !== "paused");
  const today = iso(new Date());
  const periodMeetings = meetings.filter((m) => inRange(m.meetingDate, range));

  const rows: StudentRow[] = active.map((s) => {
    const own = periodMeetings.filter((m) => m.studentId === s.id);
    const ind = own.filter((m) => m.format === "individual");
    const grp = own.filter((m) => m.format === "group");
    const came = (list: MeetingWithNotes[]) => list.filter((m) => m.attendance === "present" || m.attendance === "late").length;
    const ownEssays = essays.filter((e) => e.studentId === s.id);
    const ownDeadlines = deadlines.filter((d) => d.studentId === s.id && inRange(d.dueDate, range));
    const g = grades.filter((x) => x.studentId === s.id && x.gpa !== null && x.verified);
    const last = g[g.length - 1];
    const prev = g[g.length - 2];
    return {
      student: s,
      name: `${s.lastName} ${s.firstName}`.trim(),
      indHeld: ind.length,
      indAttended: came(ind),
      grpHeld: grp.length,
      grpAttended: came(grp),
      absences: own.filter((m) => m.attendance === "absent").length,
      hwAvg: avg(own.map(homeworkRating).filter((v): v is number => v !== null)),
      essaysInPeriod: ownEssays.filter((e) => e.status === "accepted" && inRange(e.reviewedAt, range)).length,
      essaysTotal: essaySummary(ownEssays).accepted,
      deadlinesSubmitted: ownDeadlines.filter((d) => d.status === "submitted"),
      deadlinesMissed: ownDeadlines.filter((d) => d.status === "planned" && d.dueDate < today),
      gpa: last?.gpa ?? null,
      gpaDiff: last?.gpa != null && prev?.gpa != null ? last.gpa - prev.gpa : null,
    };
  });

  const activeIds = new Set(active.map((s) => s.id));
  const pm = periodMeetings.filter((m) => activeIds.has(m.studentId));
  const marked = pm.map((m) => m.attendance).filter((a) => a !== null);
  const grpDates = new Set(pm.filter((m) => m.format === "group").map((m) => m.meetingDate));
  const reflections = pm
    .map((m) => reflectionAverage(m.notes))
    .filter((v): v is number => v !== null);

  const totals: GroupTotals = {
    students: active.length,
    paused: students.length - active.length,
    indSessions: pm.filter((m) => m.format === "individual" && m.attendance !== "absent").length,
    grpSessions: grpDates.size,
    attendancePct: marked.length
      ? Math.round(avg(marked.map((a) => (a === "present" ? 100 : a === "late" ? 50 : 0))) ?? 0)
      : null,
    hwAvg: avg(pm.map(homeworkRating).filter((v): v is number => v !== null)),
    essays: rows.reduce((s, r) => s + r.essaysInPeriod, 0),
    essaysTotal: rows.reduce((s, r) => s + r.essaysTotal, 0),
    deadlinesSubmitted: rows.reduce((s, r) => s + r.deadlinesSubmitted.length, 0),
    deadlinesMissed: rows.reduce((s, r) => s + r.deadlinesMissed.length, 0),
    reflectionAvg: avg(reflections),
    reflectionCount: reflections.length,
  };

  return { rows: rows.sort((a, b) => a.name.localeCompare(b.name, "ru")), totals };
}
