"""E2E: тесты на сайте — Word-шаблон → редактор → публикация → ученик проходит → отчёт по темам → разбор → в моки.
После e2e_sat1–3 (Тимур в SAT-3B). Шаблон: public/sat-test-template.docx (5 вопросов, 6 баллов)."""
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


sql("delete from online_tests")
sql("delete from mocks where title like '%(онлайн)%'")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1366, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Руководитель загружает Word-шаблон
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/tests")
    expect(page.get_by_role("heading", name="Тесты на сайте")).to_be_visible()
    page.locator("input[type=file]").set_input_files(os.path.join(REPO, "public", "sat-test-template.docx"))
    expect(page.get_by_text("Модулей: 2", exact=False)).to_be_visible()
    expect(page.get_by_text("вопросов: 5", exact=False)).to_be_visible()
    expect(page.get_by_text("Ошибок не нашлось ✓")).to_be_visible()
    page.get_by_role("button", name="Создать тест и открыть редактор").click()
    page.wait_for_url(re.compile(r"/admin/tests/[0-9a-f-]{36}$"))
    test_id = page.url.rsplit("/", 1)[1]
    ok(sql(f"select count(*) from test_questions q join test_sections s on s.id=q.section_id where s.test_id='{test_id}'") == "5", "5 вопросов создано")
    ok(sql(f"select count(*) from test_questions q join test_sections s on s.id=q.section_id where s.test_id='{test_id}' and q.topic_id is not null") == "5", "темы сопоставлены со списком SAT")
    ok(sql(f"select sum(points) from test_questions q join test_sections s on s.id=q.section_id where s.test_id='{test_id}'") == "6.00", "сумма баллов 6")

    # 2. Редактор: правка вопроса — вес
    page.get_by_role("button", name=re.compile(r"^2\..*Which choice best states")).click()
    page.get_by_label("Баллы").fill("2")
    page.get_by_role("button", name="Сохранить вопрос").click()
    expect(page.get_by_text("Вопрос 2 сохранён")).to_be_visible()

    # 3. Публикация для SAT-3B
    page.get_by_role("tab", name=re.compile("Публикация")).click()
    page.locator("label", has_text="SAT-3B").get_by_role("checkbox").check()
    page.get_by_role("button", name="Опубликовать").click()
    expect(page.get_by_text("Опубликовано для: SAT-3B")).to_be_visible()
    ok(sql(f"select gated from test_assignments where test_id='{test_id}'") == "t", "по умолчанию тест «только в классе»")
    # до запуска в классе ученик начать не может
    tt0 = token("timur@students.todayscholars.local", "Stud-1234")
    asg = sql(f"select id from test_assignments where test_id='{test_id}'")
    code0, body0 = rest("POST", "/rest/v1/rpc/start_test", tt0, {"p_assignment": asg, "p_code": "000000"})
    ok(code0 >= 400 and "Учитель ещё не открыл" in body0, "без отметки учителя тест не начать (даже с кодом)")
    # запуск в классе: отмечаем Тимура, получаем код
    page.get_by_role("button", name="Запустить в классе").click()
    page.wait_for_timeout(1500)  # успеет подставить отмеченных на сегодняшнем занятии
    cb = page.locator("label", has_text="Ахметов Тимур").get_by_role("checkbox")
    if not cb.is_checked():
        cb.click()
    expect(cb).to_be_checked()
    page.get_by_role("button", name="Открыть и получить код").click()
    expect(page.get_by_text("Тест открыт отмеченным ученикам")).to_be_visible()
    access = sql(f"select access_code from test_assignments where id='{asg}'")
    ok(len(access) == 6 and sql(f"select count(*) from test_allowed where assignment_id='{asg}'") == "1", "код из 6 цифр, допущен 1 ученик")
    expect(page.get_by_text(access).first).to_be_visible()
    logout(page)

    # 4. Ученик проходит
    login(page, "timur", "Stud-1234")
    page.wait_for_url(BASE + "/dashboard")
    page.get_by_role("tab", name="SAT").click()
    expect(page.get_by_role("heading", name="Тесты")).to_be_visible()
    page.get_by_label(re.compile("Код для теста")).fill("123456" if access != "123456" else "654321")
    page.get_by_role("button", name="Начать", exact=True).click()
    expect(page.get_by_text("Неверный код")).to_be_visible()
    page.get_by_label(re.compile("Код для теста")).fill(access)
    page.get_by_role("button", name="Начать", exact=True).click()
    page.wait_for_url(re.compile(r"/test/[0-9a-f-]{36}$"))
    attempt = page.url.rsplit("/", 1)[1]
    expect(page.get_by_role("timer")).to_be_visible()
    expect(page.get_by_text("urban gardens", exact=False)).to_be_visible()  # отрывок
    page.get_by_role("radio", name=re.compile("^A")).click()  # верно
    # инструменты как в Bluebook: вычёркивание, скрытие таймера, инструкция
    page.get_by_role("button", name="ABC").click()
    page.get_by_role("button", name="Вычеркнуть вариант C").click()
    expect(page.get_by_role("button", name="Вернуть")).to_be_visible()
    page.get_by_role("button", name="Скрыть").click()
    expect(page.get_by_role("timer")).to_have_count(0)
    page.get_by_role("button", name="Показать").click()
    expect(page.get_by_role("timer")).to_be_visible()
    page.get_by_role("button", name="Инструкция ▾").click()
    expect(page.get_by_role("dialog", name="Инструкция к модулю")).to_be_visible()
    page.get_by_role("dialog", name="Инструкция к модулю").get_by_role("button", name="Закрыть").click()
    ok(True, "вычёркивание, скрытие таймера и инструкция работают")
    page.get_by_role("button", name="Далее", exact=True).click()
    page.get_by_role("radio", name=re.compile("^A")).click()  # неверно (правильный B)
    page.get_by_role("button", name=re.compile("Отметить для проверки")).click()
    page.wait_for_timeout(600)
    ok(sql(f"select count(*) from test_answers where attempt_id='{attempt}'") == "2", "ответы сохраняются сразу")
    page.get_by_role("button", name="Далее", exact=True).click()
    expect(page.get_by_role("heading", name="Проверьте свои ответы")).to_be_visible()
    page.get_by_role("button", name="Следующий модуль").click()
    expect(page.get_by_text("Math — Модуль 1", exact=False).first).to_be_visible()
    expect(page.get_by_role("button", name="Калькулятор")).to_be_visible()
    page.get_by_role("button", name="Справочник").click()
    expect(page.get_by_text("Теорема Пифагора")).to_be_visible()
    page.get_by_role("button", name="Закрыть справочник").click()
    page.locator("input[id^=ans-]").fill("3/4")
    expect(page.get_by_text("Ответ будет прочитан как")).to_be_visible()
    page.locator("input[id^=ans-]").fill("3.0")
    ok(True, "справочник формул и превью ответа")
    page.get_by_role("button", name="Далее", exact=True).click()
    page.get_by_role("radio", name=re.compile("^B")).click()
    page.get_by_role("button", name="Далее", exact=True).click()
    page.locator("input[id^=ans-]").fill("2")
    page.wait_for_timeout(900)
    page.get_by_role("button", name="Далее", exact=True).click()
    page.get_by_role("button", name="Завершить тест").click()
    expect(page.get_by_text("Тест завершён")).to_be_visible()
    expect(page.get_by_text("из 7 баллов", exact=False)).to_be_visible()
    ok(sql(f"select score||'/'||max_score from test_attempts where id='{attempt}'") == "5.00/7.00", "балл 5 из 7: веса вопросов учтены (неверный вопрос весом 2)")
    expect(page.get_by_text("Central ideas and details", exact=False).first).to_be_visible()
    ok(page.get_by_text("Правильные ответы учитель откроет", exact=False).count() == 1, "разбор закрыт, пока учитель не откроет")

    # 5. Безопасность
    tt = token("timur@students.todayscholars.local", "Stud-1234")
    code, body = rest("GET", "/rest/v1/test_questions?select=answer", tt)
    ok(code == 200 and json.loads(body) == [], "ученик не читает ключи ответов")
    code, body = rest("GET", "/rest/v1/test_answers?select=is_correct", tt)
    ok(json.loads(body) == [], "ученик не читает таблицу ответов напрямую")
    code, body = rest("POST", "/rest/v1/rpc/save_test_answer", tt, {"p_attempt": attempt, "p_question": sql("select id from test_questions limit 1"), "p_answer": "B", "p_flagged": False})
    ok(body.strip() == "false", "после завершения ответы не меняются")
    code, body = rest("POST", "/rest/v1/test_attempts", tt, {"assignment_id": sql("select id from test_assignments limit 1"), "test_id": test_id, "student_id": sql("select id from students where first_name='Тимур'")})
    ok(code in (401, 403), "ученик не создаёт попытки напрямую")
    logout(page)

    # 6. Отчёт у руководителя, разбор, перенос в моки
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(f"{BASE}/admin/tests/{test_id}")
    page.get_by_role("tab", name=re.compile("Результаты")).click()
    expect(page.get_by_text("Завершили 1 из", exact=False)).to_be_visible()
    page.get_by_role("tab", name="По темам").click()
    first_topic = page.locator("li", has=page.get_by_role("button", name=re.compile("Central ideas and details"))).first
    expect(first_topic.get_by_text("0%")).to_be_visible()
    first_topic.get_by_role("button").click()
    expect(page.get_by_text("Меньше 50%: Ахметов Тимур")).to_be_visible()
    page.get_by_role("tab", name="Кто как ответил").click()
    expect(page.get_by_text("✗ A").first).to_be_visible()
    ok(int(sql(f"select coalesce(sum(time_ms),0) from test_answers where attempt_id='{attempt}'")) > 1000, "время на вопросы записано")
    page.get_by_role("tab", name="Время").click()
    expect(page.get_by_text("Секунды на вопрос", exact=False)).to_be_visible()
    page.get_by_role("tab", name="По ученикам").click()
    expect(page.get_by_text("5/7 · 71%")).to_be_visible()
    page.get_by_role("tab", name="По вопросам").click()
    expect(page.get_by_text("A — 1 уч.")).to_be_visible()
    page.get_by_role("tab", name=re.compile("Публикация")).click()
    page.get_by_role("checkbox", name="показать разбор ученикам").click()
    expect(page.get_by_text("Разбор открыт ученикам")).to_be_visible()
    page.get_by_role("tab", name=re.compile("Результаты")).click()
    page.get_by_label("Группа").select_option(label="SAT-3B")
    page.get_by_role("button", name="Перенести в моки").click()
    expect(page.get_by_text("Баллы перенесены", exact=False)).to_be_visible()
    ok(sql("select r.verbal||'/'||r.math from mock_results r join mocks m on m.id=r.mock_id where m.title like '%(онлайн)%'") == "400/800", "в моки: Verbal 1/3 → 400, Math 4/4 → 800")
    page.screenshot(path=E2E_DIR + "/shots/tests-report.png", full_page=True)
    logout(page)

    # 7. Ученик видит разбор
    login(page, "timur", "Stud-1234")
    page.wait_for_url(BASE + "/dashboard")
    page.goto(f"{BASE}/test/{attempt}")
    expect(page.get_by_text("верный").first).to_be_visible()
    expect(page.get_by_text("Bees prefer rural areas.", exact=False)).to_be_visible()
    page.screenshot(path=E2E_DIR + "/shots/tests-result.png", full_page=True)

    ok(not errors, f"нет ошибок JS: {errors}")
    browser.close()

print(f"\nE2E тесты на сайте: {sum(r.startswith('ok') for r in results)} проверок пройдено")
