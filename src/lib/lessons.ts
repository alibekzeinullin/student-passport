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
  kind?: LessonKind;
}

export type LessonKind = "lesson" | "office_hours";

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
  /** office hours не отмечаются и не идут в посещаемость */
  kind?: LessonKind;
  /** домашнее задание, заданное на этом занятии */
  homework?: string;
  status: "planned" | "cancelled";
  moved_from: string;
  teacher_id: string | null;
  /** office hours только для этих учеников (null — вся группа) */
  student_ids?: string[] | null;
  groups: { name: string; course_id: string; archived: boolean } | null;
}

export const LESSON_COLUMNS =
  "id, group_id, slot_id, slot_date, lesson_date, starts_at, duration_min, title, topic, kind, homework, status, moved_from, teacher_id, student_ids, groups(name, course_id, archived)";

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
      .select(LESSON_COLUMNS)
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

export async function saveMarks(lessonId: string, topic: string, marks: RosterMark[], homework?: string) {
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
  const patch: Record<string, string> = { topic: topic.trim() };
  if (homework !== undefined) patch.homework = homework.trim();
  const { error } = await supabase.from("lessons").update(patch).eq("id", lessonId);
  fail(error);
}

export async function updateLesson(id: string, patch: Partial<Pick<LessonRow, "lesson_date" | "starts_at" | "status" | "moved_from" | "teacher_id" | "topic" | "title" | "duration_min" | "homework">>) {
  const { error } = await createClient().from("lessons").update(patch).eq("id", id);
  fail(error);
}

