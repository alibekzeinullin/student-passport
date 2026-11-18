"""E2E: эссе — вкладка «Проверенные»: список, текст, оценки и комментарий, фильтры, исправление без смены даты."""
import os
import re
import subprocess
from playwright.sync_api import sync_playwright, expect

os.environ["no_proxy"] = os.environ["NO_PROXY"] = "localhost,127.0.0.1,e2e.supabase.co"
E2E_DIR = os.environ.get("E2E_DIR", os.path.dirname(os.path.abspath(__file__)))
BASE = "http://localhost:3000"
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
timur = sql("select id from students where first_name='Тимур'")
sql("delete from essay_submissions")
sql("delete from essay_topics where number in (901, 902)")
t1 = sql("insert into essay_topics (number, title, prompt) values (901, 'Моя мечта', 'О чём вы мечтаете') returning id")
t2 = sql("insert into essay_topics (number, title, prompt) values (902, 'Мой герой', '') returning id")
sql(
    "insert into essay_submissions (student_id, topic_id, version, body, word_count, status, submitted_at, reviewed_at, score_structure, score_content, score_language, score_topic, mentor_comment) values "
    f"('{aylin}', '{t1}', 1, 'Первая версия про мечту', 4, 'revision', now() - interval '20 days', now() - interval '19 days', 5, 5, 6, 5, 'Добавь пример из жизни'),"
    f"('{aylin}', '{t1}', 2, 'Я мечтаю стать врачом, потому что', 6, 'accepted', now() - interval '10 days', '2026-11-05 10:00+05', 8, 9, 7, 8, 'Отличный пример с бабушкой'),"
    f"('{timur}', '{t2}', 1, 'Мой герой — дедушка', 4, 'accepted', now() - interval '3 days', now() - interval '2 days', 9, 9, 9, 9, 'Сильный текст')"
)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU").new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/")
    page.get_by_placeholder("aylin.duysenova или you@email.com").fill("alibek")
    page.get_by_placeholder("Введите пароль").fill("Admin-1234")
    page.get_by_role("button", name="Войти").click()
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/essays")

    # 1. Из пустой очереди — ссылка «все проверенные»
    expect(page.get_by_text("Всё проверено")).to_be_visible()
    page.get_by_role("button", name="все проверенные →").click()
    expect(page.get_by_role("tab", name="Проверенные (3)")).to_have_attribute("aria-selected", "true")
    # сверху — последняя проверенная (Тимур)
    expect(page.get_by_text("Сильный текст")).to_be_visible()
    expect(page.get_by_text("Мой герой — дедушка")).to_be_visible()
    ok(True, "вкладка «Проверенные»: текст и комментарий видны")

    # 2. Фильтр по ученику и версии
    page.get_by_label("Ученик").select_option(label="Дуйсенова Айлин")
    expect(page.get_by_text("Найдено: 2")).to_be_visible()
    expect(page.get_by_text("Отличный пример с бабушкой")).to_be_visible()
    page.get_by_role("button", name=re.compile(r"^v1 · доработка")).click()
    expect(page.get_by_text("Добавь пример из жизни")).to_be_visible()
    expect(page.get_by_text("Первая версия про мечту")).to_be_visible()
    page.get_by_role("button", name="Принятые").click()
    expect(page.get_by_text("Найдено: 1")).to_be_visible()
    ok(True, "фильтры по ученику и статусу, переход между версиями")

    # 3. Поиск по комментарию
    page.get_by_label("Ученик").select_option("all")
    page.get_by_role("button", name="Все", exact=True).click()
    page.get_by_label("Поиск").fill("бабушк")
    expect(page.get_by_text("Найдено: 1")).to_be_visible()
    page.get_by_label("Поиск").fill("")

    # 4. Исправление оценки: дата проверки не меняется
    page.get_by_label("Ученик").select_option(label="Дуйсенова Айлин")
    page.get_by_role("button", name="Принятые").click()
    before = sql(f"select reviewed_at from essay_submissions where student_id='{aylin}' and version=2")
    page.get_by_role("button", name="Изменить оценку").click()
    expect(page.get_by_role("textbox").last).to_have_value("Отличный пример с бабушкой")
    page.get_by_role("radiogroup", name="Язык").get_by_role("radio", name="9").click()
    page.get_by_role("textbox").last.fill("Отличный пример с бабушкой. Язык стал лучше.")
    page.get_by_role("button", name="Принять").click()
    expect(page.get_by_text("Язык стал лучше.")).to_be_visible()
    ok(sql(f"select score_language from essay_submissions where student_id='{aylin}' and version=2") == "9", "оценка исправлена")
    ok(sql(f"select reviewed_at from essay_submissions where student_id='{aylin}' and version=2") == before, "дата проверки не изменилась")

    # 5. Из рейтинга — «эссе →» ученика
    page.get_by_role("tab", name="Рейтинг").click()
    page.locator("li", has_text="Ахметов Тимур").get_by_role("button", name="эссе →").click()
    expect(page.get_by_text("Найдено: 1")).to_be_visible()
    expect(page.get_by_text("Сильный текст")).to_be_visible()
    ok(True, "из рейтинга открываются эссе ученика")
    page.screenshot(path=E2E_DIR + "/shots/essays-done.png", full_page=False)

    ok(not errors, f"нет ошибок JS: {errors}")
    browser.close()

sql("delete from essay_submissions")
sql("delete from essay_topics where number in (901, 902)")
print(f"\n{sum(r.startswith('ok') for r in results)} проверок пройдено")
