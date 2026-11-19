"""E2E: SAT — учитель сам создаёт ученика в своей группе; обратная связь по office hours (ученик не видит). После e2e_sat1–4."""
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


def call(method: str, url: str, tok: str, body=None, ctx=None) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": os.environ["ANON"], "authorization": f"Bearer {tok}", "content-type": "application/json"},
        method=method,
    )
    try:
        r = urllib.request.urlopen(req, context=ctx)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


g3a = sql("select id from groups where name='SAT-3A'")
g3b = sql("select id from groups where name='SAT-3B'")
sql("delete from office_hours_notes")
sql(f"delete from lessons where group_id='{g3b}' and kind='office_hours' and slot_id is null and starts_at='07:00'")
sql("delete from students where last_name='Нурланов'")
sql("delete from auth.users where email like 'damir.nurlanov%'")
oh = sql(f"insert into lessons (group_id, lesson_date, starts_at, duration_min, title, kind) values ('{g3b}', '{TODAY}', '07:00', 60, 'Вопросы по Verbal', 'office_hours') returning id")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Учитель создаёт ученика в своей группе
    login(page, "erlan.saparov", "Erlan-New-2026")
    page.wait_for_url(BASE + "/admin/lessons")
    page.get_by_role("link", name="Группы").click()
    page.get_by_role("button", name=re.compile("^SAT-3B")).first.click()
    page.get_by_role("button", name="+ Новый ученик (создать аккаунт)").click()
    page.locator("[id^=ns-name-]").fill("Дамир Нурланов")
    expect(page.locator("[id^=ns-login-]")).to_have_value("damir.nurlanov")
    page.locator("[id^=ns-class-]").fill("11A")
    page.locator("[id^=ns-target-]").fill("1350")
    page.get_by_role("button", name="Создать и добавить в группу").click()
    creds = page.locator("pre").filter(has_text="Логин: damir.nurlanov")
    expect(creds).to_be_visible()
    password = re.search(r"Пароль: (\S+)", creds.inner_text()).group(1)
    ok(sql("select count(*) from enrollments e join students s on s.id=e.student_id where s.last_name='Нурланов' and e.course_id='sat' and e.group_id='" + g3b + "'") == "1", "ученик зачислен в SAT-3B")
    ok(sql("select count(*) from enrollments e join students s on s.id=e.student_id where s.last_name='Нурланов' and e.course_id='mentoring'") == "0", "не зачислен на менторство")

    # 2. Права: в чужую группу нельзя, ученику нельзя
    erlan_tok = token("erlan.saparov@students.todayscholars.local", "Erlan-New-2026") if sql("select count(*) from auth.users where email='erlan.saparov@students.todayscholars.local'") == "1" else None
    if erlan_tok is None:
        email = sql("select email from auth.users where email like 'erlan%'")
        erlan_tok = token(email, "Erlan-New-2026")
    code, body = call("POST", BASE + "/api/sat/students", erlan_tok, {"fullName": "Чужой Ученик", "login": "chuzhoy.uchenik", "groupId": g3a})
    ok(code == 403 and sql("select count(*) from auth.users where email like 'chuzhoy%'") == "0", "учитель не создаёт ученика в чужой группе")
    timur_tok = token("timur@students.todayscholars.local", "Stud-1234")
    code, _ = call("POST", BASE + "/api/sat/students", timur_tok, {"fullName": "Хак Хаков", "login": "hak.hakov", "groupId": g3b})
    ok(code == 403, "ученик не создаёт аккаунты")
    code, _ = call("POST", BASE + "/api/sat/students", erlan_tok, {"fullName": "Дамир Двойник", "login": "damir.nurlanov", "groupId": g3b})
    ok(code == 409, "занятый логин — понятная ошибка")

    # 3. Office hours: кто пришёл + обратная связь + домашка
    page.get_by_role("link", name="Занятия").click()
    page.get_by_role("button", name=re.compile(r"07:00.*SAT-3B")).first.click()
    expect(page.get_by_text("видят только учителя и руководители", exact=False)).to_be_visible()
    page.get_by_label("Обратная связь: Ахметов Тимур").fill("Разобрали Words in Context, нужен словарь")
    expect(page.get_by_label("Пришёл: Ахметов Тимур")).to_be_checked()
    page.locator("#oh-homework").fill("Выучить 20 слов из списка")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_text("Office hours сохранены", exact=False)).to_be_visible()
    ok(sql(f"select comment from office_hours_notes where lesson_id='{oh}'") == "Разобрали Words in Context, нужен словарь", "обратная связь сохранена")
    ok(sql(f"select homework from lessons where id='{oh}'") == "Выучить 20 слов из списка", "домашка с office hours сохранена")
    ok("Не отмечено" not in page.locator("main").inner_text() or page.get_by_role("button", name=re.compile(r"07:00")).count() <= 1, "office hours не просят отметок")

    # 4. Сотрудник видит историю в карточке ученика
    page.get_by_role("link", name="Результаты").click()
    page.locator("#res-group").select_option(page.locator("#res-group option", has_text="SAT-3B").get_attribute("value"))
    page.locator("tr", has_text="Ахметов Тимур").first.click()
    expect(page.get_by_text("Разобрали Words in Context, нужен словарь")).to_be_visible()
    ok(True, "обратная связь видна в карточке ученика")
    logout(page)

    # 5. Ученик: обратной связи не видит, домашку видит
    code, body = call("GET", API + "/rest/v1/office_hours_notes?select=comment", timur_tok, ctx=CTX)
    ok(code == 200 and json.loads(body) == [], "ученик не читает обратную связь по office hours")
    login(page, "timur", "Stud-1234")
    page.wait_for_url(BASE + "/dashboard")
    page.get_by_role("tab", name="SAT").click()
    expect(page.get_by_text("Выучить 20 слов из списка")).to_be_visible()
    ok(page.get_by_text("нужен словарь", exact=False).count() == 0, "в кабинете ученика обратной связи нет")
    logout(page)

    # 6. Новый ученик входит
    login(page, "damir.nurlanov", password)
    page.wait_for_url(re.compile(r"/(dashboard|account|change-password|password)"))
    ok(True, "новый ученик входит со своим паролем")

    ok(not errors, f"нет ошибок JS: {errors}")
    browser.close()

print(f"\nE2E SAT 5: {sum(r.startswith('ok') for r in results)} проверок пройдено")
