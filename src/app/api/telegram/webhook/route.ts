import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { answerCallback, botToken, sendMessage, webhookSecret } from "@/lib/telegram";

export const dynamic = "force-dynamic";

interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}

interface TgUpdate {
  message?: { chat: TgChat; text?: string; migrate_to_chat_id?: number };
  callback_query?: { id: string; data?: string; message?: { chat: TgChat } };
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Вебхук бота: /connect КОД в группе привязывает её к ученику; кнопки «Прочитали» / «Есть вопрос». */
export async function POST(request: Request) {
  if (!botToken()) return new Response("no bot", { status: 503 });
  const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!sameSecret(secret, webhookSecret())) return new Response("forbidden", { status: 403 });
  const admin = createAdminClient();
  if (!admin) return new Response("no service key", { status: 503 });

  const update = (await request.json().catch(() => ({}))) as TgUpdate;
  try {
    const msg = update.message;
    if (msg?.migrate_to_chat_id) {
      // группа стала супергруппой — у неё новый id
      await admin.from("student_telegram").update({ chat_id: msg.migrate_to_chat_id }).eq("chat_id", msg.chat.id);
    } else if (msg?.text) {
      const text = msg.text.trim();
      const connect = text.match(/^\/connect(?:@\w+)?\s+(\d{4,8})\b/i);
      if (connect) {
        if (msg.chat.type !== "group" && msg.chat.type !== "supergroup") {
          await sendMessage(msg.chat.id, "Команду /connect нужно отправить в Telegram-группе ученика, куда добавлен бот.");
        } else {
          const { data: row } = await admin.from("student_telegram").select("student_id").eq("link_code", connect[1]).maybeSingle();
          const studentId = (row as { student_id: string } | null)?.student_id;
          if (!studentId) {
            await sendMessage(msg.chat.id, "Код не найден. Возьмите новый код на сайте (Менторство → Родителям) и отправьте /connect КОД ещё раз.");
          } else {
            // группа могла быть привязана к другому ученику — отвязываем
            await admin.from("student_telegram").update({ chat_id: null, chat_title: "", linked_at: null }).eq("chat_id", msg.chat.id);
            await admin
              .from("student_telegram")
              .update({ chat_id: msg.chat.id, chat_title: msg.chat.title ?? "", link_code: null, linked_at: new Date().toISOString() })
              .eq("student_id", studentId);
            const { data: s } = await admin.from("students").select("first_name, last_name").eq("id", studentId).maybeSingle();
            const name = s ? `${(s as { first_name: string }).first_name} ${(s as { last_name: string }).last_name}`.trim() : "ученика";
            await sendMessage(msg.chat.id, `Готово! Группа подключена к дневнику TODAY Scholars: ${name}. Сюда будут приходить итоги месяца.`);
          }
        }
      } else if (/^\/start\b/.test(text) && msg.chat.type === "private") {
        await sendMessage(
          msg.chat.id,
          "Салем! Это бот TODAY Scholars. Он присылает итоги месяца в группу ученика. Добавьте бота в группу и отправьте там /connect КОД — код выдаёт ментор.",
        );
      }
    }

    const cb = update.callback_query;
    if (cb?.data) {
      const [kind, rawId] = cb.data.split(":");
      // кнопка должна прийти из той же группы, куда ушёл отчёт
      let reportId = "";
      if (rawId && /^[0-9a-f-]{36}$/i.test(rawId) && cb.message?.chat.id) {
        const { data: rep } = await admin.from("parent_reports").select("student_id").eq("id", rawId).maybeSingle();
        const sid = (rep as { student_id: string } | null)?.student_id;
        if (sid) {
          const { data: tg } = await admin.from("student_telegram").select("chat_id").eq("student_id", sid).maybeSingle();
          if (Number((tg as { chat_id: number | null } | null)?.chat_id) === cb.message.chat.id) reportId = rawId;
        }
      }
      if (kind === "r" && reportId) {
        await admin.from("parent_reports").update({ read_at: new Date().toISOString() }).eq("id", reportId).is("read_at", null);
        await answerCallback(cb.id, "Спасибо! Ментор увидит, что вы прочитали.");
      } else if (kind === "q" && reportId) {
        await admin.from("parent_reports").update({ question_at: new Date().toISOString() }).eq("id", reportId);
        await answerCallback(cb.id, "Напишите вопрос в группе — ментор ответит.");
        if (cb.message?.chat.id) await sendMessage(cb.message.chat.id, "Напишите, пожалуйста, ваш вопрос здесь в группе — ментор ответит.");
      } else {
        await answerCallback(cb.id, "");
      }
    }
  } catch (err) {
    console.error("telegram webhook", err);
  }
  // Telegram всегда получает 200, иначе будет повторять одно и то же обновление
  return Response.json({ ok: true });
}
