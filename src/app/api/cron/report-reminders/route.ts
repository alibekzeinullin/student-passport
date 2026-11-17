import { createAdminClient, errorResponse, HttpError } from "@/lib/supabase/admin";
import { runReminders } from "@/lib/report-reminders";
import { botToken } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function origin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return env ? env.replace(/\/$/, "") : new URL(request.url).origin;
}

/** Vercel Cron, каждый день в 09:00 по Алматы: в конце месяца напомнить ментору про отчёты родителям. */
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "unauthorized", "Нет доступа");
    if (!botToken()) return Response.json({ skipped: "no bot" });
    const admin = createAdminClient();
    if (!admin) throw new HttpError(503, "no_service_key", "SUPABASE_SERVICE_ROLE_KEY не задан");
    const result = await runReminders(admin, origin(request));
    console.log("report reminders", result);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
