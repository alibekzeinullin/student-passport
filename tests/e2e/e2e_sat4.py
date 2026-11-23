"""E2E: SAT этап 4А — светлая тема, office hours, домашка, официальный SAT, место по моку, практис по теме, ачивки.
После e2e_sat1.py, e2e_sat2.py, e2e_sat3.py (Тимур в SAT-3B, сегодня занятие 09:00)."""
import json
import os
import re
import ssl
import subprocess
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect, Page

os.environ["no_proxy"] = os.environ["NO_PROXY"] = "localhost,127.0.0.1,e2e.supabase.co"
E2E_DIR = os.environ.get("E2E_DIR", os.path.dirname(os.path.abspath(__file__)))
if "ANON" not in os.environ:
    os.environ["ANON"] = next(l.split("=", 1)[1].strip() for l in open(E2E_DIR + "/keys.env") if l.startswith("ANON="))
BASE = "http://localhost:3000"
API = "https://e2e.supabase.co"
CTX = ssl.create_default_context(cafile=E2E_DIR + "/cert.pem")
TODAY = datetime.now(ZoneInfo("Asia/Almaty")).date()
results: list[str] = []


def sql(q: str) -> str:
    out = subprocess.run(["su", "postgres", "-c", f'psql -d e2e -tAc "{q}"'], capture_output=True, text=True).stdout.strip()
    return out.splitlines()[0] if out else ""


def ok(cond: bool, msg: str):
    results.append(("ok   " if cond else "FAIL ") + msg)
    print(results[-1], flush=True)
    if not cond:
        raise SystemExit(1)


def login(page: Page, login: str, password: str):
    page.goto(BASE + "/")
    page.get_by_placeholder("aylin.duysenova или you@email.com").fill(login)
    page.get_by_placeholder("Введите пароль").fill(password)
    page.get_by_role("button", name="Войти").click()


def logout(page: Page):
    page.get_by_role("button", name="Выйти").first.click()
    page.wait_for_url(BASE + "/")


def token(email: str, password: str) -> str:
    req = urllib.request.Request(
        API + "/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": os.environ["ANON"], "content-type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req, context=CTX).read())["access_token"]


def rest(method: str, path: str, tok: str, body=None) -> tuple[int, str]:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": os.environ["ANON"], "authorization": f"Bearer {tok}", "content-type": "application/json"},
        method=method,
    )
    try:
        r = urllib.request.urlopen(req, context=CTX)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


