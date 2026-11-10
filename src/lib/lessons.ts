"use client";

import { createClient } from "@/lib/supabase/client";
import { friendly, type GroupStaffRow, type StaffOption } from "@/lib/groups";

export type Attendance = "present" | "late" | "absent";
export type Homework = "done" | "partial" | "none";
export type Activity = "high" | "mid" | "low";

export const ATTENDANCE: { value: Attendance; label: string }[] = [
  { value: "present", label: "был" },
  { value: "late", label: "опоздал" },
  { value: "absent", label: "нет" },
];
export const HOMEWORK: { value: Homework; label: string }[] = [
  { value: "done", label: "сдал" },
  { value: "partial", label: "частично" },
  { value: "none", label: "нет" },
];
export const ACTIVITY: { value: Activity; label: string }[] = [
  { value: "high", label: "высокая" },
  { value: "mid", label: "средняя" },
  { value: "low", label: "низкая" },
];

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const WEEKDAYS_FULL = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

/** Пример расписания для новой группы — потом меняется на сайте. */
export const EXAMPLE_SLOTS = [
  { weekday: 2, starts_at: "17:00", duration_min: 90, title: "Math" },
  { weekday: 4, starts_at: "18:30", duration_min: 90, title: "Verbal" },
  { weekday: 5, starts_at: "17:00", duration_min: 90, title: "Практис" },
];

export const MARK_WINDOW_DAYS = 3;

export interface SlotRow {
  id: string;
  group_id: string;
  weekday: number;
  starts_at: string;
  duration_min: number;
  title: string;
  valid_from: string;
  valid_to: string | null;
}

export interface LessonRow {
  id: string;
  group_id: string;
  slot_id: string | null;
  slot_date: string | null;
  lesson_date: string;
  starts_at: string;
  duration_min: number;
  title: string;
  topic: string;
  status: "planned" | "cancelled";
  moved_from: string;
  teacher_id: string | null;
  groups: { name: string; course_id: string; archived: boolean } | null;
}

export interface RosterMark {
  student_id: string;
  full_name: string;
  class_name: string;
  attendance: Attendance | null;
  homework: Homework | null;
  activity: Activity | null;
  comment: string;
}

export interface WeekData {
  lessons: LessonRow[];
  marked: Map<string, number>;
  staffLinks: GroupStaffRow[];
  staff: StaffOption[];
  groups: { id: string; name: string; archived: boolean }[];
}

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const msg = error.message ?? "";
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || msg.includes("Could not find")) {
    throw new Error("В базе нет таблиц занятий — выполните supabase/migration-sat-2.sql (или setup-all.sql)");
  }
  throw new Error(friendly(msg));
}

/** ISO-дата в Астане (yyyy-mm-dd). */
export function isoDate(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Понедельник недели, в которой лежит дата. */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function isoWeekday(iso: string): number {
  return ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

export function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function fmtDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export async function loadWeek(from: string, to: string): Promise<WeekData> {
  const supabase = createClient();
  const ens = await supabase.rpc("ensure_lessons", { p_from: from, p_to: to });
  fail(ens.error);
  const [lessons, marked, links, members, groups] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, group_id, slot_id, slot_date, lesson_date, starts_at, duration_min, title, topic, status, moved_from, teacher_id, groups(name, course_id, archived)")
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .order("lesson_date")
      .order("starts_at"),
    supabase.rpc("marked_lessons", { p_from: from, p_to: to }),
    supabase.from("group_staff").select("id, group_id, user_id, role, starts_on, ends_on"),
    supabase.from("staff_members").select("user_id, full_name, active, staff_roles(role)").order("full_name"),
    supabase.from("groups").select("id, name, archived").eq("course_id", "sat").order("name"),
  ]);
  fail(lessons.error);
  fail(marked.error);
  fail(links.error);
  fail(members.error);
  fail(groups.error);
  type M = { user_id: string; full_name: string; active: boolean; staff_roles: { role: string }[] | null };
  return {
    lessons: ((lessons.data as unknown as LessonRow[]) ?? []).filter((l) => l.groups?.course_id === "sat"),
    marked: new Map(((marked.data as { lesson_id: string; marked: number }[]) ?? []).map((r) => [r.lesson_id, r.marked])),
    staffLinks: (links.data as GroupStaffRow[]) ?? [],
    staff: ((members.data as M[]) ?? []).map((m) => ({
      user_id: m.user_id,
      full_name: m.full_name,
      active: m.active,
      roles: (m.staff_roles ?? []).map((r) => r.role),
    })),
    groups: (groups.data as { id: string; name: string; archived: boolean }[]) ?? [],
  };
}

/** Учитель занятия: замена или учитель группы на дату. */
export function lessonTeacher(lesson: LessonRow, links: GroupStaffRow[]): string | null {
  if (lesson.teacher_id) return lesson.teacher_id;
  const link = links.find(
    (l) => l.group_id === lesson.group_id && l.role === "teacher" && l.starts_on <= lesson.lesson_date && (!l.ends_on || l.ends_on >= lesson.lesson_date),
  );
  return link?.user_id ?? null;
}

