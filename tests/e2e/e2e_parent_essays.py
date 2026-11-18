"""E2E: родитель видит проверенные эссе (текст, оценки, комментарий), но не черновики; блок «Эссе» в месячном отчёте."""
import json
import os
import re
import ssl
import subprocess
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

os.environ["no_proxy"] = os.environ["NO_PROXY"] = "localhost,127.0.0.1,e2e.supabase.co"
E2E_DIR = os.environ.get("E2E_DIR", os.path.dirname(os.path.abspath(__file__)))
if "ANON" not in os.environ:
    os.environ["ANON"] = next(l.split("=", 1)[1].strip() for l in open(E2E_DIR + "/keys.env") if l.startswith("ANON="))
BASE = "http://localhost:3000"
CTX = ssl.create_default_context(cafile=E2E_DIR + "/cert.pem")
MONTH = datetime.now(ZoneInfo("Asia/Almaty")).strftime("%Y-%m")
results: list[str] = []


def sql(q: str) -> str:
    out = subprocess.run(["su", "postgres", "-c", f'psql -d e2e -tAc "{q}"'], capture_output=True, text=True).stdout.strip()
    return out.splitlines()[0] if out else ""


def ok(cond: bool, msg: str):
    results.append(("ok   " if cond else "FAIL ") + msg)
    print(results[-1], flush=True)
    if not cond:
        raise SystemExit(1)


aylin = sql("select id from students where first_name='Айлин'")
token = sql("select parent_access_token from students where first_name='Айлин'")
sql("delete from essay_submissions")
sql("delete from essay_topics where number in (901, 902, 903)")
t1 = sql("insert into essay_topics (number, title, prompt) values (901, 'Моя мечта', 'О чём вы мечтаете') returning id")
t2 = sql("insert into essay_topics (number, title, prompt) values (902, 'Мой герой', '') returning id")
t3 = sql("insert into essay_topics (number, title, prompt) values (903, 'Черновая тема', '') returning id")
sql(
    "insert into essay_submissions (student_id, topic_id, version, body, word_count, status, submitted_at, reviewed_at, score_structure, score_content, score_language, score_topic, mentor_comment) values "
    f"('{aylin}', '{t1}', 1, 'Первая версия про мечту', 4, 'revision', now() - interval '3 days', now() - interval '2 days', 5, 5, 6, 5, 'Добавь пример из жизни'),"
    f"('{aylin}', '{t1}', 2, 'Я мечтаю стать врачом', 4, 'accepted', now() - interval '1 day', now() - interval '1 hour', 8, 9, 8, 9, 'Отличный пример с бабушкой'),"
    f"('{aylin}', '{t2}', 1, 'Мой герой — мама', 4, 'revision', now() - interval '1 day', now() - interval '2 hours', null, null, null, null, 'Раскрой, почему именно она'),"
    f"('{aylin}', '{t3}', 1, 'Секретный черновик', 2, 'submitted', now(), null, null, null, null, null, '')"
)

# 1. API по родительской ссылке: проверенные — с текстом, на проверке — без
req = urllib.request.Request(
    "https://e2e.supabase.co/rest/v1/rpc/get_essays_by_parent_token",
    data=json.dumps({"p_token": token}).encode(),
    headers={"apikey": os.environ["ANON"], "authorization": f"Bearer {os.environ['ANON']}", "content-type": "application/json"},
)
rows = json.loads(urllib.request.urlopen(req, context=CTX).read())
by = {r["body"] or f"<пусто:{r['status']}>": r for r in rows}
ok("Я мечтаю стать врачом" in by and by["Я мечтаю стать врачом"]["mentor_comment"] == "Отличный пример с бабушкой", "родитель получает текст и комментарий принятого")
ok("Секретный черновик" not in by and "<пусто:submitted>" in by, "работа на проверке — без текста")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU").new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 2. Кабинет родителя
    page.goto(f"{BASE}/parent/{token}#essays")
    sec = page.locator("#essays")
    expect(sec.get_by_role("heading", name="Эссе и комментарии ментора")).to_be_visible()
    expect(sec.get_by_text(re.compile(r"Принято тем: 1 из"))).to_be_visible()
    ok(sec.get_by_text("Черновая тема").count() == 0, "тема на проверке не показывается")
    sec.get_by_role("button", name=re.compile("901. Моя мечта")).click()
    expect(sec.get_by_text("Отличный пример с бабушкой")).to_be_visible()
    expect(sec.get_by_text("Я мечтаю стать врачом")).to_be_visible()
    sec.get_by_text("Прошлые версии (1)").click()
    expect(sec.get_by_text("Добавь пример из жизни")).to_be_visible()
    sec.get_by_role("button", name=re.compile("902. Мой герой")).click()
    expect(sec.get_by_text("Раскрой, почему именно она")).to_be_visible()
    ok(True, "родитель открывает эссе: текст, оценки, комментарий, прошлые версии")
    page.screenshot(path=E2E_DIR + "/shots/parent-essays.png")

    # 3. Месячный отчёт
    page.goto(BASE + "/")
    page.get_by_placeholder("aylin.duysenova или you@email.com").fill("alibek")
    page.get_by_placeholder("Введите пароль").fill("Admin-1234")
    page.get_by_role("button", name="Войти").click()
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/reports")
    page.locator("#rep-month").select_option(MONTH)
    page.get_by_role("button", name=re.compile("^Дуйсенова Айлин9")).click()
    pre = page.locator("section[id^='rep-']", has_text="Дуйсенова Айлин").locator("pre")
    expect(pre).to_contain_text("Эссе:")
    expect(pre).to_contain_text("— «Моя мечта» — принято, 8,5/10")
    expect(pre).to_contain_text("— «Мой герой» — на доработке")
    expect(pre).to_contain_text("Всего принято тем: 1 из")
    expect(pre).to_contain_text(f"/parent/{token}#essays")
    ok("Черновая тема" not in pre.inner_text(), "в отчёте нет работ на проверке")
    print(pre.inner_text())

    ok(not errors, f"нет ошибок JS: {errors}")
    browser.close()

sql("delete from essay_submissions")
sql("delete from essay_topics where number in (901, 902, 903)")
print(f"\n{sum(r.startswith('ok') for r in results)} проверок пройдено")
