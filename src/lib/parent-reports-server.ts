import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbStudent } from "@/lib/supabase/database.types";
import { mapDbStudentToProfile } from "@/lib/supabase/mappers";
import { MEETING_COLUMNS, mapMeeting, type DbMeeting } from "@/lib/meetings";
import { mapDeadline, type DbDeadline } from "@/lib/deadlines";
import { TOPICS_GOAL, essayScore, mapSubmission, type DbSubmission } from "@/lib/essays";
import { collectMonthFacts } from "@/lib/monthly-draft";
import { all } from "@/lib/monthly-auto";
import { nextStepText, type PlanEntry, PLAN_COLUMNS } from "@/lib/program-plan";
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
  /** «Что дальше» из плана года */
  next: string | null;
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
async function mentoringStudents(admin: SupabaseClient, onlyStudent?: string): Promise<(DbStudent & { status?: string | null })[]> {
  let q = admin.from("students").select("*");
  if (onlyStudent) q = q.eq("id", onlyStudent);
  const [{ data, error }, enr] = await Promise.all([
    q,
    all<{ student_id: string; course_id: string; ends_on: string | null }>(admin, "enrollments", "student_id, course_id, ends_on"),
  ]);
  if (error) throw error;
  const students = (data as (DbStudent & { status?: string | null })[]) ?? [];
  const courses = new Map<string, Set<string>>();
  enr.filter((e) => !e.ends_on).forEach((e) => courses.set(e.student_id, (courses.get(e.student_id) ?? new Set()).add(e.course_id)));
  return students.filter((s) => s.status !== "paused" && (!courses.has(s.id) || courses.get(s.id)?.has("mentoring")));
}

/** Все строки выборки порциями по 1000 (у Supabase лимит на ответ). */
async function paged<T>(make: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) {
      if (/does not exist|schema cache|could not find/i.test(error.message)) return rows;
      throw error;
    }
    const chunk = (data as T[]) ?? [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

function monthBounds(month: string): { from: string; to: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

export async function loadReportsData(admin: SupabaseClient, month: string, origin: string, onlyStudent?: string): Promise<StudentReportData[]> {
  const students = await mentoringStudents(admin, onlyStudent);
  const { from, to } = monthBounds(month);

  // только данные выбранного месяца — раньше читалась вся история, отсюда и задержки
  const [meetingsRaw, deadlinesRaw, essaysRaw, telegram, reports, planRes] = await Promise.all([
    paged<DbMeeting>(() => {
      const q = admin.from("meetings").select(MEETING_COLUMNS).gte("meeting_date", from).lt("meeting_date", to);
      return onlyStudent ? q.eq("student_id", onlyStudent) : q;
    }),
    paged<DbDeadline>(() => {
      const q = admin.from("student_deadlines").select("*").gte("due_date", from).lt("due_date", to);
      return onlyStudent ? q.eq("student_id", onlyStudent) : q;
    }),
    paged<DbSubmission>(() => {
      const q = admin
        .from("essay_submissions")
        .select("*")
        .or(`and(submitted_at.gte.${from},submitted_at.lt.${to}),and(reviewed_at.gte.${from},reviewed_at.lt.${to})`);
      return onlyStudent ? q.eq("student_id", onlyStudent) : q;
    }),
    paged<TelegramRow>(() => {
      const q = admin.from("student_telegram").select("student_id, chat_id, chat_title, link_code");
      return onlyStudent ? q.eq("student_id", onlyStudent) : q;
    }),
    paged<ReportRow>(() => {
      const q = admin.from("parent_reports").select("*").eq("month", month);
      return onlyStudent ? q.eq("student_id", onlyStudent) : q;
    }),
    // план года может быть ещё не создан — тогда просто без «Что дальше»
    admin.from("program_plan").select(PLAN_COLUMNS).order("start_month"),
  ]);
  // для блока «Эссе»: названия тем и сколько тем принято за всё время
  const [topicsRows, acceptedRows] = await Promise.all([
    paged<{ id: string; number: number; title: string }>(() => admin.from("essay_topics").select("id, number, title")),
    paged<{ student_id: string; topic_id: string }>(() => {
      const q = admin.from("essay_submissions").select("student_id, topic_id").eq("status", "accepted");
      return onlyStudent ? q.eq("student_id", onlyStudent) : q;
    }),
  ]);
  const topicTitle = new Map(topicsRows.map((t) => [t.id, t.title]));
  const essaysGoal = Math.max(TOPICS_GOAL, topicsRows.length);
  const acceptedTopics = new Map<string, Set<string>>();
  acceptedRows.forEach((r) => acceptedTopics.set(r.student_id, (acceptedTopics.get(r.student_id) ?? new Set()).add(r.topic_id)));
  const plan = (planRes.data as PlanEntry[] | null) ?? [];
  const pinnedIds = new Set(students.filter((s) => (s as { pinned?: boolean | null }).pinned).map((s) => s.id));
  const meetings = meetingsRaw.map(mapMeeting);
  const monthMeetings = meetings.filter((m) => m.format === "individual");

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
  const reportBy = new Map(reports.map((r) => [r.student_id, r]));

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
          essayItems: monthEssayItems(essays.filter((e) => e.studentId === student.id), from, to, topicTitle),
          essaysTotalAccepted: acceptedTopics.get(student.id)?.size ?? 0,
          essaysGoal,
        },
        notes,
        next: nextStepText(plan, month, student.className),
        report: reportBy.get(student.id) ?? null,
      } satisfies StudentReportData;
    })
    .sort((a, b) => Number(pinnedIds.has(b.studentId)) - Number(pinnedIds.has(a.studentId)) || a.name.localeCompare(b.name, "ru"));
}

/** Эссе, проверенные в этом месяце: по теме — последняя проверенная версия. */
function monthEssayItems(
  list: ReturnType<typeof mapSubmission>[],
  from: string,
  to: string,
  titles: Map<string, string>,
): { title: string; status: "accepted" | "revision"; score: number | null }[] {
  const byTopic = new Map<string, ReturnType<typeof mapSubmission>>();
  list
    .filter((e) => e.reviewedAt && e.reviewedAt >= from && e.reviewedAt < to && (e.status === "accepted" || e.status === "revision"))
    .forEach((e) => {
      const prev = byTopic.get(e.topicId);
      if (!prev || e.version > prev.version) byTopic.set(e.topicId, e);
    });
  return Array.from(byTopic.values())
    .sort((a, b) => (a.reviewedAt ?? "").localeCompare(b.reviewedAt ?? ""))
    .map((e) => ({
      title: titles.get(e.topicId) ?? "Эссе",
      status: e.status as "accepted" | "revision",
      score: e.status === "accepted" ? essayScore(e) : null,
    }));
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
    next: data.next,
  });
}
