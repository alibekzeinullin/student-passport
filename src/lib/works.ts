import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { cached, peek } from "@/lib/cache";

export type WorkKind = "project" | "research";
export type WorkStatus = "idea" | "active" | "paused" | "done";

export const WORK_KIND_LABELS: Record<WorkKind, string> = {
  project: "Проект",
  research: "Исследование",
};

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  idea: "Идея",
  active: "В работе",
  paused: "На паузе",
  done: "Завершён",
};

export interface WorkStage {
  id: string;
  title: string;
  due: string | null; // YYYY-MM-DD
  done: boolean;
  note?: string; // заметка ученика
  mentorComment?: string;
  commentAt?: string;
}

export interface WorkLink {
  label: string;
  url: string;
}

export interface StudentWork {
  id: string;
  studentId: string;
  kind: WorkKind;
  title: string;
  status: WorkStatus;
  problem: string;
  goal: string;
  team: string;
  myRole: string;
  results: string;
  links: WorkLink[];
  question: string;
  hypothesis: string;
  supervisor: string;
  competition: string;
  stages: WorkStage[];
  mentorComment: string;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

interface DbWork {
  id: string;
  student_id: string;
  kind: WorkKind;
  title: string;
  status: WorkStatus;
  problem: string;
  goal: string;
  team: string;
  my_role: string;
  results: string;
  links: WorkLink[] | null;
  question: string;
  hypothesis: string;
  supervisor: string;
  competition: string;
  stages: WorkStage[] | null;
  mentor_comment: string;
  sort: number;
  created_at: string;
  updated_at: string;
}

function mapWork(r: DbWork): StudentWork {
  return {
    id: r.id,
    studentId: r.student_id,
    kind: r.kind,
    title: r.title ?? "",
    status: r.status,
    problem: r.problem ?? "",
    goal: r.goal ?? "",
    team: r.team ?? "",
    myRole: r.my_role ?? "",
    results: r.results ?? "",
    links: Array.isArray(r.links) ? r.links : [],
    question: r.question ?? "",
    hypothesis: r.hypothesis ?? "",
    supervisor: r.supervisor ?? "",
    competition: r.competition ?? "",
    stages: Array.isArray(r.stages) ? r.stages : [],
    mentorComment: r.mentor_comment ?? "",
    sort: r.sort ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toDb(w: StudentWork): Omit<DbWork, "id" | "created_at" | "updated_at"> {
  return {
    student_id: w.studentId,
    kind: w.kind,
    title: w.title.trim(),
    status: w.status,
    problem: w.problem,
    goal: w.goal,
    team: w.team,
    my_role: w.myRole,
    results: w.results,
    links: w.links.filter((l) => l.url.trim()),
    question: w.question,
    hypothesis: w.hypothesis,
    supervisor: w.supervisor,
    competition: w.competition,
    stages: w.stages,
    mentor_comment: w.mentorComment,
    sort: w.sort,
  };
}

const sortWorks = (list: StudentWork[]) =>
  [...list].sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt));

async function fetchRaw(studentId: string): Promise<StudentWork[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createClient().from("student_works").select("*").eq("student_id", studentId);
  if (error) throw error;
  return sortWorks(((data as DbWork[]) ?? []).map(mapWork));
}

async function fetchByTokenRaw(token: string): Promise<StudentWork[]> {
  if (!isSupabaseConfigured() || !token) return [];
  const { data, error } = await createClient().rpc("get_works_by_parent_token", { p_token: token });
  if (error) throw error;
  return sortWorks(((data as DbWork[]) ?? []).map(mapWork));
}

async function fetchAllRaw(): Promise<StudentWork[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createClient().from("student_works").select("*");
  if (error) throw error;
  return sortWorks(((data as DbWork[]) ?? []).map(mapWork));
}

export const fetchWorks = (studentId: string) => cached(`works:${studentId}`, () => fetchRaw(studentId));
export const peekWorks = (studentId: string) => peek<StudentWork[]>(`works:${studentId}`);
export const fetchWorksByParentToken = (token: string) => cached(`works:p:${token}`, () => fetchByTokenRaw(token));
export const peekWorksByParentToken = (token: string) => peek<StudentWork[]>(`works:p:${token}`);
export const fetchAllWorks = () => cached("works:all", fetchAllRaw);

export async function saveWork(w: StudentWork, isNew: boolean): Promise<StudentWork> {
  const supabase = createClient();
  const row = toDb(w);
  const q = isNew
    ? supabase.from("student_works").insert(row)
    : supabase.from("student_works").update(row).eq("id", w.id);
  const { data, error } = await q.select("*").single();
  if (error) throw error;
  return mapWork(data as DbWork);
}

export async function deleteWork(id: string): Promise<void> {
  const { error } = await createClient().from("student_works").delete().eq("id", id);
  if (error) throw error;
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

export function newStage(title = ""): WorkStage {
  return { id: uid(), title, due: null, done: false };
}

const DEFAULT_STAGES: Record<WorkKind, string[]> = {
  project: ["Идея и проблема", "План и команда", "Первая версия / прототип", "Запуск и результат", "Презентация и выводы"],
  research: ["Тема и вопрос", "Обзор литературы", "Методика и сбор данных", "Анализ результатов", "Текст работы", "Защита"],
};

export function emptyWork(studentId: string, kind: WorkKind, sort: number): StudentWork {
  const now = new Date().toISOString();
  return {
    id: `new-${uid()}`,
    studentId,
    kind,
    title: "",
    status: "idea",
    problem: "",
    goal: "",
    team: "",
    myRole: "",
    results: "",
    links: [],
    question: "",
    hypothesis: "",
    supervisor: "",
    competition: "",
    stages: DEFAULT_STAGES[kind].map((t) => newStage(t)),
    mentorComment: "",
    sort,
    createdAt: now,
    updatedAt: now,
  };
}

export function stageProgress(w: Pick<StudentWork, "stages">): { done: number; total: number } {
  return { done: w.stages.filter((s) => s.done).length, total: w.stages.length };
}

/** Текущий этап — первый невыполненный. */
export function currentStage(w: Pick<StudentWork, "stages">): WorkStage | null {
  return w.stages.find((s) => !s.done) ?? null;
}
