import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { cached, peek } from "@/lib/cache";

export type MeetingFormat = "individual" | "group";
export type Attendance = "present" | "late" | "absent";

export const ATTENDANCE_LABELS: Record<Attendance, string> = {
  present: "Был",
  late: "Опоздал",
  absent: "Не пришёл",
};

export const FORMAT_LABELS: Record<MeetingFormat, string> = {
  individual: "Индивидуальная",
  group: "Групповая",
};

/** Пункты самооценки ментора (видит только админ). */
export const REFLECTION_ITEMS = [
  {
    key: "reflectionPreparation",
    label: "Подготовка к встрече",
    hint: "Насколько хорошо я подготовился: план, материалы, вопросы",
  },
  {
    key: "reflectionEngagement",
    label: "Вовлечённость ученика",
    hint: "Насколько ученик был включён и открыт",
  },
  {
    key: "reflectionGoal",
    label: "Цель встречи достигнута",
    hint: "Удалось ли сделать то, что планировал",
  },
  {
    key: "reflectionValue",
    label: "Польза для ученика",
    hint: "Насколько встреча реально продвинула ученика",
  },
] as const;

export type ReflectionKey = (typeof REFLECTION_ITEMS)[number]["key"];

/** Данные встречи, которые видят ментор, ученик и родитель. */
export interface Meeting {
  id: string;
  studentId: string;
  meetingDate: string; // YYYY-MM-DD
  format: MeetingFormat;
  attendance: Attendance | null;
  prevHomework: string;
  hwUnderstanding: number | null;
  hwQuality: number | null;
  summary: string;
  homework: string;
}

/** Только для ментора: план и самооценка. */
export interface MeetingMentorNotes {
  plan: string;
  reflectionPreparation: number | null;
  reflectionEngagement: number | null;
  reflectionGoal: number | null;
  reflectionValue: number | null;
  reflectionComment: string;
}

export interface MeetingWithNotes extends Meeting {
  notes: MeetingMentorNotes;
}

export const EMPTY_NOTES: MeetingMentorNotes = {
  plan: "",
  reflectionPreparation: null,
  reflectionEngagement: null,
  reflectionGoal: null,
  reflectionValue: null,
  reflectionComment: "",
};

interface DbMeeting {
  id: string;
  student_id: string;
  meeting_date: string;
  format: MeetingFormat;
  attendance: Attendance | null;
  prev_homework: string;
  hw_understanding: number | null;
  hw_quality: number | null;
  summary: string;
  homework: string;
}

interface DbMeetingNotes {
  meeting_id: string;
  plan: string;
  reflection_preparation: number | null;
  reflection_engagement: number | null;
  reflection_goal: number | null;
  reflection_value: number | null;
  reflection_comment: string;
}

const MEETING_COLUMNS =
  "id, student_id, meeting_date, format, attendance, prev_homework, hw_understanding, hw_quality, summary, homework";

function mapMeeting(row: DbMeeting): Meeting {
  return {
    id: row.id,
    studentId: row.student_id,
    meetingDate: row.meeting_date,
    format: row.format,
    attendance: row.attendance,
    prevHomework: row.prev_homework ?? "",
    hwUnderstanding: row.hw_understanding,
    hwQuality: row.hw_quality,
    summary: row.summary ?? "",
    homework: row.homework ?? "",
  };
}

function mapNotes(row: DbMeetingNotes | undefined): MeetingMentorNotes {
  if (!row) return { ...EMPTY_NOTES };
  return {
    plan: row.plan ?? "",
    reflectionPreparation: row.reflection_preparation,
    reflectionEngagement: row.reflection_engagement,
    reflectionGoal: row.reflection_goal,
    reflectionValue: row.reflection_value,
    reflectionComment: row.reflection_comment ?? "",
  };
}

function sortMeetings<T extends Meeting>(list: T[]): T[] {
  return [...list].sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));
}

export function isMeetingsTableMissing(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : "";
  return (
    message.includes("meetings") &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("could not find"))
  );
}

