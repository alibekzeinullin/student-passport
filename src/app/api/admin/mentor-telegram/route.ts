import { randomInt } from "node:crypto";
import { errorResponse, HttpError, requireAdminCaller } from "@/lib/supabase/admin";
import { almatyToday, reminderMonth, reminderText, reportsSummary } from "@/lib/report-reminders";
import { botToken, getMe, sendMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function origin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return env ? env.replace(/\/$/, "") : new URL(request.url).origin;
}

/** Личные напоминания ментору в Telegram: подключить, отключить, прислать пробное. */
export async function POST(request: Request) {
  try {
    const { admin, userId } = await requireAdminCaller(request);
    const body = (await request.json().catch(() => ({}))) as { action?: "link" | "unlink" | "test"; month?: string };
    if (!botToken()) throw new HttpError(400, "no_bot", "Сначала подключите бота");

    if (body.action === "link") {
      const me = await getMe();
      for (let i = 0; i < 10; i++) {
        const code = String(randomInt(100000, 1000000));
        const { error } = await admin.from("mentor_telegram").upsert({ user_id: userId, link_code: code }, { onConflict: "user_id" });
        if (!error) return Response.json({ code, url: `https://t.me/${me.username}?start=r${code}` });
        if (!error.message.includes("link_code")) throw error;
      }
      throw new HttpError(500, "code", "Не удалось придумать код, попробуйте ещё раз");
    }

    if (body.action === "unlink") {
      const { error } = await admin.from("mentor_telegram").delete().eq("user_id", userId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "test") {
      const { data } = await admin.from("mentor_telegram").select("chat_id").eq("user_id", userId).maybeSingle();
      const chatId = (data as { chat_id: number | null } | null)?.chat_id;
      if (!chatId) throw new HttpError(400, "not_linked", "Напоминания ещё не подключены");
      const month = body.month && /^\d{4}-\d{2}$/.test(body.month) ? body.month : (reminderMonth(almatyToday()) ?? almatyToday().slice(0, 7));
      const sum = await reportsSummary(admin, month, origin(request));
      await sendMessage(chatId, reminderText(sum, origin(request)));
      return Response.json({ ok: true });
    }

    throw new HttpError(400, "bad_request", "Неизвестное действие");
  } catch (err) {
    return errorResponse(err);
  }
}
