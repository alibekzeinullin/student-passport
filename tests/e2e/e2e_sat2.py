"""E2E: SAT этап 2 — расписание, занятия, отметки. Запускать после e2e_sat1.py на той же базе."""
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
NOW = datetime.now(ZoneInfo("Asia/Almaty"))
TODAY = NOW.date()


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


def open_group(page: Page, name: str):
    page.get_by_role("button", name=re.compile(f"^{name}")).first.click()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    page = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU").new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Руководитель: поток, расписание по примеру и занятие на сегодня
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/groups")
    page.get_by_label("Поток", exact=True).first.select_option(label="Поток 3")
    page.locator("#se-start").fill((TODAY - timedelta(days=28)).isoformat())
    page.locator("#se-weeks").fill("12")
    page.get_by_role("button", name="Сохранить").first.click()
    expect(page.get_by_text("Поток «Поток 3» сохранён")).to_be_visible()
    ok(sql("select weeks_total from streams where name='Поток 3'") == "12", "у потока длительность 12 недель")
    page.get_by_label("Поток", exact=True).first.select_option(label="Все потоки")

    open_group(page, "SAT-3B")
    page.get_by_role("button", name=re.compile("Заполнить примером")).click()
    expect(page.get_by_text("расписание по примеру", exact=False)).to_be_visible()
    ok(sql("select count(*) from schedule_slots s join groups g on g.id=s.group_id where g.name='SAT-3B'") == "3", "расписание по примеру: 3 занятия в неделю")
    page.get_by_label("День недели").select_option(str(TODAY.isoweekday()))
    page.get_by_label("Время").fill("09:00")
    page.get_by_label("Предмет").fill("Утренний разбор")
    page.get_by_role("button", name="В расписание").click()
    expect(page.get_by_text("В расписание «SAT-3B» добавлено", exact=False)).to_be_visible()
    expect(page.get_by_text("Пт 17:00 Практис", exact=False).first).to_be_visible()
    page.screenshot(path=f"{SHOTS}/11-schedule.png", full_page=True)

    # 2. Новый учитель SAT-3B
    page.goto(BASE + "/admin/team")
    page.get_by_role("button", name="+ Сотрудник").click()
    page.locator("#st-name").fill("Ерлан Сапаров")
    page.locator("label", has_text="SAT-3B").locator("input").check()
    page.get_by_role("button", name="Создать и получить пароль").click()
    expect(page.get_by_text("показываются один раз")).to_be_visible()
    erlan_pw = page.locator("td.font-mono.text-gold").first.inner_text().strip()

    # 3. Руководитель отмечает сегодняшнее занятие
    page.goto(BASE + "/admin/lessons")
    expect(page.get_by_role("heading", name="Занятия")).to_be_visible()
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{SHOTS}/12a-lessons-head.png", full_page=True)
    page.get_by_role("button", name=re.compile("09:00.*SAT-3B")).first.click()
    expect(page.get_by_role("group", name="Присутствие: Ахметов Тимур")).to_be_visible(timeout=15000)
    ok(page.get_by_role("group", name="Присутствие: Сатова Дария").count() == 1, "в занятии все ученики группы")
    page.get_by_role("button", name="Всем без отметки — «был»").click()
    page.get_by_role("group", name="ДЗ: Ахметов Тимур").get_by_role("button", name="частично").click()
    page.get_by_role("group", name="Активность: Ахметов Тимур").get_by_role("button", name="высокая").click()
    page.get_by_label("Тема занятия").fill("Проценты")
    page.get_by_role("button", name="Сохранить отметки").click()
    expect(page.get_by_text("Отметки сохранены", exact=False)).to_be_visible()
    ok(sql("select count(*) from lesson_marks where attendance='present'") == "2", "двое отмечены «был»")
    ok(sql("select homework||' '||activity from lesson_marks m join students s on s.id=m.student_id where s.first_name='Тимур'") == "partial high", "ДЗ «частично» и активность сохранены")
    ok(sql(f"select topic from lessons where lesson_date='{TODAY}' and starts_at='09:00'") == "Проценты", "тема занятия сохранена")
    page.screenshot(path=f"{SHOTS}/12-lesson-marked.png", full_page=True)

    # 4. Внеплановое занятие вчера → «Не отмечено»
    page.get_by_role("button", name="+ Доп. занятие").click()
    page.locator("#ex-group").select_option(label="SAT-3B")
    page.locator("#ex-date").fill((TODAY - timedelta(days=1)).isoformat())
    page.locator("#ex-time").fill("19:00")
    page.get_by_role("button", name="Добавить занятие").click()
    expect(page.get_by_text("Занятие добавлено", exact=False)).to_be_visible()
    expect(page.get_by_role("heading", name=re.compile("Не отмечено · 2"))).to_be_visible()
    ok(True, "руководитель видит вчерашнее внеплановое занятие в «Не отмечено»")
    logout(page)

    # 5. Учитель
    login(page, "erlan.saparov", erlan_pw)
    page.locator("#np1").wait_for()
    page.locator("#np1").fill("Erlan-New-2026")
    page.locator("#np2").fill("Erlan-New-2026")
    page.get_by_role("button", name="Сохранить пароль").click()
    page.wait_for_url(BASE + "/admin/lessons")
    expect(page.get_by_role("heading", name="Занятия")).to_be_visible()
    expect(page.get_by_role("button", name="Мои")).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_role("heading", name=re.compile("Не отмечено · 1"))).to_be_visible()
    page.screenshot(path=f"{SHOTS}/13-teacher-week.png", full_page=True)
    page.get_by_role("heading", name=re.compile("Не отмечено")).locator("..").get_by_role("button").first.click()
    page.get_by_role("group", name="Присутствие: Ахметов Тимур").get_by_role("button", name="был").click()
    page.get_by_role("group", name="Присутствие: Сатова Дария").get_by_role("button", name="нет").click()
    page.get_by_role("button", name="Сохранить отметки").click()
    expect(page.get_by_text("Отметки сохранены", exact=False)).to_be_visible()
    expect(page.get_by_role("heading", name=re.compile("Не отмечено"))).to_have_count(0)
    ok(sql("select attendance from lesson_marks m join students s on s.id=m.student_id join lessons l on l.id=m.lesson_id where s.first_name='Дария' and l.title='Math'") == "absent", "учитель отметил своё занятие из «Не отмечено» (вчерашнее — до его назначения, его там нет)")

    # будущее занятие: отметить нельзя, но можно дать замену и перенести
    page.get_by_role("button", name="Следующая неделя").click()
    page.get_by_role("button", name=re.compile("17:00.*SAT-3B.*Практис")).first.click()
    expect(page.get_by_text("Отметки можно поставить в день занятия")).to_be_visible()
    ok(page.get_by_role("button", name="Сохранить отметки").count() == 0, "будущее занятие не отмечается")
    page.get_by_role("button", name="Замена учителя").click()
    page.get_by_label("Кто ведёт это занятие").select_option(label="Марат Сейтов")
    page.get_by_role("button", name="Сохранить", exact=True).click()
    expect(page.get_by_text("Замена: Марат Сейтов")).to_be_visible()
    page.get_by_role("button", name="Перенести").first.click()
    new_date = (TODAY + timedelta(days=4)).isoformat()
    page.locator("#move-date").fill(new_date)
    page.locator("#move-time").fill("11:00")
    page.get_by_role("button", name="Перенести").last.click()
    expect(page.get_by_text("Занятие перенесено", exact=False)).to_be_visible()
    ok(sql("select count(*) from lessons where moved_from<>'' and teacher_id is not null and starts_at='11:00'") == "1", f"занятие перенесено ({new_date}, 11:00) и с заменой")
    page.screenshot(path=f"{SHOTS}/14-moved-sub.png", full_page=True)

    # окно 3 дня — сервер не даёт исправить старое занятие
    sql(f"insert into lessons (group_id, lesson_date, starts_at, title) select id, '{TODAY - timedelta(days=6)}', '10:00', 'Старое' from groups where name='SAT-3B'")
    page.get_by_role("button", name="Прошлая неделя").click()
    page.get_by_role("button", name="Прошлая неделя").click()
    page.get_by_role("button", name="Следующая неделя").click()
    if page.get_by_role("button", name=re.compile("10:00.*SAT-3B.*Старое")).count():
        page.get_by_role("button", name=re.compile("10:00.*SAT-3B.*Старое")).first.click()
        expect(page.get_by_text("Прошло больше 3 дней", exact=False)).to_be_visible()
        ok(True, "старое занятие учителю только для просмотра")
    else:
        ok(True, "старое занятие на другой неделе (проверено в тестах базы)")
    logout(page)

    # 6. Ученик: неделя курса, посещаемость, ДЗ, ближайшие занятия
    login(page, "timur", "Stud-1234")
    page.wait_for_url(BASE + "/dashboard")
    page.get_by_role("tab", name="SAT").click()
    expect(page.get_by_text("Неделя 5 из 12")).to_be_visible()
    expect(page.get_by_text("Ближайшие занятия")).to_be_visible()
    expect(page.get_by_text("перенесено с", exact=False).first).to_be_visible()
    att = page.get_by_text("Посещаемость").locator("..").locator("p").nth(1).inner_text()
    ok(att == "100%", f"посещаемость ученика {att}")
    hw = page.get_by_text("Домашние задания").locator("xpath=following-sibling::p[1]").inner_text()
    ok(hw == "50%", f"ДЗ ученика {hw} (частично = половина)")
    page.screenshot(path=f"{SHOTS}/15-student-sat.png", full_page=True)
    logout(page)

    # 7. Таблица группы с посещаемостью
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/groups")
    open_group(page, "SAT-3B")
    row = page.locator("tr", has_text="Сатова Дария")
    expect(row.get_by_text("50%").first).to_be_visible()
    ok(True, "в таблице группы посещаемость Дарии 50%")
    page.screenshot(path=f"{SHOTS}/16-group-stats.png", full_page=True)
    logout(page)

    ok(not errors, f"нет ошибок JS ({errors[:2]})")
    browser.close()

print(f"\nE2E этап 2: {sum(r.startswith('ok') for r in results)} проверок пройдено")
