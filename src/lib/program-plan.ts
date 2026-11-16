/** План менторской программы на год: фокус каждого месяца. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthNominative, monthPrepositional } from "@/lib/parent-report";

export type PlanPhase = "act" | "speech" | "team" | "res" | "tech" | "fest";

export interface PlanEntry {
  id: string;
  start_month: string; // YYYY-MM
  end_month: string;
  phase: PlanPhase;
  title: string;
  short: string;
  format: "individual" | "team";
  focus: string;
  result: string;
  steps: string;
  diff: string;
  grade10: string;
  home: string;
  takeaway: string;
}

export const PLAN_COLUMNS = "id, start_month, end_month, phase, title, short, format, focus, result, steps, diff, grade10, home, takeaway";

/** Цвета фаз — пастель из исходного плана, приглушённая под тёмную тему. */
export const PHASES: Record<PlanPhase, { label: string; color: string }> = {
  act: { label: "Реальное дело", color: "#9fc490" },
  speech: { label: "Выступление", color: "#e3a4c1" },
  team: { label: "Командный проект", color: "#f2b27a" },
  res: { label: "Ресёрч", color: "#a99be0" },
  tech: { label: "Tech&AI", color: "#8fc3cc" },
  fest: { label: "FEST", color: "#e9cd78" },
};

export const EMPTY_ENTRY: Omit<PlanEntry, "id"> = {
  start_month: "",
  end_month: "",
  phase: "act",
  title: "",
  short: "",
  format: "individual",
  focus: "",
  result: "",
  steps: "",
  diff: "",
  grade10: "",
  home: "",
  takeaway: "",
};

export async function loadPlan(supabase: SupabaseClient): Promise<PlanEntry[]> {
  const { data, error } = await supabase.from("program_plan").select(PLAN_COLUMNS).order("start_month");
  if (error) throw error;
  return (data as PlanEntry[]) ?? [];
}

export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Все месяцы, которые покрывает пункт плана. */
export function monthsOf(e: Pick<PlanEntry, "start_month" | "end_month">): string[] {
  const out: string[] = [];
  for (let m = e.start_month; m <= e.end_month && out.length < 24; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function entryFor(plan: PlanEntry[], month: string): PlanEntry | null {
  return plan.find((e) => e.start_month <= month && month <= e.end_month) ?? null;
}

export function currentMonth(now = new Date()): string {
  const local = new Date(now.getTime() + 5 * 3600 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** «Август–сентябрь» / «Ноябрь». */
export function periodLabel(e: Pick<PlanEntry, "start_month" | "end_month">): string {
  const a = monthNominative(e.start_month);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return e.start_month === e.end_month ? cap(a) : `${cap(a)}–${monthNominative(e.end_month)}`;
}

export function isGrade10(className: string | null | undefined): boolean {
  return /^\s*10/.test(className ?? "");
}

export function stepLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Блок «Что дальше» для месячного отчёта: месяц после отчётного.
 * Если следующий месяц — продолжение того же пункта (август → сентябрь), пишем «продолжаем».
 */
export function nextStepText(plan: PlanEntry[], reportMonth: string, className: string): string | null {
  const next = addMonths(reportMonth, 1);
  const e = entryFor(plan, next);
  if (!e) return null;
  const same = entryFor(plan, reportMonth)?.id === e.id;
  const lines: string[] = [];
  lines.push(`В ${monthPrepositional(next)} ${same ? "продолжаем" : "у нас фокус на"}: ${e.title}`);
  const what = isGrade10(className) && e.grade10.trim() ? e.grade10.trim() : e.result.trim();
  if (what) lines.push(what);
  if (e.home.trim()) lines.push(`Как помочь дома: ${e.home.trim()}`);
  return lines.join("\n");
}
