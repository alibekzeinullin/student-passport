"use client";

import { createClient } from "@/lib/supabase/client";

/** Запрос к серверному маршруту с токеном текущего пользователя. */
export async function callApi<T>(path: string, method: string, body?: unknown): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    const err = new Error(json.message ?? `Ошибка ${res.status}`) as Error & { code?: string };
    err.code = json.error;
    throw err;
  }
  return json;
}

export function formatSeen(iso: string | null): string {
  if (!iso) return "ни разу не входил";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн. назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function todayLocal(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
}
