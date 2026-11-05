import { createAdminClient, errorResponse, HttpError, requireAdmin } from "@/lib/supabase/admin";
import { buildAllMonthlyDrafts, previousMonthPrefix } from "@/lib/monthly-auto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron, 1-го числа: черновики за прошлый месяц. Защищено CRON_SECRET. */
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    const auth = request.headers.get("authorization") ?? "";
    if (!secret || auth !== `Bearer ${secret}`) {
      throw new HttpError(401, "unauthorized", "Нет доступа");
    }
    const admin = createAdminClient();
    if (!admin) throw new HttpError(503, "no_service_key", "SUPABASE_SERVICE_ROLE_KEY не задан");
    const result = await buildAllMonthlyDrafts(admin, previousMonthPrefix());
    console.log("monthly drafts", result);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Ментор вручную: { month: "2026-11" } — собрать сейчас у всех. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { month?: string };
    const month = body.month && /^\d{4}-\d{2}$/.test(body.month) ? body.month : previousMonthPrefix();
    const result = await buildAllMonthlyDrafts(admin, month);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
