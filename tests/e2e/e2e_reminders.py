"""E2E: чеклист отчётов и напоминания ментору в Telegram. После e2e_reports.py (бот подключён, поддельный Telegram на :3999)."""
import json
import os
import re
import subprocess
import urllib.request
from playwright.sync_api import sync_playwright, expect

os.environ["no_proxy"] = os.environ["NO_PROXY"] = "localhost,127.0.0.1,e2e.supabase.co"
E2E_DIR = os.environ.get("E2E_DIR", os.path.dirname(os.path.abspath(__file__)))
BASE = "http://localhost:3000"
LOG = E2E_DIR + "/fake-telegram.log"
SECRET = __import__("hashlib").sha256(b"webhook:123:TESTTOKEN").hexdigest()[:48]
results: list[str] = []


def sql(q: str) -> str:
    return subprocess.run(["su", "postgres", "-c", f'psql -d e2e -tAc "{q}"'], capture_output=True, text=True).stdout.strip()


def ok(cond: bool, msg: str):
    results.append(("ok   " if cond else "FAIL ") + msg)
    print(results[-1], flush=True)
    if not cond:
        raise SystemExit(1)


def tg(method: str) -> list[dict]:
    if not os.path.exists(LOG):
        return []
    return [r["data"] for r in (json.loads(l) for l in open(LOG, encoding="utf-8") if l.strip()) if r["method"] == method]


def post(path: str, body: dict, headers: dict) -> int:
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={"content-type": "application/json", **headers}, method="POST")
    try:
        return urllib.request.urlopen(req).status
    except urllib.error.HTTPError as e:
        return e.code


def get(path: str, headers: dict) -> tuple[int, str]:
    req = urllib.request.Request(BASE + path, headers=headers)
    try:
        r = urllib.request.urlopen(req)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


# cron без секрета закрыт; не в конце месяца — молчит
ok(get("/api/cron/report-reminders", {})[0] == 401, "cron без секрета закрыт")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU")
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    page.on("popup", lambda pop: pop.close())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE + "/")
    page.get_by_placeholder("aylin.duysenova или you@email.com").fill("alibek")
    page.get_by_placeholder("Введите пароль").fill("Admin-1234")
    page.get_by_role("button", name="Войти").click()
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/reports")

    # 1. Чеклист
    expect(page.locator("#check-h")).to_contain_text("отправлено")
    total = int(page.locator("section").filter(has=page.locator("#check-h")).locator("li").count())
    sent = int(sql("select count(*) from parent_reports where status='sent' and month=to_char(now() at time zone 'Asia/Almaty','YYYY-MM')"))
    expect(page.locator("#check-h")).to_contain_text(f"отправлено {sent} из {total}")
    ok(total >= 3, f"в чеклисте все ученики ({total})")
    page.locator("section").filter(has=page.locator("#check-h")).get_by_role("button", name=re.compile("^Ахметов Тимур")).click()
    expect(page.locator("section[id^='rep-']", has_text="Ахметов Тимур").get_by_label("Общее впечатление за месяц")).to_be_visible()
    ok(True, "клик в чеклисте открывает карточку")

    # 2. Подключение напоминаний: ссылка на бота → /start rКОД в личке
    page.get_by_role("button", name="Подключить", exact=True).click()
    link = page.get_by_role("link", name="открыть бота")
    expect(link).to_be_visible()
    href = link.get_attribute("href") or ""
    m = re.search(r"start=r(\d{6})$", href)
    ok(bool(m) and "t.me/test_scholars_bot" in href, "ссылка на бота с кодом")
    code = m.group(1)
    ok(post("/api/telegram/webhook", {"message": {"chat": {"id": 555, "type": "private"}, "text": f"/start r{code}"}}, {"x-telegram-bot-api-secret-token": SECRET}) == 200, "вебхук принял /start")
    ok(sql("select chat_id from mentor_telegram") == "555", "личный чат ментора сохранён")
    ok(any(d["chat_id"] == 555 and "буду напоминать" in d["text"] for d in tg("sendMessage")), "бот подтвердил подключение")
    page.get_by_role("button", name="я нажал Start — проверить").click()
    expect(page.get_by_text("· включены")).to_be_visible()

    # 3. Пробное напоминание
    page.get_by_role("button", name="Прислать сейчас").click()
    expect(page.get_by_text("Отправил в Telegram")).to_be_visible()
    rem = [d for d in tg("sendMessage") if d["chat_id"] == 555 and "Напоминание" in d["text"]]
    ok(len(rem) == 1 and "Ещё не отправлено:" in rem[0]["text"] and "/admin/reports" in rem[0]["text"], "напоминание со списком неотправленных")
    print(rem[0]["text"])

    # 4. Чужой не видит запись ментора; cron с секретом работает
    code, body = get("/api/cron/report-reminders", {"authorization": "Bearer test-cron"})
    ok(code == 200 and "month" in body, f"cron с секретом: {body}")

    # 5. Отключение
    page.get_by_role("button", name="отключить").click()
    expect(page.get_by_text("Напоминания отключены")).to_be_visible()
    ok(sql("select count(*) from mentor_telegram") == "0", "отключено")

    ok(not errors, f"нет ошибок JS: {errors}")
    browser.close()

print(f"\n{sum(r.startswith('ok') for r in results)} проверок пройдено")
