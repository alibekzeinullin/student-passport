"use client";

import { createClient } from "@/lib/supabase/client";

export interface UsefulLink {
  id: string;
  course_id: string;
  folder: string;
  title: string;
  url: string;
  description: string;
  sort: number;
}

/** Папки, которые предлагаем по умолчанию (можно вписать свою). */
export const DEFAULT_FOLDERS: Record<string, string[]> = {
  mentoring: ["IELTS", "Эссе", "Поступление", "Олимпиады", "Разное"],
  sat: ["Math", "Reading and Writing", "Практис-тесты", "Bluebook", "Разное"],
};

export async function loadLinks(courseIds: string[]): Promise<UsefulLink[]> {
  if (!courseIds.length) return [];
  const { data, error } = await createClient().from("useful_links").select("id, course_id, folder, title, url, description, sort").in("course_id", courseIds).order("folder").order("sort").order("created_at");
  if (error) return [];
  return (data as UsefulLink[]) ?? [];
}

function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205") throw new Error("В базе нет таблицы ссылок — нужно применить supabase/migration-mentoring-goals.sql");
  if (error.message.includes("useful_links_url_check")) throw new Error("Ссылка должна начинаться с https://");
  throw new Error(error.message);
}

export function normalizeUrl(url: string): string {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export async function saveLink(l: Omit<UsefulLink, "id" | "sort"> & { id?: string; sort?: number }) {
  const row = { course_id: l.course_id, folder: l.folder.trim() || "Разное", title: l.title.trim(), url: normalizeUrl(l.url), description: l.description.trim(), sort: l.sort ?? 0 };
  const supabase = createClient();
  const { error } = l.id ? await supabase.from("useful_links").update(row).eq("id", l.id) : await supabase.from("useful_links").insert(row);
  fail(error);
}

export async function deleteLink(id: string) {
  const { error } = await createClient().from("useful_links").delete().eq("id", id);
  fail(error);
}
