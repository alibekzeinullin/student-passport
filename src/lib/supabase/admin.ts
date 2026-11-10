import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Серверный клиент с service role ключом. Ключ хранится только в
 * переменных окружения Vercel (SUPABASE_SERVICE_ROLE_KEY) и никогда
 * не попадает в браузер.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Caller {
  admin: SupabaseClient;
  userId: string;
  name: string;
  roles: string[];
}

/** Кто прислал запрос: пользователь по токену + профиль + роли сотрудника. */
export async function getCaller(request: Request): Promise<Caller & { profileRole: string; active: boolean }> {
  const admin = createAdminClient();
  if (!admin) {
    throw new HttpError(503, "no_service_key", "SUPABASE_SERVICE_ROLE_KEY не задан");
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new HttpError(401, "unauthorized", "Нужен вход");

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthorized", "Сессия истекла");

  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name")
    .eq("id", data.user.id)
    .maybeSingle();
  const p = profile as { role?: string; full_name?: string } | null;

  // Таблицы сотрудников появляются с migration-sat-1.sql — до неё работаем как раньше
  let roles: string[] = [];
  let active = true;
  const { data: member, error: mErr } = await admin
    .from("staff_members")
    .select("active, staff_roles(role)")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!mErr && member) {
    const m = member as { active: boolean; staff_roles: { role: string }[] | null };
    active = m.active;
    roles = (m.staff_roles ?? []).map((r) => r.role);
  }

  return {
    admin,
    userId: data.user.id,
    name: p?.full_name || data.user.email || "",
    roles,
    profileRole: p?.role ?? "",
    active,
  };
}

/** Проверяет, что запрос пришёл от залогиненного админа (ментор или руководитель). */
export async function requireAdmin(request: Request): Promise<SupabaseClient> {
  const caller = await getCaller(request);
  if (caller.profileRole !== "admin" || !caller.active) {
    throw new HttpError(403, "forbidden", "Только для ментора");
  }
  return caller.admin;
}

/** Только руководитель (страница «Команда»). */
export async function requireHead(request: Request): Promise<Caller> {
  const caller = await getCaller(request);
  if (!caller.active || !caller.roles.includes("head")) {
    throw new HttpError(403, "forbidden", "Только для руководителя");
  }
  return caller;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.code, message: err.message }, { status: err.status });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Ошибка сервера";
  return Response.json({ error: "server_error", message }, { status: 500 });
}
