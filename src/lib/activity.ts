import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type ActivityAction = "login" | "insert" | "update" | "delete" | "parent_view";

export interface ActivityEntry {
  id: number;
  at: string;
  actorId: string | null;
  actorRole: "admin" | "student" | "parent" | "system" | string;
  actorName: string;
  studentId: string | null;
  action: ActivityAction;
  entity: string;
  fields: string[];
  changes: Record<string, unknown>;
}

interface DbRow {
  id: number;
  at: string;
  actor_id: string | null;
  actor_role: string;
  actor_name: string;
  student_id: string | null;
  action: ActivityAction;
  entity: string;
  fields: string[] | null;
  changes: Record<string, unknown> | null;
}

export async function fetchActivity(params: {
  sinceIso: string;
  studentId?: string;
  actorRole?: string;
  action?: ActivityAction | "changes";
  limit?: number;
}): Promise<ActivityEntry[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  let q = supabase
    .from("activity_log")
    .select("*")
    .gte("at", params.sinceIso)
    .order("at", { ascending: false })
    .limit(params.limit ?? 500);
  if (params.studentId) q = q.eq("student_id", params.studentId);
  if (params.actorRole) q = q.eq("actor_role", params.actorRole);
  if (params.action === "changes") q = q.in("action", ["insert", "update", "delete"]);
  else if (params.action) q = q.eq("action", params.action);
  const { data, error } = await q;
  if (error) throw error;
  return ((data as DbRow[]) ?? []).map((r) => ({
    id: r.id,
    at: r.at,
    actorId: r.actor_id,
    actorRole: r.actor_role,
    actorName: r.actor_name,
    studentId: r.student_id,
    action: r.action,
    entity: r.entity,
    fields: r.fields ?? [],
    changes: r.changes ?? {},
  }));
}

/** Родитель открыл ссылку — отметка в истории (не чаще раза в 30 минут). */
export function logParentVisit(token: string): void {
  if (!isSupabaseConfigured() || !token) return;
  const supabase = createClient();
  void supabase.rpc("log_parent_visit", { p_token: token }).then(({ error }) => {
    if (error) console.warn("log_parent_visit", error.message);
  });
}

// ---------- Человеческие подписи ----------

export const FIELD_LABELS: Record<string, string> = {
  first_name: "имя",
  last_name: "фамилию",
  class_name: "класс",
  school: "школу",
  education_system: "систему обучения",
  email: "email",
  avatar_url: "фото",
  parent_access_token: "ссылку для родителей",
  mentor_note: "обратную связь ментора",
  mentor_summary: "итог месяца",
  gpa: "GPA",
  test_scores: "баллы SAT/IELTS",
  sprint_tasks: "спринты",
  academic_activities: "академ активность",
  projects: "проекты",
  books: "книги",
  skills: "навыки",
  growth_zones: "зоны роста",
  monthly_focuses: "фокусы месяца",
  monthly_progress_reviews: "Monthly Review",
  vision_map: "Vision Map",
  term_system: "систему четвертей",
  status: "статус",
  paused_at: "паузу",
  ind_parity: "график встреч",
  role: "роль",
  full_name: "имя в профиле",
  student_id: "привязку ученика",
  meeting_date: "дату встречи",
  format: "формат",
  attendance: "посещение",
  prev_homework: "прошлую домашку",
  hw_understanding: "оценку понимания",
  hw_quality: "оценку качества",
  summary: "итог встречи",
  homework: "домашку",
  session_key: "групповую встречу",
  plan: "план встречи",
  reflection_preparation: "самооценку",
  reflection_engagement: "самооценку",
  reflection_goal: "самооценку",
  reflection_value: "самооценку",
  reflection_comment: "самооценку",
  title: "название",
  category: "тип",
  due_date: "дату дедлайна",
  url: "ссылку",
  notes: "заметку",
  term_number: "четверть",
  academic_year: "учебный год",
  verified: "проверку",
};

const ENTITY_LABELS: Record<string, { insert: string; update: string; delete: string }> = {
  students: { insert: "создан профиль ученика", update: "изменил(а) профиль", delete: "удалил(а) ученика" },
  profiles: { insert: "создан аккаунт", update: "изменил(а) аккаунт", delete: "удалён аккаунт" },
  meetings: { insert: "записал(а) встречу", update: "изменил(а) встречу", delete: "удалил(а) встречу" },
  meeting_mentor_notes: { insert: "записал(а) план/самооценку", update: "изменил(а) план/самооценку", delete: "удалил(а) план/самооценку" },
  student_deadlines: { insert: "добавил(а) дедлайн", update: "изменил(а) дедлайн", delete: "удалил(а) дедлайн" },
  term_grades: { insert: "внёс(ла) оценку за четверть", update: "изменил(а) оценку за четверть", delete: "удалил(а) оценку за четверть" },
};

const ATTENDANCE_WORDS: Record<string, string> = { present: "был", late: "опоздал", absent: "не пришёл" };
const STATUS_WORDS: Record<string, string> = {
  planned: "готовится",
  submitted: "подал",
  skipped: "не будет",
  active: "активный",
  paused: "на паузе",
};

export function describeValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value === "…") return "изменено";
  if (field === "attendance" && typeof value === "string") return ATTENDANCE_WORDS[value] ?? value;
  if (field === "status" && typeof value === "string") return STATUS_WORDS[value] ?? value;
  if (field === "format") return value === "group" ? "групповая" : "индивидуальная";
  if (field === "verified") return value ? "проверено" : "ждёт проверки";
  if (typeof value === "boolean") return value ? "да" : "нет";
  return String(value);
}

/** «изменил(а) профиль: книги, навыки» */
export function describeEntry(e: ActivityEntry): string {
  if (e.action === "login") return "вошёл(ла) на сайт";
  if (e.action === "parent_view") return "открыл(а) ссылку родителя";
  const labels = ENTITY_LABELS[e.entity];
  const base = labels ? labels[e.action] : `${e.action} ${e.entity}`;
  if (e.action === "update" && e.fields.length) {
    const names = [...new Set(e.fields.map((f) => FIELD_LABELS[f] ?? f))];
    return `${base}: ${names.join(", ")}`;
  }
  const c = e.changes as Record<string, unknown>;
  const extra = [
    c.title ? `«${String(c.title)}»` : "",
    c.meeting_date ? String(c.meeting_date).split("-").reverse().join(".") : "",
    c.attendance ? describeValue("attendance", c.attendance) : "",
    c.gpa !== undefined && c.gpa !== null ? `GPA ${String(c.gpa)}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return extra ? `${base} — ${extra}` : base;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Ментор",
  student: "Ученик",
  parent: "Родитель",
  system: "Система",
};
