"""E2E: SAT этап 6 — office hours для части группы и «Прочитал», «Требует внимания», новая компоновка кабинета.
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



from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TODAY = datetime.now(ZoneInfo("Asia/Almaty")).date()
TOMORROW = (TODAY + timedelta(days=1)).isoformat()
sql("delete from lessons where kind='office_hours' and slot_id is null and title like 'E2E%'")
subprocess.run(["su", "postgres", "-c", "psql -d e2e -qc \"update auth.users set encrypted_password=crypt('Daria-New-2026', gen_salt('bf')), raw_user_meta_data = raw_user_meta_data - 'must_change_password' where email like 'dariya%'\""])

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1366, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Учитель: office hours только для Тимура
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/lessons")
    page.get_by_role("button", name="+ Доп. занятие").click()
    page.locator("#ex-kind").select_option("office_hours")
    page.locator("#ex-group").select_option(label="SAT-3B")
    page.locator("#ex-date").fill(TOMORROW)
    page.locator("#ex-time").fill("16:00")
    page.locator("#ex-title").fill("E2E разбор ошибок")
    page.locator("label", has_text="Выбранные ученики").click()
    page.locator("label", has_text="Ахметов Тимур").get_by_role("checkbox").check()
    page.get_by_role("button", name="Добавить office hours").click()
    expect(page.get_by_text("Office hours добавлены", exact=False)).to_be_visible()
    oh = sql("select id from lessons where title='E2E разбор ошибок'")
    timur = sql("select id from students where first_name='Тимур'")
    ok(sql(f"select student_ids::text from lessons where id='{oh}'") == "{" + timur + "}", "office hours назначены только Тимуру")
    # «Требует внимания»: Тимур ещё не прочитал
    page.reload()
    att = page.get_by_role("region", name="Требует внимания")
    expect(att).to_be_visible()
    expect(att.get_by_text("Office hours не прочитали")).to_be_visible()
    expect(att.get_by_text("ещё не прочитали: Ахметов Тимур", exact=False).first).to_be_visible()
    ta = token("alibek@students.todayscholars.local", "Admin-1234")
    code, body = rest("POST", "/rest/v1/rpc/sat_attention", ta, {})
    rows = json.loads(body)
    ok(any(r["ref_id"] == oh and r["kind"] == "oh_unread" and r["detail"] == "Ахметов Тимур" for r in rows), "«Требует внимания»: office hours не прочитал только Тимур")
    logout(page)

    # 2. Дария (та же группа) этих office hours не видит
    td = token("dariya.satova@students.todayscholars.local", "Daria-New-2026")
    code, body = rest("GET", f"/rest/v1/lessons?select=id&id=eq.{oh}", td)
    ok(code == 200 and json.loads(body) == [], "другой ученик группы не видит чужие office hours")
    code, body = rest("POST", "/rest/v1/rpc/ack_lesson", td, {"p_lesson": oh})
    ok(code >= 400, "и не может отметить их прочитанными")

    # 3. Тимур: расписание сверху, office hours «лично для вас», «Прочитал»
    login(page, "timur", "Stud-1234")
    page.wait_for_url(BASE + "/dashboard")
    page.get_by_role("tab", name="SAT").click()
    expect(page.get_by_role("heading", name="Расписание")).to_be_visible()
    hw_box = page.get_by_role("heading", name="Домашнее задание").bounding_box()
    tests_box = page.get_by_role("heading", name="Тесты").bounding_box() if page.get_by_role("heading", name="Тесты").count() else None
    ok(tests_box is None or hw_box["y"] < tests_box["y"], "домашка и расписание выше тестов")
    item = page.locator("li", has_text="E2E разбор ошибок")
    expect(item.get_by_text("лично для вас", exact=False)).to_be_visible()
    item.get_by_role("button", name="Прочитал(а)").click()
    expect(item.get_by_text("✓ Прочитано")).to_be_visible()
    ok(sql(f"select count(*) from lesson_acks where lesson_id='{oh}'") == "1", "отметка «Прочитал» сохранена")
    page.reload()
    page.get_by_role("tab", name="SAT").click()
    expect(page.locator("li", has_text="E2E разбор ошибок").get_by_text("✓ Прочитано")).to_be_visible()
    ok(True, "после перезагрузки остаётся «Прочитано»")
    page.screenshot(path=E2E_DIR + "/shots/sat-student-layout.png", full_page=True)
    logout(page)

    # 4. Учитель видит, что прочитал
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/lessons")
    code, body = rest("POST", "/rest/v1/rpc/sat_attention", ta, {})
    ok(not any(r["ref_id"] == oh for r in json.loads(body)), "после «Прочитал» пропадает из «Требует внимания»")
    kinds = {r["kind"] for r in json.loads(body)}
    print("   виды в «Требует внимания»:", kinds)
    page.screenshot(path=E2E_DIR + "/shots/sat-attention.png", full_page=False)
    logout(page)

    ok(not errors, f"нет ошибок JS: {errors[:3]}")
    browser.close()

print(f"E2E SAT этап 6: {sum(1 for r in results if r.startswith('ok'))} проверок пройдено")