/** Ментор: встречи + план и самооценка. studentId не задан — по всем ученикам. */
async function fetchMeetingsWithNotesRaw(
  studentId?: string,
): Promise<MeetingWithNotes[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();

  let query = supabase.from("meetings").select(MEETING_COLUMNS);
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  if (error) throw error;

  const meetings = ((data as DbMeeting[]) ?? []).map(mapMeeting);
  if (meetings.length === 0) return [];

  const notesById = new Map<string, DbMeetingNotes>();
  const ids = meetings.map((m) => m.id);
  // Запросы порциями, чтобы не упереться в длину URL
  for (let i = 0; i < ids.length; i += 100) {
    const { data: notes, error: notesError } = await supabase
      .from("meeting_mentor_notes")
      .select("*")
      .in("meeting_id", ids.slice(i, i + 100));
    if (notesError) throw notesError;
    for (const row of (notes as DbMeetingNotes[]) ?? []) {
      notesById.set(row.meeting_id, row);
    }
  }

  return sortMeetings(
    meetings.map((m) => ({ ...m, notes: mapNotes(notesById.get(m.id)) })),
  );
}

/** Ученик: свои встречи (без плана и самооценки — их закрывает база). */
async function fetchMeetingsForStudentRaw(
  studentId: string,
): Promise<Meeting[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select(MEETING_COLUMNS)
    .eq("student_id", studentId);
  if (error) throw error;
  return sortMeetings(((data as DbMeeting[]) ?? []).map(mapMeeting));
}

/** Родитель: встречи по гостевой ссылке. */
async function fetchMeetingsByParentTokenRaw(
  token: string,
): Promise<Meeting[]> {
  if (!isSupabaseConfigured() || !token) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_meetings_by_parent_token", {
    p_token: token,
  });
  if (error) throw error;
  return sortMeetings(((data as DbMeeting[]) ?? []).map(mapMeeting));
}

function clampRating(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return Math.min(10, Math.max(1, Math.round(value)));
}

/** Ментор: создать или обновить встречу вместе с заметками. */
export async function saveMeeting(
  meeting: Omit<Meeting, "id"> & { id?: string },
  notes: MeetingMentorNotes,
): Promise<string> {
  const supabase = createClient();
  const row = {
    student_id: meeting.studentId,
    meeting_date: meeting.meetingDate,
    format: meeting.format,
    attendance: meeting.attendance,
    prev_homework: meeting.prevHomework,
    hw_understanding: clampRating(meeting.hwUnderstanding),
    hw_quality: clampRating(meeting.hwQuality),
    summary: meeting.summary,
    homework: meeting.homework,
  };

  let id = meeting.id;
  if (id) {
    const { error } = await supabase.from("meetings").update(row).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("meetings")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    id = (data as { id: string }).id;
  }

  const { error: notesError } = await supabase
    .from("meeting_mentor_notes")
    .upsert({
      meeting_id: id,
      plan: notes.plan,
      reflection_preparation: clampRating(notes.reflectionPreparation),
      reflection_engagement: clampRating(notes.reflectionEngagement),
      reflection_goal: clampRating(notes.reflectionGoal),
      reflection_value: clampRating(notes.reflectionValue),
      reflection_comment: notes.reflectionComment,
    });
  if (notesError) throw notesError;

  return id;
}

export async function deleteMeeting(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Подсчёты ----------

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Оценка домашки за встречу (среднее понимания и качества), 1–10. */
export function homeworkRating(m: Meeting): number | null {
  return average(
    [m.hwUnderstanding, m.hwQuality].filter((v): v is number => v !== null),
  );
}

/** Средняя самооценка ментора за встречу, 1–10. */
export function reflectionAverage(notes: MeetingMentorNotes): number | null {
  return average(
    REFLECTION_ITEMS.map((item) => notes[item.key]).filter(
      (v): v is number => v !== null,
    ),
  );
}

export interface MeetingStats {
  total: number;
  attendancePercent: number | null;
  homeworkAverage: number | null;
}

/** Те же формулы, что и в базе (recalc_student_meeting_scores). */
export function meetingStats(meetings: Meeting[]): MeetingStats {
  const attendance = meetings
    .map((m) => m.attendance)
    .filter((a): a is Attendance => a !== null)
    .map((a) => (a === "present" ? 100 : a === "late" ? 50 : 0));
  const hw = meetings
    .map(homeworkRating)
    .filter((v): v is number => v !== null);

  return {
    total: meetings.length,
    attendancePercent: average(attendance),
    homeworkAverage: average(hw),
  };
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function formatMeetingDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "short",
  });
}

