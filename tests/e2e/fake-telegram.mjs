// Поддельный Telegram Bot API для e2e: отвечает ok и пишет вызовы в fake-telegram.log (JSON по строке).
import http from "node:http";
import fs from "node:fs";
const LOG = new URL("./fake-telegram.log", import.meta.url).pathname;
let webhook = "";
let id = 100;
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const method = req.url.split("/").pop();
      const data = body ? JSON.parse(body) : {};
      fs.appendFileSync(LOG, JSON.stringify({ method, data }) + "\n");
      let result = true;
      if (method === "getMe") result = { id: 1, is_bot: true, username: "test_scholars_bot" };
      if (method === "setWebhook") webhook = data.url;
      if (method === "getWebhookInfo") result = { url: webhook, pending_update_count: 0 };
      if (method === "sendMessage") result = { message_id: ++id, chat: { id: data.chat_id } };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, result }));
    });
  })
  .listen(3999, () => console.log("fake telegram :3999"));