timur = sql("select id from students where first_name='Тимур'")
aylin = sql("select id from students where first_name='Айлин'")
weekday = TODAY.isoweekday()
WEEKDAYS_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
oh_day = WEEKDAYS_FULL[weekday % 7]  # завтра
sql("delete from sat_official_results")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Руководитель: светлая тема в SAT, тёмная в менторстве
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    ok(page.evaluate("document.documentElement.dataset.theme || ''") == "", "менторство — тёмная тема")
    page.goto(BASE + "/admin/groups")
    expect(page.locator("html")).to_have_attribute("data-theme", "sat")
    ok(True, "SAT-страницы — светлая тема")

    # 2. Office hours в расписании группы
    page.get_by_role("button", name=re.compile("^SAT-3B")).first.click()
    sched = page
    sched.get_by_label("Вид").select_option("office_hours")
    sched.get_by_label("День недели").select_option(str(weekday % 7 + 1))
    sched.get_by_label("Время").fill("16:00")
    sched.get_by_label("Длительность, минут").fill("60")
    sched.get_by_label("Предмет").fill("Вопросы по Math")
    sched.get_by_role("button", name="В расписание").click()
    expect(page.get_by_text("office hours,", exact=False)).to_be_visible()
    ok(sql("select count(*) from schedule_slots where kind='office_hours'") == "1", "слот office hours сохранён")

    # 3. Домашка на сегодняшнем занятии
    page.goto(BASE + "/admin/lessons")
    page.get_by_role("button", name=re.compile(r"09:00.*SAT-3B")).first.click()
    page.locator("#homework").fill("Практис по процентам 1–15 https://example.com/hw")
    page.get_by_role("button", name="Сохранить отметки").click()
    expect(page.get_by_text("Отметки сохранены", exact=False)).to_be_visible()
    ok("example.com/hw" in sql(f"select homework from lessons where lesson_date='{TODAY}' and starts_at='09:00'"), "домашка сохранена")
    # office hours завтра видны отдельно и не попадают в «Не отмечено»
    ok(page.get_by_text("Не отмечено", exact=False).count() == 0 or page.get_by_role("heading", name=re.compile("Не отмечено")).locator("..").get_by_text("Office hours", exact=False).count() == 0, "office hours не в «Не отмечено»")

    # 4. Ссылка «Практис по теме»
    page.goto(BASE + "/admin/results")
    page.get_by_role("tab", name="Практисы").click()
    page.get_by_role("button", name=re.compile("Ссылки «Практис по теме»")).click()
    topic = sql("select t.name from practices p join sat_topics t on t.id=p.topic_id limit 1")
    page.get_by_label(f"Ссылка: {topic}").fill("https://example.com/practice")
    page.locator("li", has=page.get_by_label(f"Ссылка: {topic}")).get_by_role("button", name="Сохранить").click()
    expect(page.get_by_text(f"Ссылка сохранена: {topic}")).to_be_visible()
    # официальный SAT вносит учитель — в карточке ученика
    page.get_by_role("tab", name="Таблица группы").click()
    page.locator("#res-group").select_option(label="SAT-3B")
    page.locator("tr", has_text="Ахметов Тимур").first.click()
    page.get_by_role("button", name="+ Внести результат").click()
    page.locator("#of-verbal").fill("615")
    page.locator("#of-math").fill("650")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_text("кратно 10")).to_be_visible()
    page.locator("#of-verbal").fill("610")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_text("(Verbal 610, Math 650)")).to_be_visible()
    ok(sql(f"select total from sat_official_results where student_id='{timur}'") == "1260", "учитель внёс официальный SAT")
    logout(page)

    # 5. Ученик
    login(page, "timur", "Stud-1234")
    page.wait_for_url(BASE + "/dashboard")
    page.get_by_role("tab", name="SAT").click()
    expect(page.locator("html")).to_have_attribute("data-theme", "sat")
    expect(page.get_by_role("heading", name="Расписание")).to_be_visible()
    expect(page.get_by_text("SAT-3B", exact=True).first).to_be_visible()
    # расписание: office hours отдельно, с длительностью
    expect(page.get_by_text(re.compile(r"^Office hours · Вопросы по Math$")).first).to_be_visible()
    expect(page.get_by_text("16:00–17:00").first).to_be_visible()
    ok(page.get_by_text(re.compile(r"1 ч( 30 мин)?")).count() >= 1, "длительность занятия показана")
    # домашка со ссылкой
    hw = page.get_by_text("К следующему занятию").locator("..")
    expect(hw.get_by_role("link", name="https://example.com/hw")).to_be_visible()
    # место по моку — только своё
    rank_card = page.get_by_text("Место в группе по моку").locator("..")
    expect(rank_card.get_by_text(re.compile(r"из \d+"))).to_be_visible()
    # официальный SAT: виден в графике, но вносить его ученик не может
    expect(page.get_by_text("Официальный SAT", exact=True).first).to_be_visible()
    ok(page.get_by_role("button", name=re.compile("Мой результат SAT")).count() == 0, "у ученика нет кнопки «Мой результат SAT»")
    # что перерешать: тема раскрывается, кнопка практиса
    page.get_by_role("button", name=re.compile(re.escape(topic))).first.click()
    expect(page.get_by_role("link", name="Практис по теме →")).to_have_attribute("href", "https://example.com/practice")
    # ачивки
    expect(page.get_by_role("heading", name="Ачивки")).to_be_visible()
    ok(page.get_by_text("получено", exact=True).count() >= 1, "есть полученные ачивки")
    page.screenshot(path=E2E_DIR + "/shots/sat4-student.png", full_page=True)
    # менторство — снова тёмная
    page.get_by_role("tab", name="Менторство").click()
    page.wait_for_timeout(300)
    ok(page.evaluate("document.documentElement.dataset.theme || ''") == "", "вкладка менторства — тёмная тема")

    # 6. Права
    tt = token("timur@students.todayscholars.local", "Stud-1234")
    code, _ = rest("POST", "/rest/v1/sat_official_results", tt, {"student_id": aylin, "exam_date": str(TODAY), "verbal": 700, "math": 700})
    ok(code in (401, 403), "ученик не вносит результат за другого")
    code, _ = rest("POST", "/rest/v1/sat_official_results", tt, {"student_id": timur, "exam_date": str(TODAY), "verbal": 800, "math": 800})
    ok(code in (401, 403), "ученик не вносит и свой официальный SAT")
    oid = sql(f"select id from sat_official_results where student_id='{timur}'")
    rest("DELETE", f"/rest/v1/sat_official_results?id=eq.{oid}", tt)
    ok(sql(f"select count(*) from sat_official_results where id='{oid}'") == "1", "ученик не удаляет официальный SAT")
    code, body = rest("POST", "/rest/v1/rpc/my_mock_rank", tt, {"p_student": aylin})
    ok(code == 200 and json.loads(body) == [], "чужое место по моку не отдаётся")
    code, body = rest("GET", f"/rest/v1/sat_official_results?student_id=eq.{aylin}", tt)
    ok(json.loads(body) == [], "чужие официальные результаты не видны")

    ok(not errors, f"нет ошибок JS: {errors}")
    browser.close()

print(f"\nE2E этап 4А: {sum(r.startswith('ok') for r in results)} проверок пройдено")
