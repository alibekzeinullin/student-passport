"""E2E: SAT этап 3 — моки, практисы, таблица группы, комментарии, кабинет ученика. После e2e_sat1.py и e2e_sat2.py."""
import os
import re
import subprocess
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect, Page

E2E_DIR = os.environ.get("E2E_DIR", os.path.dirname(os.path.abspath(__file__)))
BASE = "http://localhost:3000"
SHOTS = E2E_DIR + "/shots"
results: list[str] = []
TODAY = datetime.now(ZoneInfo("Asia/Almaty")).date()


def sql(q: str) -> str:
    return subprocess.run(["su", "postgres", "-c", f'psql -d e2e -tAc "{q}"'], capture_output=True, text=True).stdout.strip()


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


def create_mock(page: Page, title: str, date):
    page.get_by_role("button", name="+ Пробный экзамен").click()
    page.locator("#nm-title").fill(title)
    page.locator("#nm-date").fill(date.isoformat())
    page.get_by_role("button", name="Создать").click()
    expect(page.get_by_text(f"{title} добавлен")).to_be_visible()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/results")
    expect(page.get_by_role("heading", name="Результаты")).to_be_visible()

    # 1. Моки: ручной ввод и вставка из таблицы
    page.get_by_role("tab", name="Пробные экзамены").click()
    page.locator("#mock-stream").select_option(label="Поток 3")
    create_mock(page, "Mock 1", TODAY - timedelta(days=21))
    create_mock(page, "Mock 2", TODAY)
    page.get_by_role("button", name=re.compile("^Mock 1")).click()
    page.get_by_label("Verbal: Ахметов Тимур").fill("520")
    page.get_by_label("Math: Ахметов Тимур").fill("540")
    page.get_by_role("button", name="Вставить из таблицы").click()
    page.get_by_label("Вставка из таблицы").fill("Дария Сатова\t500\t510\nНеизвестный Ученик\t400\t400")
    expect(page.get_by_text("Найдено 1 из 2", exact=False)).to_be_visible()
    page.get_by_role("button", name="Подставить в таблицу").click()
    ok(page.get_by_label("Verbal: Сатова Дария").input_value() == "500", "вставка из таблицы нашла ученика (имя в другом порядке)")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_text("Mock 1: баллы сохранены")).to_be_visible()
    ok(sql("select string_agg(total::text, ',' order by total) from mock_results") == "1010,1060", "итоги Mock 1: 1060 и 1010")
    page.get_by_role("button", name=re.compile("^Mock 2")).click()
    page.get_by_label("Verbal: Ахметов Тимур").fill("590")
    page.get_by_label("Math: Ахметов Тимур").fill("600")
    page.get_by_label("Verbal: Сатова Дария").fill("480")
    page.get_by_label("Math: Сатова Дария").fill("900")
    expect(page.get_by_text("Проверьте числа", exact=False)).to_be_visible()
    ok(page.get_by_role("button", name="Сохранить", exact=True).is_disabled(), "балл 900 не даёт сохранить")
    page.get_by_label("Math: Сатова Дария").fill("500")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_text("Mock 2: баллы сохранены")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/21-mocks.png", full_page=True)

    # 2. Практис с перерешиванием
    page.get_by_role("tab", name="Практисы").click()
    page.locator("#res-group").select_option(label="SAT-3B")
    page.get_by_role("button", name="+ Практис").click()
    page.locator("#np-topic").select_option(label="Percentages")
    page.get_by_role("button", name="Создать").click()
    expect(page.get_by_text("Практис добавлен")).to_be_visible()
    page.get_by_role("button", name=re.compile("Math · Percentages")).click()
    page.get_by_label("Верно из 15: Ахметов Тимур").fill("6")
    page.get_by_label("Верно из 15: Сатова Дария").fill("13")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_text("попытка 1", exact=False).last).to_be_visible()
    page.get_by_role("button", name="2 · перерешивание").click()
    page.get_by_label("Верно из 15: Ахметов Тимур").fill("11")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_text("Практис: результаты сохранены (попытка 2)")).to_be_visible()
    ok(sql("select count(*) from practice_results") == "3", "практис: 2 результата + перерешивание")
    page.screenshot(path=f"{SHOTS}/22-practice.png", full_page=True)

    # 3. Таблица группы и комментарии
    page.get_by_role("tab", name="Таблица группы").click()
    page.locator("#res-group").select_option(label="SAT-3B")
    timur = page.locator("tr", has_text="Ахметов Тимур")
    expect(timur.get_by_text("1190")).to_be_visible()
    ok(timur.get_by_text("30%").count() == 1, "путь к цели Тимура 30% ((1190−1060)/(1500−1060))")
    ok(timur.get_by_text("Percentages · 73%").count() == 1, "слабое место — лучшая попытка 11/15 = 73%")
    daria = page.locator("tr", has_text="Сатова Дария")
    ok(daria.get_by_text("риск").count() == 1, "у Дарии риск (балл упал между моками)")
    timur.click()
    page.get_by_label("Комментарий").fill("Нужен разговор с родителем о нагрузке")
    page.get_by_role("button", name="Добавить", exact=True).click()
    expect(page.get_by_text("Комментарий добавлен")).to_be_visible()
    page.get_by_label("Комментарий").fill("Хороший рост по Math. На этой неделе — тайминг в Verbal.")
    page.get_by_label("увидят ученик и родитель").check()
    page.get_by_role("button", name="Добавить", exact=True).click()
    expect(page.get_by_text("Только для команды")).to_be_visible()
    expect(page.get_by_text("Увидят ученик и родитель · ", exact=False)).to_be_visible()
    page.screenshot(path=f"{SHOTS}/23-overview.png", full_page=True)
    logout(page)

    # 4. Ученик видит свои результаты и только «семейный» комментарий
    login(page, "timur", "Stud-1234")
    page.wait_for_url(BASE + "/dashboard")
    page.get_by_role("tab", name="SAT").click()
    expect(page.get_by_text("Сейчас 1190 · Mock 2")).to_be_visible()
    expect(page.get_by_text("Осталось набрать 310 баллов")).to_be_visible()
    expect(page.get_by_text("Хороший рост по Math", exact=False)).to_be_visible()
    ok(page.get_by_text("Нужен разговор с родителем", exact=False).count() == 0, "командный комментарий ученику не виден")
    expect(page.get_by_text("Повторить в течение 2 недель")).to_be_visible()
    ok(page.get_by_text("попыток: 2").count() == 1, "в истории практисов видно перерешивание")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{SHOTS}/24-student-results.png", full_page=True)
    logout(page)

    # 5. Учитель: вносит в своей группе, моки не создаёт
    login(page, "erlan.saparov", "Erlan-New-2026")
    page.wait_for_url(BASE + "/admin/lessons")
    page.get_by_role("link", name="Результаты").click()
    page.get_by_role("tab", name="Пробные экзамены").click()
    ok(page.get_by_role("button", name="+ Пробный экзамен").count() == 0, "учитель не создаёт пробные экзамены")
    page.get_by_role("button", name=re.compile("^Mock 2")).click()
    ok(page.get_by_label("Verbal: Ахметов Тимур").is_enabled(), "учитель вносит баллы ученикам своей группы")
    page.get_by_role("tab", name="Практисы").click()
    expect(page.get_by_role("button", name="+ Практис")).to_be_visible()
    logout(page)

    ok(not errors, f"нет ошибок JS ({errors[:2]})")
    browser.close()

print(f"\nE2E этап 3: {sum(r.startswith('ok') for r in results)} проверок пройдено")
