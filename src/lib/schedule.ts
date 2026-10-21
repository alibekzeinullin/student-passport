import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { MeetingFormat } from "@/lib/meetings";
import type { StudentProfile } from "@/lib/types";
import { addDays, mondayOf, parseIso, type AttendanceMeeting } from "@/lib/attendance";

/** Точка отсчёта для чётности недель (понедельник). */
const EPOCH_MONDAY = "2026-01-05";

export function weekParity(monday: string): 0 | 1 {
  const weeks = Math.round(
    (parseIso(monday).getTime() - parseIso(EPOCH_MONDAY).getTime()) / (7 * 86400000),
  );
  return (((weeks % 2) + 2) % 2) as 0 | 1;
}

/**
 * Неделя индивидуальной встречи ученика: заданная ментором, иначе —
 * по последней записанной индивидуальной встрече.
 */
export function studentParity(
  student: Pick<StudentProfile, "id" | "indParity">,
  meetings: Pick<AttendanceMeeting, "studentId" | "format" | "meetingDate">[],
): { parity: 0 | 1 | null; source: "set" | "history" | "none" } {
  if (student.indParity === 0 || student.indParity === 1) {
    return { parity: student.indParity, source: "set" };
  }
  let last: string | null = null;
  for (const m of meetings) {
    if (m.studentId === student.id && m.format === "individual" && (!last || m.meetingDate > last)) {
      last = m.meetingDate;
    }
  }
  if (!last) return { parity: null, source: "none" };
  return { parity: weekParity(mondayOf(last)), source: "history" };
}

export function hasIndividualThisWeek(parity: 0 | 1 | null, monday: string): boolean {
  return parity !== null && weekParity(monday) === parity;
}

export function saturdayOf(monday: string): string {
  return addDays(monday, 5);
}

// ---------- Приглашения ----------

export interface Invite {
  studentId: string;
  weekMonday: string;
  format: MeetingFormat;
  invitedAt: string;
}

export function inviteKey(studentId: string, weekMonday: string, format: MeetingFormat): string {
  return `${studentId}|${weekMonday}|${format}`;
}

export async function fetchInvites(fromMonday: string, toMonday: string): Promise<Invite[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meeting_invites")
    .select("student_id, week_monday, format, invited_at")
    .gte("week_monday", fromMonday)
    .lte("week_monday", toMonday);
  if (error) throw error;
  return (
    (data as { student_id: string; week_monday: string; format: MeetingFormat; invited_at: string }[]) ?? []
  ).map((r) => ({ studentId: r.student_id, weekMonday: r.week_monday, format: r.format, invitedAt: r.invited_at }));
}

export async function setInvited(
  items: { studentId: string; weekMonday: string; format: MeetingFormat }[],
  invited: boolean,
): Promise<void> {
  if (items.length === 0) return;
  const supabase = createClient();
  if (invited) {
    const { error } = await supabase.from("meeting_invites").upsert(
      items.map((i) => ({ student_id: i.studentId, week_monday: i.weekMonday, format: i.format })),
      { onConflict: "student_id,week_monday,format", ignoreDuplicates: true },
    );
    if (error) throw error;
    return;
  }
  for (const i of items) {
    const { error } = await supabase
      .from("meeting_invites")
      .delete()
      .eq("student_id", i.studentId)
      .eq("week_monday", i.weekMonday)
      .eq("format", i.format);
    if (error) throw error;
  }
}
