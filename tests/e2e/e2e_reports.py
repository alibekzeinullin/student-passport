"""E2E: отчёты родителям — отчёт о встрече, сборка за месяц, Telegram (поддельный API на :3999).
Тест сам запускает tests/e2e/fake-telegram.mjs; next запущен с TELEGRAM_BOT_TOKEN=123:TESTTOKEN TELEGRAM_API_BASE=http://127.0.0.1:3999."""
import hashlib
import json
import os
import re
import subprocess
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect, Page

os.environ["no_proxy"] = os.environ["NO_PROXY"] = "localhost,127.0.0.1,e2e.supabase.co"
E2E_DIR = os.environ.get("E2E_DIR", os.path.dirname(os.path.abspath(__file__)))
BASE = "http://localhost:3000"
LOG = E2E_DIR + "/fake-telegram.log"
TOKEN = "123:TESTTOKEN"
SECRET = hashlib.sha256(f"webhook:{TOKEN}".encode()).hexdigest()[:48]
results: list[str] = []
NOW = datetime.now(ZoneInfo("Asia/Almaty"))
MONTH = f"{NOW.year}-{NOW.month:02d}"
CHAT = -100777


def sql(q: str) -> str:
    return subprocess.run(["su", "postgres", "-c", f'psql -d e2e -tAc "{q}"'], capture_output=True, text=True).stdout.strip()


def ok(cond: bool, msg: str):
    results.append(("ok   " if cond else "FAIL ") + msg)
    print(results[-1], flush=True)
    if not cond:
        raise SystemExit(1)


def tg_calls(method: str) -> list[dict]:
    if not os.path.exists(LOG):
        return []
    rows = [json.loads(line) for line in open(LOG, encoding="utf-8") if line.strip()]
    return [r["data"] for r in rows if r["method"] == method]


def webhook(update: dict, secret: str = SECRET) -> int:
    req = urllib.request.Request(
        BASE + "/api/telegram/webhook",
        data=json.dumps(update).encode(),
        headers={"content-type": "application/json", "x-telegram-bot-api-secret-token": secret},
        method="POST",
    )
    try:
        return urllib.request.urlopen(req).status
    except urllib.error.HTTPError as e:
        return e.code


def login(page: Page, login: str, password: str):
    page.goto(BASE + "/")
    page.get_by_placeholder("aylin.duysenova или you@email.com").fill(login)
    page.get_by_placeholder("Введите пароль").fill(password)
    page.get_by_role("button", name="Войти").click()


if os.path.exists(LOG):
    os.remove(LOG)
