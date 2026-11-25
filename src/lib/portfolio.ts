"use client";

import { createClient } from "@/lib/supabase/client";
import type { Deadline } from "@/lib/deadlines";
import type { StudentProfile } from "@/lib/types";
import type { StudentWork } from "@/lib/works";

export type PortfolioCategory = "volunteer" | "club" | "sport" | "leadership" | "work" | "art" | "research" | "award" | "other";
export type PortfolioStatus = "pending" | "approved" | "rejected";

export const PORTFOLIO_CATEGORIES: Record<PortfolioCategory, string> = {
  volunteer: "Волонтёрство",
  club: "Клубы и кружки",
  sport: "Спорт",
  leadership: "Лидерство",
  work: "Работа и стажировки",
  art: "Творчество",
  research: "Исследования и курсы",
  award: "Награды",
  other: "Другое",
};

/** Ручная запись: ученик добавляет, ментор подтверждает. */
export interface PortfolioItem {
  id: string;
  student_id: string;
  category: PortfolioCategory;
  title: string;
  organization: string;
  role: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  hours_per_week: number | null;
  weeks_per_year: number | null;
  link: string;
  status: PortfolioStatus;
  mentor_comment: string;
  sort: number;
  created_at: string;
}

/** Строка портфолио — и ручная, и собранная сайтом сама. */
export interface PortfolioEntry {
  key: string;
  source: "manual" | "olympiad" | "activity" | "work" | "test";
  group: string;
  title: string;
  detail: string;
  period: string;
  result: string;
  link: string;
  item?: PortfolioItem;
}

function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205") throw new Error("В базе нет таблицы портфолио — нужно применить supabase/migration-mentoring-goals.sql");
  throw new Error(error.message);
}

export async function loadPortfolio(studentId: string): Promise<PortfolioItem[]> {
  const { data, error } = await createClient().from("portfolio_items").select("*").eq("student_id", studentId).order("start_date", { ascending: false, nullsFirst: false });
  if (error) return [];
  return ((data as PortfolioItem[]) ?? []).map((i) => ({ ...i, hours_per_week: i.hours_per_week === null ? null : Number(i.hours_per_week) }));
}

export async function loadPortfolioByParentToken(token: string): Promise<PortfolioItem[]> {
  const { data, error } = await createClient().rpc("get_portfolio_by_parent_token", { p_token: token });
  if (error) return [];
  return (data as PortfolioItem[]) ?? [];
}

export type PortfolioDraft = Omit<PortfolioItem, "id" | "status" | "mentor_comment" | "sort" | "created_at"> & { id?: string };

export async function savePortfolioItem(item: PortfolioDraft) {
  const row = {
    student_id: item.student_id,
    category: item.category,
    title: item.title.trim(),
    organization: item.organization.trim(),
    role: item.role.trim(),
    description: item.description.trim(),
    start_date: item.start_date || null,
    end_date: item.end_date || null,
    hours_per_week: item.hours_per_week,
    weeks_per_year: item.weeks_per_year,
    link: item.link.trim(),
  };
  const supabase = createClient();
  const { error } = item.id ? await supabase.from("portfolio_items").update(row).eq("id", item.id) : await supabase.from("portfolio_items").insert(row);
  fail(error);
}

/** Ментор: подтвердить / вернуть на доработку с комментарием. */
export async function reviewPortfolioItem(id: string, status: PortfolioStatus, comment: string) {
  const { error } = await createClient().from("portfolio_items").update({ status, mentor_comment: comment.trim() }).eq("id", id);
  fail(error);
}

export async function deletePortfolioItem(id: string) {
  const { error } = await createClient().from("portfolio_items").delete().eq("id", id);
  fail(error);
}

function monthYear(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { month: "short", year: "numeric" });
}

export function periodOf(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  if (start && !end) return `с ${monthYear(start)} — сейчас`;
  if (!start) return `до ${monthYear(end)}`;
  return `${monthYear(start)} — ${monthYear(end)}`;
}

const RESULT_LABELS: Record<string, string> = { prize: "Призёр", advanced: "Прошёл на следующий этап" };

/**
 * Собрать портфолио: ручные записи + то, что уже есть на сайте — олимпиады с результатом,
 * академическая активность, проекты и исследования, экзамены.
 */
export function buildPortfolio(input: {
  student: Pick<StudentProfile, "academicActivities" | "testScores">;
  deadlines: Deadline[];
  works: StudentWork[];
  items: PortfolioItem[];
  includePending: boolean;
}): PortfolioEntry[] {
  const out: PortfolioEntry[] = [];
  for (const d of input.deadlines) {
    if (!d.result) continue;
    out.push({ key: `d-${d.id}`, source: "olympiad", group: "Олимпиады и конкурсы", title: d.title, detail: "", period: monthYear(d.dueDate), result: RESULT_LABELS[d.result] ?? d.result, link: d.url });
  }
  for (const a of input.student.academicActivities ?? []) {
    if (!a.name || a.status === "В планах") continue;
    out.push({ key: `a-${a.id}`, source: "activity", group: a.type === "Academic Honor" ? "Награды" : "Олимпиады и конкурсы", title: a.name, detail: a.type, period: "", result: a.result || a.status, link: "" });
  }
  for (const w of input.works) {
    if (w.status === "idea" || !w.title) continue;
    out.push({
      key: `w-${w.id}`,
      source: "work",
      group: w.kind === "research" ? "Исследования и курсы" : "Проекты",
      title: w.title,
      detail: [w.myRole && `роль: ${w.myRole}`, w.kind === "research" ? w.question : w.problem].filter(Boolean).join(" · "),
      period: w.status === "done" ? "завершён" : "в работе",
      result: w.results || w.competition,
      link: w.links[0]?.url ?? "",
    });
  }
  const t = input.student.testScores;
  if (t?.sat) out.push({ key: "t-sat", source: "test", group: "Экзамены", title: "SAT", detail: "", period: "", result: String(t.sat), link: "" });
  if (t?.ielts) out.push({ key: "t-ielts", source: "test", group: "Экзамены", title: "IELTS", detail: "", period: "", result: String(t.ielts), link: "" });
  for (const i of input.items) {
    if (i.status === "rejected" && !input.includePending) continue;
    if (i.status !== "approved" && !input.includePending) continue;
    const hours = i.hours_per_week ? `${i.hours_per_week} ч/нед${i.weeks_per_year ? `, ${i.weeks_per_year} нед/год` : ""}` : "";
    out.push({
      key: `m-${i.id}`,
      source: "manual",
      group: PORTFOLIO_CATEGORIES[i.category],
      title: i.title,
      detail: [i.role, i.organization, hours].filter(Boolean).join(" · "),
      period: periodOf(i.start_date, i.end_date),
      result: i.description,
      link: i.link,
      item: i,
    });
  }
  return out;
}

/** Порядок разделов в портфолио. */
export const GROUP_ORDER = [
  "Олимпиады и конкурсы",
  "Награды",
  "Проекты",
  "Исследования и курсы",
  "Лидерство",
  "Волонтёрство",
  "Клубы и кружки",
  "Спорт",
  "Творчество",
  "Работа и стажировки",
  "Экзамены",
  "Другое",
];