/** Ведёт ли пользователь это занятие (учитель/куратор группы на дату или замена). */
export function isMyLesson(lesson: LessonRow, links: GroupStaffRow[], userId: string): boolean {
  if (lesson.teacher_id === userId) return true;
  return links.some(
    (l) => l.group_id === lesson.group_id && l.user_id === userId && l.starts_on <= lesson.lesson_date && (!l.ends_on || l.ends_on >= lesson.lesson_date),
  );
}

export async function loadRoster(lessonId: string): Promise<RosterMark[]> {
  const { data, error } = await createClient().rpc("lesson_roster", { p_lesson: lessonId });
  fail(error);
  return (data as RosterMark[]) ?? [];
}

export async function saveMarks(lessonId: string, topic: string, marks: RosterMark[]) {
  const supabase = createClient();
  // Все ученики занятия: так снятая отметка тоже сохранится
  const rows = marks.map((m) => ({
      lesson_id: lessonId,
      student_id: m.student_id,
      attendance: m.attendance,
      homework: m.homework,
      activity: m.activity,
      comment: m.comment,
    }));
  if (rows.length) {
    const { error } = await supabase.from("lesson_marks").upsert(rows, { onConflict: "lesson_id,student_id" });
    fail(error);
  }
  const { error } = await supabase.from("lessons").update({ topic: topic.trim() }).eq("id", lessonId);
  fail(error);
}

export async function updateLesson(id: string, patch: Partial<Pick<LessonRow, "lesson_date" | "starts_at" | "status" | "moved_from" | "teacher_id" | "topic" | "title" | "duration_min">>) {
  const { error } = await createClient().from("lessons").update(patch).eq("id", id);
  fail(error);
}

export async function addExtraLesson(input: { groupId: string; date: string; time: string; duration: number; title: string }) {
  const { error } = await createClient().from("lessons").insert({
    group_id: input.groupId,
    lesson_date: input.date,
    starts_at: input.time,
    duration_min: input.duration,
    title: input.title.trim(),
  });
  fail(error);
}

export async function deleteLesson(id: string) {
  const { error } = await createClient().from("lessons").delete().eq("id", id);
  fail(error);
}

// --- Расписание группы ---

export async function loadSlots(): Promise<SlotRow[]> {
  const { data, error } = await createClient()
    .from("schedule_slots")
    .select("id, group_id, weekday, starts_at, duration_min, title, valid_from, valid_to")
    .order("weekday")
    .order("starts_at");
  if (error) return [];
  return (data as SlotRow[]) ?? [];
}

export async function addSlot(groupId: string, slot: { weekday: number; starts_at: string; duration_min: number; title: string }) {
  const { error } = await createClient().from("schedule_slots").insert({ group_id: groupId, ...slot });
  fail(error);
}

/** Слот больше не действует с сегодняшнего дня; прошлые занятия и отметки остаются. */
export async function endSlot(slot: SlotRow, today: string) {
  const supabase = createClient();
  if (slot.valid_from >= today) {
    const { error } = await supabase.from("schedule_slots").delete().eq("id", slot.id);
    fail(error);
  } else {
    const { error } = await supabase.from("schedule_slots").update({ valid_to: addDays(today, -1) }).eq("id", slot.id);
    fail(error);
  }
}

export interface RosterStat {
  student_id: string;
  lessons_marked: number;
  attendance_pct: number | null;
  homework_pct: number | null;
}

export async function loadRosterStats(): Promise<Map<string, RosterStat>> {
  const { data, error } = await createClient().rpc("sat_roster_stats");
  if (error) return new Map();
  return new Map(((data as RosterStat[]) ?? []).map((r) => [r.student_id, r]));
}

export interface StudentSatInfo {
  lessons_marked: number;
  attendance_pct: number | null;
  homework_pct: number | null;
  stream_starts_on: string | null;
  weeks_total: number | null;
}

export async function loadStudentSatInfo(studentId: string): Promise<StudentSatInfo | null> {
  const { data, error } = await createClient().rpc("sat_student_info", { p_student: studentId });
  if (error) return null;
  return ((data as StudentSatInfo[]) ?? [])[0] ?? null;
}

/** Ближайшие занятия ученика (неделя вперёд). */
export async function loadStudentUpcoming(from: string, to: string): Promise<LessonRow[]> {
  const supabase = createClient();
  await supabase.rpc("ensure_lessons", { p_from: from, p_to: to });
  const { data, error } = await supabase
    .from("lessons")
    .select("id, group_id, slot_id, slot_date, lesson_date, starts_at, duration_min, title, topic, status, moved_from, teacher_id, groups(name, course_id, archived)")
    .gte("lesson_date", from)
    .lte("lesson_date", to)
    .order("lesson_date")
    .order("starts_at");
  if (error) return [];
  return (data as unknown as LessonRow[]) ?? [];
}

/** «Неделя 5 из 12» по дате начала потока. */
export function courseWeek(startsOn: string | null, weeksTotal: number | null, today: string): { week: number; total: number } | null {
  if (!startsOn || !weeksTotal) return null;
  const days = Math.floor((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${startsOn}T12:00:00Z`).getTime()) / 86400000);
  if (days < 0) return { week: 0, total: weeksTotal };
  return { week: Math.min(weeksTotal, Math.floor(days / 7) + 1), total: weeksTotal };
}
