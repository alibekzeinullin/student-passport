"""E2E: менторство — бриф перед встречей, цели на четверть, портфолио, полезные ссылки.
После e2e_sat1 (Айлин — ученица менторства, Дария — только SAT)."""
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



sql("delete from student_goals")
sql("delete from portfolio_items")
sql("delete from useful_links")
aylin = sql("select id from students where first_name='Айлин'")
ptoken = sql("select parent_access_token from students where first_name='Айлин'")
subprocess.run(["su", "postgres", "-c", "psql -d e2e -qc \"update auth.users set encrypted_password=crypt('Daria-New-2026', gen_salt('bf')), raw_user_meta_data = raw_user_meta_data - 'must_change_password' where email like 'dariya%'\""])

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1366, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Ментор: бриф и цели
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(f"{BASE}/admin/students/{aylin}")
    brief = page.get_by_role("region", name="Бриф перед встречей")
    expect(brief).to_be_visible()
    expect(brief.get_by_text("Прошлая встреча")).to_be_visible()
    expect(brief.get_by_text("Целей на четверть нет", exact=False)).to_be_visible()
    goals = page.get_by_role("region", name="Цели на четверть")
    goals.get_by_label("Новая цель").fill("Подать на 2 олимпиады")
    goals.get_by_label("Сколько нужно").fill("2")
    goals.get_by_role("button", name="Добавить цель").click()
    expect(goals.get_by_text("0/2")).to_be_visible()
    goals.get_by_role("button", name="Больше: Подать на 2 олимпиады").click()
    expect(goals.get_by_text("1/2")).to_be_visible()
    goals.get_by_label("Новая цель").fill("Закончить проект")
    goals.get_by_role("button", name="Добавить цель").click()
    expect(goals.get_by_text("Закончить проект")).to_be_visible()
    ok(sql(f"select count(*) from student_goals where student_id='{aylin}'") == "2", "ментор поставил 2 цели")
    page.reload()
    expect(page.get_by_role("region", name="Бриф перед встречей").get_by_text("Подать на 2 олимпиады")).to_be_visible()
    ok(True, "цели видны в брифе")
    page.screenshot(path=E2E_DIR + "/shots/mentoring2-brief.png", full_page=False)

    # полезные ссылки менторства
    page.goto(BASE + "/admin/links")
    page.get_by_role("button", name="+ Добавить ссылку").click()
    page.locator("#ln-folder").fill("IELTS")
    page.locator("#ln-title").fill("Cambridge IELTS 18")
    page.locator("#ln-url").fill("example.com/ielts")
    page.get_by_role("button", name="Сохранить").click()
    expect(page.get_by_role("link", name="Cambridge IELTS 18")).to_have_attribute("href", "https://example.com/ielts")
    ok(True, "ментор добавил ссылку (https:// подставлен сам)")
    logout(page)

    # 2. Ученица: цели (без правки), портфолио, ссылки
    login(page, "aylin", "Stud-1234")
    page.wait_for_url(BASE + "/dashboard")
    g = page.get_by_role("region", name="Цели на четверть")
    expect(g.get_by_text("1/2")).to_be_visible()
    ok(g.get_by_role("button", name="Добавить цель").count() == 0, "ученица видит цели, но не меняет")
    page.goto(BASE + "/dashboard/portfolio")
    page.get_by_role("button", name="+ Добавить запись").click()
    page.locator("#pf-title").fill("Волонтёр в приюте")
    page.locator("#pf-org").fill("Фонд Дос")
    page.locator("#pf-role").fill("Координатор")
    page.locator("#pf-hours").fill("3")
    page.locator("#pf-desc").fill("Собрали 200 кг корма")
    page.get_by_role("button", name="Сохранить").click()
    expect(page.get_by_text("на проверке у ментора")).to_be_visible()
    ok(sql(f"select status from portfolio_items where student_id='{aylin}'") == "pending", "запись ученицы ждёт подтверждения")
    tk = token("aylin@students.todayscholars.local", "Stud-1234")
    item = sql(f"select id from portfolio_items where student_id='{aylin}'")
    rest("PATCH", f"/rest/v1/portfolio_items?id=eq.{item}", tk, {"status": "approved"})
    ok(sql(f"select status from portfolio_items where id='{item}'") == "pending", "ученица не подтверждает сама себе")
    code, _ = rest("POST", "/rest/v1/useful_links", tk, {"course_id": "mentoring", "title": "x", "url": "https://x.com"})
    ok(code in (401, 403), "ученица не добавляет ссылки")
    code, _ = rest("POST", "/rest/v1/student_goals", tk, {"student_id": aylin, "term": "2026-27:2", "title": "x"})
    ok(code in (401, 403), "ученица не ставит себе цели")
    page.goto(BASE + "/links")
    expect(page.get_by_role("link", name="Cambridge IELTS 18")).to_be_visible()
    ok(True, "ученица видит ссылки менторства")
    logout(page)

    # SAT-only ученица не видит ссылки менторства
    td = token("dariya.satova@students.todayscholars.local", "Daria-New-2026")
    code, body = rest("GET", "/rest/v1/useful_links?select=title", td)
    ok(code == 200 and json.loads(body) == [], "ученица только SAT не видит ссылки менторства")

    # 3. Ментор подтверждает запись
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(f"{BASE}/admin/students/{aylin}/portfolio")
    expect(page.get_by_text("Ждут подтверждения: 1")).to_be_visible()
    page.get_by_role("button", name="подтвердить").click()
    expect(page.get_by_text("подтверждено")).to_be_visible()
    ok(sql(f"select status from portfolio_items where id='{item}'") == "approved", "ментор подтвердил запись")
    page.screenshot(path=E2E_DIR + "/shots/mentoring2-portfolio.png", full_page=True)
    logout(page)

    # 4. Родитель: цели и подтверждённое портфолио
    page.goto(f"{BASE}/parent/{ptoken}")
    expect(page.get_by_role("region", name="Цели на четверть").get_by_text("1/2")).to_be_visible()
    expect(page.get_by_text("Волонтёр в приюте")).to_be_visible()
    ok(page.get_by_text("на проверке у ментора").count() == 0, "родитель видит цели и подтверждённое портфолио")

    ok(not errors, f"нет ошибок JS: {errors[:3]}")
    browser.close()

print(f"E2E менторство 2: {sum(1 for r in results if r.startswith('ok'))} проверок пройдено")