// ---------- Выгрузка ----------

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

/**
 * CSV для Excel / Google Sheets: разделитель «;», BOM для кириллицы.
 * studentNames — id ученика → «Фамилия Имя».
 */
export function buildMeetingsCsv(
  meetings: MeetingWithNotes[],
  studentNames: Map<string, string>,
): string {
  const header = [
    "Ученик",
    "Дата",
    "Формат",
    "Посещение",
    "План встречи",
    "Домашка с прошлой встречи",
    "Понимание (1–10)",
    "Качество (1–10)",
    "Оценка домашки",
    "Что обсудили",
    "Новая домашка",
    ...REFLECTION_ITEMS.map((item) => `${item.label} (1–10)`),
    "Самооценка (среднее)",
    "Что улучшить",
  ];

  const rows = [...meetings]
    .sort(
      (a, b) =>
        (studentNames.get(a.studentId) ?? "").localeCompare(
          studentNames.get(b.studentId) ?? "",
          "ru",
        ) || a.meetingDate.localeCompare(b.meetingDate),
    )
    .map((m) => [
      studentNames.get(m.studentId) ?? "",
      m.meetingDate,
      FORMAT_LABELS[m.format],
      m.attendance ? ATTENDANCE_LABELS[m.attendance] : "",
      m.notes.plan,
      m.prevHomework,
      m.hwUnderstanding,
      m.hwQuality,
      round1(homeworkRating(m)),
      m.summary,
      m.homework,
      ...REFLECTION_ITEMS.map((item) => m.notes[item.key]),
      round1(reflectionAverage(m.notes)),
      m.notes.reflectionComment,
    ]);

  return (
    "﻿" +
    [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")
  );
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Ментор: встречи всех учеников (без плана и самооценки). */
async function fetchAllMeetingsRaw(): Promise<Meeting[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data, error } = await supabase.from("meetings").select(MEETING_COLUMNS);
  if (error) throw error;
  return sortMeetings(((data as DbMeeting[]) ?? []).map(mapMeeting));
}

export function fetchMeetingsWithNotes(studentId?: string): Promise<MeetingWithNotes[]> {
  return cached(`meetingsN:${studentId ?? "all"}`, () => fetchMeetingsWithNotesRaw(studentId));
}

export function peekFetchMeetingsWithNotes(studentId?: string): MeetingWithNotes[] | undefined {
  return peek<MeetingWithNotes[]>(`meetingsN:${studentId ?? "all"}`);
}

export function fetchMeetingsForStudent(studentId: string): Promise<Meeting[]> {
  return cached(`meetings:s:${studentId}`, () => fetchMeetingsForStudentRaw(studentId));
}

export function peekFetchMeetingsForStudent(studentId: string): Meeting[] | undefined {
  return peek<Meeting[]>(`meetings:s:${studentId}`);
}

export function fetchMeetingsByParentToken(token: string): Promise<Meeting[]> {
  return cached(`meetings:p:${token}`, () => fetchMeetingsByParentTokenRaw(token));
}

export function peekFetchMeetingsByParentToken(token: string): Meeting[] | undefined {
  return peek<Meeting[]>(`meetings:p:${token}`);
}

export function fetchAllMeetings(): Promise<Meeting[]> {
  return cached("meetings:all", () => fetchAllMeetingsRaw());
}

export function peekFetchAllMeetings(): Meeting[] | undefined {
  return peek<Meeting[]>("meetings:all");
}
