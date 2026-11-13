import "server-only";
import { createHash } from "node:crypto";

/** Telegram Bot API. Токен — переменная TELEGRAM_BOT_TOKEN в Vercel (бот создаётся в @BotFather). */

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

/** Секрет вебхука выводится из токена — отдельная переменная не нужна. */
export function webhookSecret(token = botToken()): string {
  return token ? createHash("sha256").update(`webhook:${token}`).digest("hex").slice(0, 48) : "";
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан в Vercel");
  // TELEGRAM_API_BASE — только для локальных тестов (поддельный Telegram); в Vercel не задаётся.
  const base = process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org";
  const res = await fetch(`${base}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) {
    const d = json.description ?? `HTTP ${res.status}`;
    if (d.includes("chat not found") || d.includes("bot was kicked") || d.includes("not a member")) {
      throw new Error("Бот не в группе: добавьте его в группу снова и подключите заново");
    }
    throw new Error(`Telegram: ${d}`);
  }
  return json.result as T;
}

export function sendMessage(chatId: number | string, text: string, buttons?: InlineButton[][]) {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function answerCallback(callbackId: string, text: string) {
  return call<boolean>("answerCallbackQuery", { callback_query_id: callbackId, text, show_alert: false });
}

export function getMe() {
  return call<{ username: string; first_name: string }>("getMe", {});
}

export function getWebhookInfo() {
  return call<{ url: string; last_error_message?: string; pending_update_count?: number }>("getWebhookInfo", {});
}

export function setWebhook(url: string) {
  return call<boolean>("setWebhook", {
    url,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}
