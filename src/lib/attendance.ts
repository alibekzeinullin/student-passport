import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Attendance, MeetingFormat } from "@/lib/meetings";

/** Запись встречи в объёме, нужном таблице посещаемости. */
export interface AttendanceMeeting {
  id: string;
  studentId: string;
  meetingDate: string;
  format: MeetingFormat;
  attendance: Attendance | null;
  sessionKey: string | null;
  /** Есть ли в встрече содержание (итог, домашка, оценки) — такую не удаляем */
  hasContent: boolean;
}

interface DbRow {
  id: string;
  student_id: string;
  meeting_date: string;
  format: MeetingFormat;
  attendance: Attendance | null;
  session_key: string | null;
  summary: string;
  homework: string;
  prev_homework: string;
  hw_understanding: number | null;
  hw_quality: number | null;
}

const COLUMNS =
  "id, student_id, meeting_date, format, attendance, session_key, summary, homework, prev_homework, hw_understanding, hw_quality";

function mapRow(r: DbRow): AttendanceMeeting {
  return {
    id: r.id,
    studentId: r.student_id,
    meetingDate: r.meeting_date,
    format: r.format,
    attendance: r.attendance,
    sessionKey: r.session_key,
    hasContent: Boolean(
      r.summary?.trim() ||
        r.homework?.trim() ||
        r.prev_homework?.trim() ||
        r.hw_understanding !== null ||
        r.hw_quality !== null,
    ),
  };
}

// ---------- Недели (понедельник–воскресенье) ----------

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Понедельник недели, в которую попадает дата. */
export function mondayOf(iso: string): string {
  const d = parseIso(iso);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return toIso(d);
}

