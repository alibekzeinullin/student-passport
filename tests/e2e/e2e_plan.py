"""E2E: план года — права, редактирование, кабинет родителя, «Что дальше» в отчёте. После e2e_reports.py (нужен поддельный Telegram)."""
import json
import os
import re
import ssl
import subprocess
import urllib.request
from playwright.sync_api import sync_playwright, expect, Page

os.environ["no_proxy"] = os.environ["NO_PROXY"] = "localhost,127.0.0.1,e2e.supabase.co"
E2E_DIR = os.environ.get("E2E_DIR", os.path.dirname(os.path.abspath(__file__)))
if "ANON" not in os.environ:  # ключ из keys.env, если не экспортирован
    os.environ["ANON"] = next(l.split("=", 1)[1].strip() for l in open(E2E_DIR + "/keys.env") if l.startswith("ANON="))
BASE = "http://localhost:3000"
API = "https://e2e.supabase.co"
ANON = os.environ["ANON"]
CTX = ssl.create_default_context(cafile=E2E_DIR + "/cert.pem")
results: list[str] = []


def sql(q: str) -> str:
    return subprocess.run(["su", "postgres", "-c", f'psql -d e2e -tAc "{q}"'], capture_output=True, text=True).stdout.strip()


def ok(cond: bool, msg: str):
    results.append(("ok   " if cond else "FAIL ") + msg)
    print(results[-1], flush=True)
    if not cond:
        raise SystemExit(1)


def rest(method: str, path: str, token: str | None = None, body=None) -> tuple[int, str]:
    headers = {"apikey": ANON, "authorization": f"Bearer {token or ANON}", "content-type": "application/json", "prefer": "return=representation"}
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        r = urllib.request.urlopen(req, context=CTX)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def token_for(email: str, password: str) -> str:
    req = urllib.request.Request(
        API + "/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"apikey": ANON, "content-type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req, context=CTX).read())["access_token"]


def login(page: Page, login: str, password: str):
    page.goto(BASE + "/")
    page.get_by_placeholder("aylin.duysenova или you@email.com").fill(login)
    page.get_by_placeholder("Введите пароль").fill(password)
    page.get_by_role("button", name="Войти").click()


# 1. Права: читать могут все, менять — только ментор
code, body = rest("GET", "/rest/v1/program_plan?select=title&order=start_month")
ok(code == 200 and len(json.loads(body)) == 9, "план читается без входа (для родительской ссылки)")
code, _ = rest("POST", "/rest/v1/program_plan", body={"start_month": "2027-06", "end_month": "2027-06", "title": "взлом"})
ok(code in (401, 403), "без входа план не изменить")
stud = token_for("aylin@students.todayscholars.local", "Stud-1234")
code, body = rest("PATCH", "/rest/v1/program_plan?start_month=eq.2026-12", stud, {"title": "взлом"})
ok(code in (401, 403) or body == "[]", "ученик не меняет план")
ok(sql("select title from program_plan where start_month='2026-12'") == "Запуск ресёрча", "декабрь не тронут")

