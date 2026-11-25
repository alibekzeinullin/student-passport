"use client";

import { createClient } from "@/lib/supabase/client";

/** Цель на четверть: ставит ментор вместе с учеником, у цели есть число и сколько уже сделано. */
export interface StudentGoal {
  id: string;
  student_id: string;
  term: string;
  title: string;
  target: number;
  done: number;
  note: string;
  sort: number;
  created_at: string;
  updated_at: string;
}

export { goalPct, nearbyTerms, termLabel, termOf } from "@/lib/goal-terms";

function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205") throw new Error("В базе нет таблицы целей — нужно применить supabase/migration-mentoring-goals.sql");
  throw new Error(error.message);
}

export async function loadGoals(studentId: string): Promise<StudentGoal[]> {
  const { data, error } = await createClient()
    .from("student_goals")
    .select("*")
    .eq("student_id", studentId)
    .order("term", { ascending: false })
    .order("sort")
    .order("created_at");
  if (error) return [];
  return (data as StudentGoal[]) ?? [];
}

export async function loadGoalsByParentToken(token: string): Promise<StudentGoal[]> {
  const { data, error } = await createClient().rpc("get_goals_by_parent_token", { p_token: token });
  if (error) return [];
  return (data as StudentGoal[]) ?? [];
}

export async function saveGoal(g: Partial<StudentGoal> & { student_id: string; term: string; title: string }) {
  const row = { student_id: g.student_id, term: g.term, title: g.title.trim(), target: g.target ?? 1, done: g.done ?? 0, note: (g.note ?? "").trim(), sort: g.sort ?? 0 };
  const supabase = createClient();
  const { error } = g.id ? await supabase.from("student_goals").update(row).eq("id", g.id) : await supabase.from("student_goals").insert(row);
  fail(error);
}

export async function setGoalDone(id: string, done: number) {
  const { error } = await createClient().from("student_goals").update({ done: Math.max(0, done) }).eq("id", id);
  fail(error);
}

export async function deleteGoal(id: string) {
  const { error } = await createClient().from("student_goals").delete().eq("id", id);
  fail(error);
}