export function todayLocalIso(): string {
  return toIso(new Date());
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «14–20 сен», «28 сен–4 окт» */
export function weekLabel(monday: string, long = false): string {
  const a = parseIso(monday);
  const b = parseIso(addDays(monday, 6));
  const names = long ? MONTHS_GEN : MONTHS_SHORT;
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${names[b.getMonth()]}`;
  }
  return `${a.getDate()} ${names[a.getMonth()]} – ${b.getDate()} ${names[b.getMonth()]}`;
}

export function weekdayLabel(iso: string): string {
  return parseIso(iso).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

/** Список понедельников от start до end включительно. */
export function weeksBetween(startMonday: string, endMonday: string): string[] {
  const list: string[] = [];
  let cur = startMonday;
  while (cur <= endMonday && list.length < 200) {
    list.push(cur);
    cur = addDays(cur, 7);
  }
  return list;
}

// ---------- Загрузка ----------

export async function fetchAttendance(
  fromIso: string,
  toIsoDate: string,
): Promise<AttendanceMeeting[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const rows: DbRow[] = [];
  // Порциями по 1000 строк (лимит Supabase по умолчанию)
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from("meetings")
      .select(COLUMNS)
      .gte("meeting_date", fromIso)
      .lte("meeting_date", toIsoDate)
      .order("meeting_date")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data as DbRow[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows.map(mapRow);
}

// ---------- Ячейка таблицы ----------

export type CellState = "none" | "unmarked" | Attendance;

/** Ячейка ученика за неделю по формату: берём самую позднюю встречу недели. */
export function findCell(
  meetings: AttendanceMeeting[],
  studentId: string,
  monday: string,
  format: MeetingFormat,
): AttendanceMeeting | undefined {
  const sunday = addDays(monday, 6);
  let found: AttendanceMeeting | undefined;
  for (const m of meetings) {
    if (
      m.studentId === studentId &&
      m.format === format &&
      m.meetingDate >= monday &&
      m.meetingDate <= sunday &&
      (!found || m.meetingDate > found.meetingDate)
    ) {
      found = m;
    }
  }
  return found;
}

export function cellState(m: AttendanceMeeting | undefined): CellState {
  if (!m) return "none";
  return m.attendance ?? "unmarked";
}

/** Порядок при клике по ячейке в общей таблице. */
export function nextState(state: CellState): CellState {
  switch (state) {
    case "none":
    case "unmarked":
      return "present";
    case "present":
      return "late";
    case "late":
      return "absent";
    case "absent":
      return "none";
  }
}

/** Дата по умолчанию для новой встречи в неделе: сегодня, если неделя текущая. */
export function defaultDateInWeek(monday: string, format: MeetingFormat): string {
  // Групповая — всегда суббота
  if (format === "group") return addDays(monday, 5);
  const today = todayLocalIso();
  if (today >= monday && today <= addDays(monday, 6)) return today;
  // Прошедшие недели: индивидуальная — понедельник
  return monday;
}

/**
 * Поставить отметку. Создаёт встречу, меняет посещение или удаляет её
 * («не назначена»). Встречу с содержанием не удаляем — только снимаем отметку.
 */
export async function setAttendance(params: {
  existing?: AttendanceMeeting;
  studentId: string;
  format: MeetingFormat;
  date: string;
  state: CellState;
  sessionKey?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { existing, state } = params;

  if (state === "none" || state === "unmarked") {
    if (!existing) return;
    if (existing.hasContent || state === "unmarked") {
      const { error } = await supabase
        .from("meetings")
        .update({ attendance: null })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("meetings").delete().eq("id", existing.id);
      if (error) throw error;
    }
    return;
  }

  if (existing) {
    const { error } = await supabase
      .from("meetings")
      .update({ attendance: state })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("meetings").insert({
    student_id: params.studentId,
    meeting_date: params.date,
    format: params.format,
    attendance: state,
    session_key: params.sessionKey ?? null,
  });
  if (error) throw error;
}

/** Создать много встреч разом (импорт, «все пришли»). */
export async function insertMeetings(
  rows: {
    studentId: string;
    date: string;
    format: MeetingFormat;
    attendance: Attendance;
    sessionKey?: string | null;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = createClient();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      student_id: r.studentId,
      meeting_date: r.date,
      format: r.format,
      attendance: r.attendance,
      session_key: r.sessionKey ?? null,
    }));
    const { error } = await supabase.from("meetings").insert(chunk);
    if (error) throw error;
  }
}

/** Перенести групповую встречу недели на другую дату (все её записи). */
export async function moveGroupSession(ids: string[], date: string): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createClient();
  const { error } = await supabase.from("meetings").update({ meeting_date: date }).in("id", ids);
  if (error) throw error;
}

export function newSessionKey(): string | null {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null;
}

/** Процент посещаемости по набору отметок (как в базе: был 100, опоздал 50, нет 0). */
export function attendancePercent(states: CellState[]): number | null {
  const marked = states.filter(
    (s): s is Attendance => s === "present" || s === "late" || s === "absent",
  );
  if (marked.length === 0) return null;
  const sum = marked.reduce((acc, s) => acc + (s === "present" ? 100 : s === "late" ? 50 : 0), 0);
  return Math.round(sum / marked.length);
}

// ---------- График встреч ----------

/**
 * Индивидуальные встречи — раз в две недели (у каждого ученика через неделю).
 * Групповые до недели 5–11 октября 2026 тоже шли раз в две недели (в те недели,
 * когда у ученика не было индивидуальной), с 10 октября — каждую неделю.
 */
export const GROUP_WEEKLY_FROM = "2026-10-05";

export function isGroupWeekly(monday: string): boolean {
  return monday >= GROUP_WEEKLY_FROM;
}

export type IndividualDue = "scheduled" | "due" | "off" | "overdue" | "new";

/** Нужна ли ученику индивидуальная на этой неделе (по графику раз в 2 недели). */
export function individualDue(
  meetings: AttendanceMeeting[],
  studentId: string,
  monday: string,
): IndividualDue {
  if (findCell(meetings, studentId, monday, "individual")) return "scheduled";
  let last: string | null = null;
  for (const m of meetings) {
    if (m.studentId === studentId && m.format === "individual" && m.meetingDate < monday) {
      if (!last || m.meetingDate > last) last = m.meetingDate;
    }
  }
  if (!last) return "new";
  const weeks = Math.round(
    (parseIso(monday).getTime() - parseIso(mondayOf(last)).getTime()) / (7 * 86400000),
  );
  if (weeks <= 1) return "off";
  if (weeks === 2) return "due";
  return "overdue";
}
