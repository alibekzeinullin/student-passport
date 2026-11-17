import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadReportsData } from "@/lib/parent-reports-server";
import { almatyToday, monthNominative, reminderMonth } from "@/lib/parent-report";

export { almatyToday, reminderMonth };
import { sendMessage } from "@/lib/telegram";

export interface ReminderSummary {
  month: string;
  total: number;
  sent: number;
  notSent: string[];
}

export async function reportsSummary(admin: SupabaseClient, month: string, origin: string): Promise<ReminderSummary> {
  const list = await loadReportsData(admin, month, origin);
  const notSent = list.filter((s) => s.report?.status !== "sent").map((s) => s.name);
  return { month, total: list.length, sent: list.length - notSent.length, notSent };
}

export function reminderText(sum: ReminderSummary, origin: string): string {
  const out = [`Салем! Напоминание: отчёты родителям за ${monthNominative(sum.month)}.`, "", `Отправлено: ${sum.sent} из ${sum.total}`];
  if (sum.notSent.length) {
    out.push("", "Ещё не отправлено:");
    sum.notSent.slice(0, 30).forEach((n) => out.push(`— ${n}`));
    if (sum.notSent.length > 30) out.push(`… и ещё ${sum.notSent.length - 30}`);
  }
  out.push("", `Открыть: ${origin}/admin/reports`);
  return out.join("\n");
}

/** Разослать напоминания всем подключённым менторам. Один раз в день; если всё отправлено — молчим. */
export async function runReminders(admin: SupabaseClient, origin: string, today = almatyToday()): Promise<{ month: string | null; reminded: number; reason?: string }> {
  const month = reminderMonth(today);
  if (!month) return { month: null, reminded: 0, reason: "не конец месяца" };
  const { data, error } = await admin.from("mentor_telegram").select("user_id, chat_id, last_reminded_on").not("chat_id", "is", null);
  if (error) throw error;
  const mentors = ((data as { user_id: string; chat_id: number; last_reminded_on: string | null }[]) ?? []).filter((m) => m.last_reminded_on !== today);
  if (!mentors.length) return { month, reminded: 0, reason: "некому или уже напомнили" };
  const sum = await reportsSummary(admin, month, origin);
  if (!sum.notSent.length) return { month, reminded: 0, reason: "всё отправлено" };
  const text = reminderText(sum, origin);
  let reminded = 0;
  for (const m of mentors) {
    try {
      await sendMessage(m.chat_id, text);
      await admin.from("mentor_telegram").update({ last_reminded_on: today }).eq("user_id", m.user_id);
      reminded += 1;
    } catch (err) {
      console.error("reminder", m.user_id, err);
    }
  }
  return { month, reminded };
}