# поддельный Telegram — каждый раз чистый
subprocess.run(["pkill", "-f", "fake-telegram.mjs"])
subprocess.Popen(["node", E2E_DIR + "/fake-telegram.mjs"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
import time

time.sleep(1)

# Две индивидуальные встречи Айлин в этом месяце, одна с отчётом о встрече
aylin = sql("select id from students where first_name='Айлин'")
sql(f"delete from meetings where student_id='{aylin}'")
m1 = sql(f"insert into meetings (student_id, meeting_date, format, attendance) values ('{aylin}', '{MONTH}-01', 'individual', 'present') returning id").splitlines()[0]
sql(f"insert into meetings (student_id, meeting_date, format, attendance) values ('{aylin}', '{MONTH}-02', 'individual', 'present')")
sql(
    "insert into meeting_mentor_notes (meeting_id, plan, parent_win, parent_focus, parent_help) values "
    f"('{m1}', 'внутренний план', 'Сама выбрала тему эссе', 'Структура эссе', 'Спросите про тему за ужином')"
)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 0. Ученик не видит отчёт о встрече (заметки ментора закрыты RLS)
    login(page, "aylin", "Stud-1234")
    page.wait_for_url(re.compile(r"/(dashboard|student)"))
    page.wait_for_load_state("networkidle")
    import ssl

    ctx = ssl.create_default_context(cafile=E2E_DIR + "/cert.pem")
    auth = urllib.request.Request(
        "https://e2e.supabase.co/auth/v1/token?grant_type=password",
        data=json.dumps({"email": "aylin@students.todayscholars.local", "password": "Stud-1234"}).encode(),
        headers={"apikey": os.environ["ANON"], "content-type": "application/json"},
    )
    token = json.loads(urllib.request.urlopen(auth, context=ctx).read())["access_token"]
    ok(bool(token), "у ученика есть сессия")
    req = urllib.request.Request(
        "https://e2e.supabase.co/rest/v1/meeting_mentor_notes?select=parent_win",
        headers={"apikey": os.environ["ANON"], "authorization": f"Bearer {token}"},
    )
    rows = json.loads(urllib.request.urlopen(req, context=ctx).read())
    ok(rows == [], "ученик не читает отчёты о встречах через API")
    req = urllib.request.Request("https://e2e.supabase.co/rest/v1/parent_reports?select=id", headers={"apikey": os.environ["ANON"], "authorization": f"Bearer {token}"})
    ok(json.loads(urllib.request.urlopen(req, context=ctx).read()) == [], "ученик не читает parent_reports")
    page.get_by_role("button", name="Выйти").first.click()
    page.wait_for_url(BASE + "/")

    # 1. Ментор: страница и подключение бота
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.get_by_role("link", name="Родителям").first.click()
    expect(page.get_by_role("heading", name="Отчёты родителям")).to_be_visible()
    page.get_by_role("button", name="Подключить бота к сайту").click()
    expect(page.get_by_text("Бот подключён к сайту")).to_be_visible()
    expect(page.get_by_text("@test_scholars_bot")).to_be_visible()
    hooks = tg_calls("setWebhook")
    ok(len(hooks) == 1 and hooks[0]["url"].endswith("/api/telegram/webhook") and hooks[0]["secret_token"] == SECRET, "вебхук поставлен с секретом")

    # 2. Карточка Айлин: встречи собраны
    page.get_by_role("button", name=re.compile("Дуйсенова Айлин")).click()
    card = page.locator("section", has=page.get_by_role("button", name=re.compile("Дуйсенова Айлин")))
    expect(card.get_by_text("Получилось: Сама выбрала тему эссе")).to_be_visible()
    expect(card.get_by_text("Отчёт о встрече не заполнен")).to_be_visible()
    preview = card.locator("pre")
    expect(preview).to_contain_text("Итоги")
    expect(preview).to_contain_text("Сама выбрала тему эссе")
    expect(preview).to_contain_text("Спросите про тему за ужином")
    ok("внутренний план" not in preview.inner_text(), "внутренний план не попадает в отчёт")

    # 3. Общий текст про групповые встречи → вставить всем
    page.locator("#group-all").fill("Разбирали, как выбрать тему проекта")
    page.get_by_role("button", name="Вставить всем, у кого пусто").click()
    expect(preview).to_contain_text("Разбирали, как выбрать тему проекта")
    card.get_by_label("Общее впечатление за месяц").fill("Месяц сильный, стала самостоятельнее.")
    expect(preview).to_contain_text("Месяц сильный")
    card.get_by_role("button", name="Сохранить").click()
    expect(page.get_by_text("Дуйсенова Айлин: черновик сохранён")).to_be_visible()
    ok(sql(f"select overall from parent_reports where student_id='{aylin}' and month='{MONTH}'") == "Месяц сильный, стала самостоятельнее.", "черновик в базе")

    # 4. Привязка группы кодом
    # черновик Тимура (не сохранён) не должен пропасть после сохранения Айлин
    timur_btn = page.get_by_role("button", name=re.compile("Ахметов Тимур"))
    timur_btn.click()
    timur = page.locator("section", has=timur_btn)
    expect(timur.get_by_label("Групповые встречи")).to_have_value("Разбирали, как выбрать тему проекта")
    timur_btn.click()
    card.get_by_role("button", name="Подключить группу — получить код").click()
    code_el = card.get_by_text(re.compile(r"^/connect \d{6}$"))
    expect(code_el).to_be_visible()
    code = code_el.inner_text().split()[1]
    ok(webhook({"message": {"chat": {"id": CHAT, "type": "group", "title": "Айлин + родители"}, "text": f"/connect {code}"}}, "wrong") == 403, "чужой запрос без секрета отклонён")
    ok(sql(f"select count(*) from student_telegram where chat_id={CHAT}") == "0", "без секрета группа не привязана")
    ok(webhook({"message": {"chat": {"id": CHAT, "type": "group", "title": "Айлин + родители"}, "text": "/connect 999999"}}) == 200, "неверный код — ответ 200")
    ok(any("Код не найден" in m["text"] for m in tg_calls("sendMessage")), "бот сообщил: код не найден")
    webhook({"message": {"chat": {"id": CHAT, "type": "group", "title": "Айлин + родители"}, "text": f"/connect@test_scholars_bot {code}"}})
    ok(sql(f"select chat_id from student_telegram where student_id='{aylin}'") == str(CHAT), "группа привязана к Айлин")
    ok(any(m["chat_id"] == CHAT and "Готово" in m["text"] for m in tg_calls("sendMessage")), "бот подтвердил в группе")

    # 5. Отправка
    page.reload()
    page.get_by_role("button", name=re.compile("Дуйсенова Айлин")).click()
    expect(card.get_by_text("Айлин + родители").first).to_be_visible()
    expect(card.get_by_label("Общее впечатление за месяц")).to_have_value("Месяц сильный, стала самостоятельнее.")
    card.get_by_role("button", name="Отправить в группу").click()
    expect(page.get_by_text("Дуйсенова Айлин: отчёт отправлен в Telegram")).to_be_visible()
    sent = [m for m in tg_calls("sendMessage") if m["chat_id"] == CHAT and "Итоги" in m["text"]]
    ok(len(sent) == 1, "отчёт ушёл в группу один раз")
    text = sent[0]["text"]
    ok("Месяц сильный" in text and "Сама выбрала тему эссе" in text and "Разбирали, как выбрать тему проекта" in text, "в тексте всё нужное")
    ok("внутренний план" not in text, "внутреннего плана нет в отправленном")
    buttons = [b["callback_data"] for row in sent[0]["reply_markup"]["inline_keyboard"] for b in row]
    rid = sql(f"select id from parent_reports where student_id='{aylin}' and month='{MONTH}'")
    ok(buttons == [f"r:{rid}", f"q:{rid}"], "кнопки «Прочитали» и «Есть вопрос»")
    ok(sql(f"select status from parent_reports where id='{rid}'") == "sent", "статус «отправлено»")

    # 6. Кнопки из чужой группы игнорируются, из своей — отмечаются
    webhook({"callback_query": {"id": "c1", "data": f"r:{rid}", "message": {"chat": {"id": -1009999, "type": "group"}}}})
    ok(sql(f"select read_at is null from parent_reports where id='{rid}'") == "t", "кнопка из чужой группы не засчитана")
    webhook({"callback_query": {"id": "c2", "data": f"r:{rid}", "message": {"chat": {"id": CHAT, "type": "group"}}}})
    webhook({"callback_query": {"id": "c3", "data": f"q:{rid}", "message": {"chat": {"id": CHAT, "type": "group"}}}})
    ok(sql(f"select read_at is not null and question_at is not null from parent_reports where id='{rid}'") == "t", "прочитали и вопрос отмечены")
    page.reload()
    expect(page.get_by_text("прочитали").first).to_be_visible()
    expect(page.get_by_text("есть вопрос").first).to_be_visible()
    page.get_by_role("button", name="Отправлено", exact=True).click()
    expect(page.get_by_role("button", name=re.compile("Дуйсенова Айлин"))).to_be_visible()
    expect(page.get_by_role("button", name=re.compile("Ахметов Тимур"))).to_have_count(0)
    page.screenshot(path=E2E_DIR + "/shots/reports.png", full_page=True)

    ok(not errors, f"нет ошибок JS на страницах: {errors}")
    browser.close()

print(f"\n{sum(r.startswith('ok') for r in results)} проверок пройдено")
