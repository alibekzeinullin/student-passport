import { randomInt } from "node:crypto";
import { errorResponse, HttpError, requireAdmin } from "@/lib/supabase/admin";
import { loadReportsData, messageFor } from "@/lib/parent-reports-server";
import { botToken, getMe, getWebhookInfo, sendMessage, setWebhook } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MONTH_RE = /^\d{4}-\d{2}$/;

function origin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return new URL(request.url).origin;
}

function tableMissing(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "");
  return /parent_reports|student_telegram|parent_win/.test(m) && /does not exist|schema cache|could not find/i.test(m);
}

/** Данные страницы «Родителям»: ученики, их отчёты о встречах за месяц, цифры, Telegram, статус бота. */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!MONTH_RE.test(month)) throw new HttpError(400, "bad_month", "Нужен месяц YYYY-MM");

    let students;
    try {
      students = await loadReportsData(admin, month, origin(request));
    } catch (err) {
      if (tableMissing(err)) throw new HttpError(409, "no_tables", "В базе нет таблиц отчётов — нужно применить supabase/migration-parent-reports.sql");
      throw err;
    }

    let bot: { configured: boolean; username: string | null; webhook: boolean; error: string | null } = {
      configured: Boolean(botToken()),
      username: null,
      webhook: false,
      error: null,
    };
    if (bot.configured) {
      try {
        const [me, hook] = await Promise.all([getMe(), getWebhookInfo()]);
        bot = { ...bot, username: me.username, webhook: hook.url.endsWith("/api/telegram/webhook"), error: hook.last_error_message ?? null };
      } catch (err) {
        bot.error = (err as Error).message;
      }
    }
    return Response.json({ month, students, bot });
  } catch (err) {
    return errorResponse(err);
  }
}

interface Body {
  action?: "save" | "send" | "link-code" | "unlink" | "setup-bot";
  studentId?: string;
  month?: string;
  overall?: string;
  groupNote?: string;
  help?: string;
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = (await request.json()) as Body;

    if (body.action === "setup-bot") {
      if (!botToken()) throw new HttpError(400, "no_token", "Сначала добавьте TELEGRAM_BOT_TOKEN в Vercel и сделайте Redeploy");
      await setWebhook(`${origin(request)}/api/telegram/webhook`);
      const me = await getMe();
      return Response.json({ ok: true, username: me.username });
    }

    const studentId = body.studentId ?? "";
    if (!studentId) throw new HttpError(400, "bad_request", "Нет ученика");

    if (body.action === "link-code") {
      // 6 цифр, свободный код
      for (let i = 0; i < 10; i++) {
        const code = String(randomInt(100000, 1000000));
        const { error } = await admin.from("student_telegram").upsert({ student_id: studentId, link_code: code }, { onConflict: "student_id" });
        if (!error) return Response.json({ code });
        if (!error.message.includes("link_code")) throw error;
      }
      throw new HttpError(500, "code", "Не удалось придумать код, попробуйте ещё раз");
    }

    if (body.action === "unlink") {
      const { error } = await admin.from("student_telegram").update({ chat_id: null, chat_title: "", linked_at: null }).eq("student_id", studentId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    const month = body.month ?? "";
    if (!MONTH_RE.test(month)) throw new HttpError(400, "bad_month", "Нужен месяц YYYY-MM");
    const draft = { overall: body.overall?.trim() ?? "", groupNote: body.groupNote?.trim() ?? "", help: body.help?.trim() ?? "" };
    const [data] = await loadReportsData(admin, month, origin(request), studentId);
    if (!data) throw new HttpError(404, "not_found", "Ученик не найден среди учеников менторства");
    const message = messageFor(data, month, draft);

    const { data: saved, error: saveErr } = await admin
      .from("parent_reports")
      .upsert(
        { student_id: studentId, month, overall: draft.overall, group_note: draft.groupNote, help: draft.help, message },
        { onConflict: "student_id,month" },
      )
      .select("id")
      .single();
    if (saveErr) throw saveErr;
    const reportId = (saved as { id: string }).id;

    if (body.action === "save") return Response.json({ ok: true, reportId });

    if (body.action === "send") {
      const { data: tg } = await admin.from("student_telegram").select("chat_id").eq("student_id", studentId).maybeSingle();
      const chatId = (tg as { chat_id: number | null } | null)?.chat_id;
      if (!chatId) throw new HttpError(400, "no_chat", "Telegram-группа ученика не подключена");
      const sent = await sendMessage(chatId, message, [
        [
          { text: "Прочитали 👍", callback_data: `r:${reportId}` },
          { text: "Есть вопрос", callback_data: `q:${reportId}` },
        ],
      ]);
      const { error } = await admin
        .from("parent_reports")
        .update({ status: "sent", sent_at: new Date().toISOString(), telegram_message_id: sent.message_id })
        .eq("id", reportId);
      if (error) throw error;
      return Response.json({ ok: true, reportId });
    }

    throw new HttpError(400, "bad_request", "Неизвестное действие");
  } catch (err) {
    return errorResponse(err);
  }
}
