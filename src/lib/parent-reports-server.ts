import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbStudent } from "@/lib/supabase/database.types";
import { mapDbStudentToProfile } from "@/lib/supabase/mappers";
import { MEETING_COLUMNS, mapMeeting, type DbMeeting } from "@/lib/meetings";
import { mapDeadline, type DbDeadline } from "@/lib/deadlines";
import { mapSubmission, type DbSubmission } from "@/lib/essays";
import { collectMonthFacts } from "@/lib/monthly-draft";
import { all } from "@/lib/monthly-auto";
import { buildReportMessage, type MeetingParentNote, type ReportFacts } from "@/lib/parent-report";

export interface ReportRow {
  id: string;
  student_id: string;
  month: string;
  overall: string;
  group_note: string;
  help: string;
  message: string;
  status: "draft" | "sent";
  sent_at: string | null;
  read_at: string | null;
  question_at: string | null;
}

export interface StudentReportData {
  studentId: string;
  name: string;
  firstName: string;
  className: string;
  parentLink: string;
  telegram: { linked: boolean; title: string; code: string | null };
  facts: ReportFacts;
  notes: MeetingParentNote[];
  report: ReportRow | null;
}

interface TelegramRow {
  student_id: string;
  chat_id: number | null;
  chat_title: string;
  link_code: string | null;
}

interface NotesRow {
  meeting_id: string;
  parent_win?: string | null;
  parent_focus?: string | null;
  parent_help?: string | null;
}

/** Ученики менторства (не на паузе и не «только SAT»). */
async function mentoringStudents(admin: SupabaseClient): Promise<(DbStudent & { status?: string | null })[]> {
  const students = await all<DbStudent & { status?: string | null }>(admin, "students");
  const enr = await all<{ student_id: string; course_id: string; ends_on: string | null }>(admin, "enrollments", "student_id, course_id, ends_on");
  const courses = new Map<string, Set<string>>();
  enr.filter((e) => !e.ends_on).forEach((e) => courses.set(e.student_id, (courses.get(e.student_id) ?? new Set()).add(e.course_id)));
  return students.filter((s) => s.status !== "paused" && (!courses.has(s.id) || courses.get(s.id)?.has("mentoring")));
}

export async function loadReportsData(admin: SupabaseClient, month: string, origin: string, onlyStudent?: string): Promise<StudentReportData[]> {
  let students = await mentoringStudents(admin);
  if (onlyStudent) students = students.filter((s) => s.id === onlyStudent);

  const [meetingsRaw, deadlinesRaw, essaysRaw, telegram, reports] = await Promise.all([
    all<DbMeeting>(admin, "meetings", MEETING_COLUMNS),
    all<DbDeadline>(admin, "student_deadlines"),
    all<DbSubmission>(admin, "essay_submissions"),
    all<TelegramRow>(admin, "student_telegram", "student_id, chat_id, chat_title, link_code"),
    all<ReportRow>(admin, "parent_reports"),
  ]);
  const meetings = meetingsRaw.map(mapMeeting);
  const monthMeetings = meetings.filter((m) => m.meetingDate.startsWith(month) && m.format === "individual");

  const notesById = new Map<string, NotesRow>();
  const ids = monthMeetings.map((m) => m.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin
      .from("meeting_mentor_notes")
      .select("meeting_id, parent_win, parent_focus, parent_help")
      .in("meeting_id", ids.slice(i, i + 100));
    if (error) throw error;
    ((data as NotesRow[]) ?? []).forEach((n) => notesById.set(n.meeting_id, n));
  }

  const deadlines = deadlinesRaw.map(mapDeadline);
  const essays = essaysRaw.map(mapSubmission);
  const tgBy = new Map(telegram.map((t) => [t.student_id, t]));
  const reportBy = new Map(reports.filter((r) => r.month === month).map((r) => [r.student_id, r]));

  return students
    .map((row) => {
      const student = mapDbStudentToProfile(row);
      const facts = collectMonthFacts(
        {
          student,
          meetings: meetings.filter((m) => m.studentId === student.id),
          deadlines: deadlines.filter((d) => d.studentId === student.id),
          grades: [],
          essays: essays.filter((e) => e.studentId === student.id),
        },
        month,
      );
      const notes: MeetingParentNote[] = monthMeetings
        .filter((m) => m.studentId === student.id)
        .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))
        .map((m) => {
          const n = notesById.get(m.id);
          return { date: m.meetingDate, win: n?.parent_win ?? "", focus: n?.parent_focus ?? "", help: n?.parent_help ?? "" };
        });
      const tg = tgBy.get(student.id);
      return {
        studentId: student.id,
        name: `${student.lastName} ${student.firstName}`.trim(),
        firstName: student.firstName || student.lastName,
        className: student.className,
        parentLink: `${origin}/parent/${student.parentAccessToken}`,
        telegram: { linked: Boolean(tg?.chat_id), title: tg?.chat_title ?? "", code: tg?.link_code ?? null },
        facts: {
          individualHeld: facts.individual.held,
          individualAttended: facts.individual.attended,
          groupHeld: facts.group.held,
          groupAttended: facts.group.attended,
          homeworkCompletion: facts.homeworkAverage === null ? null : facts.homeworkCompletion,
          essaysAccepted: facts.essaysAccepted.length,
          essaysAverage: facts.essaysAverage,
          essaysSubmitted: facts.essaysSubmitted,
          deadlinesSubmitted: facts.submittedDeadlines.map((d) => d.title),
        },
        notes,
        report: reportBy.get(student.id) ?? null,
      } satisfies StudentReportData;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function messageFor(data: StudentReportData, month: string, draft: { overall: string; groupNote: string; help: string }): string {
  return buildReportMessage({
    firstName: data.firstName,
    month,
    overall: draft.overall,
    groupNote: draft.groupNote,
    help: draft.help,
    facts: data.facts,
    notes: data.notes,
    link: data.parentLink,
  });
}
