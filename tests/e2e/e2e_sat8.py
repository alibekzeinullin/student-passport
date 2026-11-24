"""E2E: сводка по ученику и черновик обратной связи — в карточке ученика SAT и в office hours.
После e2e_sat1–6 (Тимур, Дария, Дамир в SAT-3B)."""
import json
import os
import re
import ssl
import subprocess
import urllib.request
from playwright.sync_api import sync_playwright, expect, Page

os.environ["no_proxy"] = os.environ["NO_PROXY"] = "localhost,127.0.0.1,e2e.supabase.co"
E2E_DIR = os.environ.get("E2E_DIR", os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.abspath(os.path.join(E2E_DIR, "..", ".."))
if "ANON" not in os.environ:
    os.environ["ANON"] = next(l.split("=", 1)[1].strip() for l in open(E2E_DIR + "/keys.env") if l.startswith("ANON="))
BASE = "http://localhost:3000"
API = "https://e2e.supabase.co"
CTX = ssl.create_default_context(cafile=E2E_DIR + "/cert.pem")
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
    page.goto(BASE + "/dashboard" if "/test/" in page.url else page.url)
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



from datetime import datetime
from zoneinfo import ZoneInfo

TODAY = datetime.now(ZoneInfo("Asia/Almaty")).date().isoformat()
group = sql("select id from groups where name='SAT-3B'")
sql("delete from lessons where title='E2E8 office hours'")
sql(f"insert into lessons (group_id, lesson_date, starts_at, duration_min, title, kind) values ('{group}', '{TODAY}', '00:05', 30, 'E2E8 office hours', 'office_hours')")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1366, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    # 1. Карточка ученика: сводка и черновик
    page.goto(BASE + "/admin/results")
    page.locator("#res-group").select_option(label="SAT-3B")
    page.locator("tr", has_text="Ахметов Тимур").first.click()
    expect(page.get_by_text("Сводка ", exact=False).first).to_be_visible()
    expect(page.get_by_text("Последний результат").first).to_be_visible()
    page.get_by_role("button", name="Черновик по данным").click()
    draft = page.get_by_label("Комментарий").input_value()
    print("   черновик:\n" + "\n".join("     " + l for l in draft.splitlines()))
    ok(draft.startswith("Тимур: итоги") and "Последний результат" in draft and "Комментарий учителя" in draft, "черновик с цифрами подставлен")
    ok(page.get_by_role("radio", name="увидят ученик и родитель").is_checked(), "черновик сразу для ученика и родителя")
    page.screenshot(path=E2E_DIR + "/shots/sat8-digest.png", full_page=True)

    # 2. Office hours: сводка и черновик заметки
    page.goto(BASE + "/admin/lessons")
    page.get_by_role("button", name=re.compile(r"00:05.*SAT-3B")).first.click()
    page.get_by_role("button", name="Сводка: Ахметов Тимур").click()
    expect(page.get_by_role("button", name="Черновик в заметку")).to_be_visible()
    page.get_by_role("button", name="Черновик в заметку").click()
    note = page.get_by_label("Обратная связь: Ахметов Тимур").input_value()
    ok(note.startswith("Разобрали:"), "черновик заметки по office hours подставлен")
    ok(page.get_by_label("Пришёл: Ахметов Тимур").is_checked(), "ученик отмечен пришедшим")
    page.screenshot(path=E2E_DIR + "/shots/sat8-oh.png", full_page=False)

    ok(not errors, f"нет ошибок JS: {errors[:3]}")
    browser.close()

print(f"E2E сводка по ученику: {sum(1 for r in results if r.startswith('ok'))} проверок пройдено")
