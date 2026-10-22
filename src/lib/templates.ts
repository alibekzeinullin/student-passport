import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { cached, clearCache, peek } from "@/lib/cache";

export type TemplateKind = "plan" | "summary" | "homework";

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  plan: "План встречи",
  summary: "Что обсудили",
  homework: "Домашнее задание",
};

export interface MeetingTemplate {
  id: string;
  kind: TemplateKind;
  title: string;
  body: string;
  sort: number;
}

async function fetchRaw(): Promise<MeetingTemplate[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createClient()
    .from("meeting_templates")
    .select("id, kind, title, body, sort")
    .order("sort")
    .order("title");
  if (error) throw error;
  return (data as MeetingTemplate[]) ?? [];
}

export const fetchTemplates = () => cached("templates", fetchRaw);
export const peekTemplates = () => peek<MeetingTemplate[]>("templates");

export async function saveTemplate(t: Omit<MeetingTemplate, "id"> & { id?: string }): Promise<void> {
  const supabase = createClient();
  const row = { kind: t.kind, title: t.title.trim(), body: t.body.trim(), sort: t.sort };
  const { error } = t.id
    ? await supabase.from("meeting_templates").update(row).eq("id", t.id)
    : await supabase.from("meeting_templates").insert(row);
  if (error) throw error;
  clearCache("templates");
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await createClient().from("meeting_templates").delete().eq("id", id);
  if (error) throw error;
  clearCache("templates");
}

/** Вставить шаблон: в пустое поле — как есть, иначе с новой строки. */
export function insertTemplate(current: string, body: string): string {
  return current.trim() ? `${current.replace(/\s+$/, "")}\n${body}` : body;
}