export async function addExtraLesson(input: {
  groupId: string;
  date: string;
  time: string;
  duration: number;
  title: string;
  kind?: LessonKind;
  studentIds?: string[] | null;
}) {
  const { error } = await createClient().from("lessons").insert({
    kind: input.kind ?? "lesson",
    student_ids: input.kind === "office_hours" && input.studentIds?.length ? input.studentIds : null,
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
    .select("id, group_id, weekday, starts_at, duration_min, title, valid_from, valid_to, kind")
    .order("weekday")
    .order("starts_at");
  if (error) return [];
  return (data as SlotRow[]) ?? [];
}

export async function addSlot(groupId: string, slot: { weekday: number; starts_at: string; duration_min: number; title: string; kind?: LessonKind }) {
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
    .select(LESSON_COLUMNS)
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

// --- Office hours: кто пришёл и обратная связь (видят только сотрудники) ---

export interface OhNote {
  lesson_id: string;
  student_id: string;
  attended: boolean;
  comment: string;
  updated_at?: string;
}

export async function loadOhNotes(lessonId: string): Promise<OhNote[]> {
  const { data, error } = await createClient().from("office_hours_notes").select("lesson_id, student_id, attended, comment, updated_at").eq("lesson_id", lessonId);
  if (error) return [];
  return (data as OhNote[]) ?? [];
}

/** Сохранить: отмеченные или с комментарием — записать, остальные — удалить. Домашка — по желанию. */
export async function saveOhNotes(lessonId: string, rows: { student_id: string; attended: boolean; comment: string }[], homework?: string) {
  const supabase = createClient();
  const keep = rows.filter((r) => r.attended || r.comment.trim());
  const drop = rows.filter((r) => !r.attended && !r.comment.trim()).map((r) => r.student_id);
  if (keep.length) {
    const { error } = await supabase
      .from("office_hours_notes")
      .upsert(keep.map((r) => ({ lesson_id: lessonId, student_id: r.student_id, attended: r.attended, comment: r.comment.trim() })), { onConflict: "lesson_id,student_id" });
    fail(error);
  }
  if (drop.length) {
    const { error } = await supabase.from("office_hours_notes").delete().eq("lesson_id", lessonId).in("student_id", drop);
    fail(error);
  }
  if (homework !== undefined) {
    const { error } = await supabase.from("lessons").update({ homework: homework.trim() }).eq("id", lessonId);
    fail(error);
  }
}

export interface StudentOhNote extends OhNote {
  lesson_date: string;
  title: string;
}

/** Все office hours ученика с обратной связью — для карточки ученика у сотрудников. */
export async function loadStudentOhNotes(studentId: string): Promise<StudentOhNote[]> {
  const { data, error } = await createClient()
    .from("office_hours_notes")
    .select("lesson_id, student_id, attended, comment, updated_at, lessons!inner(lesson_date, title)")
    .eq("student_id", studentId);
  if (error) return [];
  type Row = OhNote & { lessons: { lesson_date: string; title: string } };
  return ((data as unknown as Row[]) ?? [])
    .map((r) => ({ ...r, lesson_date: r.lessons.lesson_date, title: r.lessons.title }))
    .sort((a, b) => b.lesson_date.localeCompare(a.lesson_date));
}

// --- Office hours: кому назначены и кто прочитал ---

/** Ученики группы сейчас — выбрать, кому назначить office hours. */
export async function loadGroupRoster(groupId: string): Promise<{ student_id: string; full_name: string }[]> {
  const { data, error } = await createClient().rpc("sat_group_roster", { p_group: groupId });
  if (error) return [];
  return (data as { student_id: string; full_name: string }[]) ?? [];
}

/** Office hours для всей группы (null) или для выбранных учеников. */
export async function setLessonStudents(lessonId: string, studentIds: string[] | null) {
  const { error } = await createClient().from("lessons").update({ student_ids: studentIds?.length ? studentIds : null }).eq("id", lessonId);
  fail(error);
}

/** Кто отметил «Прочитал»: lesson_id → student_id → время. Ученик видит только свои. */
export async function loadAcks(lessonIds: string[]): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  if (!lessonIds.length) return out;
  const { data, error } = await createClient().from("lesson_acks").select("lesson_id, student_id, acked_at").in("lesson_id", lessonIds);
  if (error) return out;
  for (const r of (data as { lesson_id: string; student_id: string; acked_at: string }[]) ?? []) {
    const m = out.get(r.lesson_id) ?? new Map<string, string>();
    m.set(r.student_id, r.acked_at);
    out.set(r.lesson_id, m);
  }
  return out;
}

export async function ackLesson(lessonId: string) {
  const { error } = await createClient().rpc("ack_lesson", { p_lesson: lessonId });
  fail(error);
}

// --- «Требует внимания» для учителей SAT ---

export interface AttentionRow {
  kind: "unmarked" | "oh_unread" | "test_review" | "risk";
  group_id: string;
  group_name: string;
  ref_id: string | null;
  ref_date: string | null;
  student_id: string | null;
  student_name: string | null;
  detail: string;
}

export async function loadSatAttention(today: string): Promise<AttentionRow[]> {
  const supabase = createClient();
  // занятия за две недели должны существовать, чтобы найти неотмеченные
  await supabase.rpc("ensure_lessons", { p_from: addDays(today, -14), p_to: addDays(today, 7) });
  const { data, error } = await supabase.rpc("sat_attention");
  if (error) return [];
  return (data as AttentionRow[]) ?? [];
}

/** Кто отмечен «был / опоздал» на сегодняшнем занятии группы — чтобы сразу допустить их к тесту. */
export async function loadPresentToday(groupId: string, today: string): Promise<string[]> {
  const supabase = createClient();
  const { data: ls } = await supabase.from("lessons").select("id").eq("group_id", groupId).eq("lesson_date", today).eq("kind", "lesson");
  const ids = ((ls as { id: string }[]) ?? []).map((l) => l.id);
  if (!ids.length) return [];
  const { data } = await supabase.from("lesson_marks").select("student_id, attendance").in("lesson_id", ids).in("attendance", ["present", "late"]);
  return Array.from(new Set(((data as { student_id: string }[]) ?? []).map((m) => m.student_id)));
}
