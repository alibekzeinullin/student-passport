import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type DeadlineCategory =
  | "olympiad"
  | "contest"
  | "hackathon"
  | "exam"
  | "application"
  | "task"
  | "other";

export type DeadlineStatus = "planned" | "submitted" | "skipped";

export const CATEGORY_LABELS: Record<DeadlineCategory, string> = {
  olympiad: "Олимпиада",
  contest: "Конкурс",
  hackathon: "Хакатон",
  exam: "Экзамен",
  application: "Подача в вуз",
  task: "Задание",
  other: "Другое",
};

export const STATUS_LABELS: Record<DeadlineStatus, string> = {
  planned: "Готовлюсь",
  submitted: "Подал",
  skipped: "Не буду",
};

export interface Deadline {
  id: string;
  studentId: string;
  title: string;
  category: DeadlineCategory;
  dueDate: string; // YYYY-MM-DD
  url: string;
  notes: string;
  status: DeadlineStatus;
  createdByAdmin: boolean;
  opportunityId: string | null;
  groupKey: string | null;
}

interface DbDeadline {
  id: string;
  student_id: string;
  title: string;
  category: DeadlineCategory;
  due_date: string;
  url: string;
  notes: string;
  status: DeadlineStatus;
  created_by_admin: boolean;
  opportunity_id: string | null;
  group_key: string | null;
}

function mapDeadline(row: DbDeadline): Deadline {
  return {
    id: row.id,
    studentId: row.student_id,
    title: row.title,
    category: row.category,
    dueDate: row.due_date,
    url: row.url ?? "",
    notes: row.notes ?? "",
    status: row.status,
    createdByAdmin: row.created_by_admin,
    opportunityId: row.opportunity_id,
    groupKey: row.group_key,
  };
}

function sortByDate(list: Deadline[]): Deadline[] {
  return [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function isTableMissing(error: unknown, table: string): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : "";
  return (
    message.includes(table) &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("could not find"))
  );
}

/** Ученик / ментор: дедлайны одного ученика; без studentId (ментор) — всех. */
export async function fetchDeadlines(studentId?: string): Promise<Deadline[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  let query = supabase.from("student_deadlines").select("*");
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  if (error) throw error;
  return sortByDate(((data as DbDeadline[]) ?? []).map(mapDeadline));
}

export async function fetchDeadlinesByParentToken(
  token: string,
): Promise<Deadline[]> {
  if (!isSupabaseConfigured() || !token) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_deadlines_by_parent_token", {
    p_token: token,
  });
  if (error) throw error;
  return sortByDate(((data as DbDeadline[]) ?? []).map(mapDeadline));
}

export interface NewDeadline {
  title: string;
  category: DeadlineCategory;
  dueDate: string;
  url?: string;
  notes?: string;
  opportunityId?: string | null;
}

/** Добавить дедлайн одному или нескольким ученикам (ментор — всем выбранным сразу). */
export async function createDeadlines(
  studentIds: string[],
  input: NewDeadline,
  createdByAdmin: boolean,
): Promise<void> {
  const supabase = createClient();
  const groupKey =
    studentIds.length > 1 && typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : null;
  const rows = studentIds.map((studentId) => ({
    student_id: studentId,
    title: input.title.trim(),
    category: input.category,
    due_date: input.dueDate,
    url: input.url?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    created_by_admin: createdByAdmin,
    opportunity_id: input.opportunityId ?? null,
    group_key: groupKey,
  }));
  const { error } = await supabase.from("student_deadlines").insert(rows);
  if (error) throw error;
}

export async function updateDeadline(
  id: string,
  patch: Partial<Pick<Deadline, "title" | "category" | "dueDate" | "url" | "notes" | "status">>,
): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.url !== undefined) row.url = patch.url;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.status !== undefined) row.status = patch.status;
  const { error } = await supabase.from("student_deadlines").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteDeadline(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("student_deadlines").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Время ----------

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Сколько дней осталось (0 — сегодня, отрицательное — просрочено). */
export function daysLeft(iso: string): number {
  const ms = parseIsoDate(iso).getTime() - startOfToday().getTime();
  return Math.round(ms / 86400000);
}

export type Urgency = "calm" | "soon" | "hot" | "overdue" | "done";

export function urgencyOf(deadline: Pick<Deadline, "dueDate" | "status">): Urgency {
  if (deadline.status !== "planned") return "done";
  const left = daysLeft(deadline.dueDate);
  if (left < 0) return "overdue";
  if (left <= 3) return "hot";
  if (left <= 14) return "soon";
  return "calm";
}

/** «20 дней», «1 день», «сегодня», «просрочен на 2 дня». */
export function formatDaysLeft(left: number): string {
  if (left === 0) return "сегодня";
  const n = Math.abs(left);
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "день"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "дня"
        : "дней";
  return left < 0 ? `просрочен на ${n} ${word}` : `${n} ${word}`;
}

export function daysWord(n: number): string {
  return formatDaysLeft(n).replace(/^\d+\s/, "");
}

export function formatDueDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