aylin_token = sql("select parent_access_token from students where first_name='Айлин'")
timur_token = sql("select parent_access_token from students where first_name='Тимур'")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 2. Ментор правит план
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.locator("summary", has_text="Ещё").click()
    page.get_by_role("link", name="План года").click()
    expect(page.get_by_role("heading", name="План года")).to_be_visible()
    row = page.locator("div.sp-glass", has_text="Запуск ресёрча")
    row.get_by_role("button", name="Изменить").click()
    page.locator("#pl-home").fill("Не выбирать тему за ребёнка. Спросить, что ему самому интересно.")
    page.locator("#pl-start").fill("2026-11")
    page.get_by_role("button", name="Сохранить").click()
    expect(page.get_by_text("Месяцы пересекаются с «Челлендж «Решаем реальную проблему»»")).to_be_visible()
    page.locator("#pl-start").fill("2026-12")
    page.get_by_role("button", name="Сохранить").click()
    expect(page.get_by_text("«Запуск ресёрча» сохранено")).to_be_visible()
    ok("что ему самому интересно" in sql("select home from program_plan where start_month='2026-12'"), "правка сохранена")

    page.get_by_role("button", name="+ Добавить месяц").click()
    expect(page.locator("#pl-start")).to_have_value("2027-06")
    page.locator("#pl-title").fill("Лето: цели и программы")
    page.get_by_role("button", name="Сохранить").click()
    expect(page.get_by_text("«Лето: цели и программы» сохранено")).to_be_visible()
    page.locator("div.sp-glass", has_text="Лето: цели и программы").get_by_role("button", name="удалить").click()
    expect(page.get_by_text("«Лето: цели и программы» удалено")).to_be_visible()
    ok(sql("select count(*) from program_plan") == "9", "добавление и удаление месяца")

    page.get_by_role("button", name="Как видят родители").click()
    expect(page.get_by_text("10 кл: свой формат").first).to_be_visible()

    # 3. «Что дальше» в отчёте (ноябрь → декабрь)
    page.goto(BASE + "/admin/reports")
    page.get_by_role("button", name=re.compile("^Дуйсенова Айлин9")).click()
    card = page.locator("section", has=page.get_by_role("button", name=re.compile("^Дуйсенова Айлин9")))
    pre = card.locator("pre")
    expect(pre).to_contain_text("Что дальше:")
    expect(pre).to_contain_text("В декабре у нас фокус на: Запуск ресёрча")
    expect(pre).to_contain_text("Как помочь дома: Не выбирать тему за ребёнка. Спросить, что ему самому интересно.")
    # октябрьский отчёт: дальше ноябрь, у 10 класса — свой вариант
    page.locator("#rep-month").select_option("2026-10")
    page.get_by_role("button", name=re.compile("^Ахметов Тимур10")).click()
    tcard = page.locator("section", has=page.get_by_role("button", name=re.compile("^Ахметов Тимур10")))
    expect(tcard.locator("pre")).to_contain_text("Проектная работа по профессиям")
    page.get_by_role("button", name=re.compile("^Дуйсенова Айлин9")).click()
    expect(card.locator("pre")).to_contain_text("Командный проект: решение реальной проблемы")
    ok("Проектная работа по профессиям" not in card.locator("pre").inner_text(), "9 класс не видит вариант для 10")
    page.get_by_role("button", name="Выйти").first.click()
    page.wait_for_url(BASE + "/")

    # 4. Кабинет родителя (без входа)
    page.goto(f"{BASE}/parent/{aylin_token}")
    expect(page.get_by_role("heading", name="План года")).to_be_visible()
    nov = page.locator("#plan-" + sql("select id from program_plan where start_month='2026-11'"))
    expect(nov.get_by_text("· Сейчас")).to_be_visible()
    expect(nov.get_by_text("Не делать проект за ребёнка")).to_be_visible()
    dec = page.locator("#plan-" + sql("select id from program_plan where start_month='2026-12'"))
    expect(dec.get_by_text("· Дальше")).to_be_visible()
    expect(dec.get_by_text("Спросить, что ему самому интересно")).to_be_visible()
    ok(nov.get_by_text("Для 10 класса").count() == 0, "родитель 9 класса не видит вариант для 10")
    page.screenshot(path=E2E_DIR + "/shots/plan-parent.png", full_page=False)
    page.locator("#plan-h").scroll_into_view_if_needed()
    page.screenshot(path=E2E_DIR + "/shots/plan-parent-2.png")
    page.goto(f"{BASE}/parent/{timur_token}")
    expect(page.get_by_text("Для 10 класса: Проектная работа по профессиям")).to_be_visible()
    # сворачивание и лента месяцев
    page.locator("button[title^='апрель']").click()
    expect(page.get_by_text("Личный сайт-портфолио. Ребёнок объясняет")).to_be_visible()

    ok(not errors, f"нет ошибок JS: {errors}")
    browser.close()

print(f"\n{sum(r.startswith('ok') for r in results)} проверок пройдено")
