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

/** Проверяет, что запрос пришёл от залогиненного админа. */
export async function requireAdmin(request: Request): Promise<SupabaseClient> {
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
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role !== "admin") {
    throw new HttpError(403, "forbidden", "Только для ментора");
  }
  return admin;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.code, message: err.message }, { status: err.status });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Ошибка сервера";
  return Response.json({ error: "server_error", message }, { status: 500 });
}
