"""E2E: SAT этап 1 — команда, группы, права, вкладки ученика. Запуск — см. README.md рядом."""
import os
import re
import subprocess
import sys
from playwright.sync_api import sync_playwright, expect, Page

E2E_DIR = os.environ.get("E2E_DIR", os.path.dirname(os.path.abspath(__file__)))
BASE = "http://localhost:3000"
SHOTS = E2E_DIR + "/shots"
results: list[str] = []


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


def change_password(page: Page, new: str):
    page.locator("#np1").fill(new)
    page.locator("#np2").fill(new)
    page.get_by_role("button", name="Сохранить пароль").click()


def logout(page: Page):
    page.get_by_role("button", name="Выйти").first.click()
    page.wait_for_url(BASE + "/")


def open_more(page: Page):
    page.locator("summary", has_text="Ещё").click()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--ignore-certificate-errors", "--no-proxy-server"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ru-RU")
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Руководитель
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    open_more(page)
    ok(page.get_by_role("link", name="Команда").is_visible(), "руководитель видит «Команда» в меню")
    open_more(page)
    page.get_by_role("tab", name="SAT").click()
    page.wait_for_url(BASE + "/admin/lessons")
    ok(page.get_by_role("tab", name="SAT").get_attribute("aria-selected") == "true", "переключатель «Менторство | SAT» ведёт в раздел SAT")
    ok(page.get_by_role("link", name="Ученики").count() == 0, "в разделе SAT меню только SAT")
    page.get_by_role("link", name="Группы", exact=True).click()
    page.wait_for_url(BASE + "/admin/groups")
    expect(page.get_by_text("Групп пока нет")).to_be_visible()

    # 2. Поток и группы
    page.get_by_role("button", name="+ Поток").click()
    page.locator("#sf-name").fill("Поток 3")
    page.get_by_role("button", name="Создать поток").click()
    expect(page.get_by_text("Поток «Поток 3» создан")).to_be_visible()
    for name in ["SAT-3A", "SAT-3B"]:
        page.get_by_role("button", name="+ Группа").click()
        page.locator("#gf-name").fill(name)
        page.get_by_role("button", name="Создать группу").click()
        expect(page.get_by_text(f"Группа «{name}» создана")).to_be_visible()
    ok(sql("select count(*) from groups g join streams s on s.id=g.stream_id where s.name='Поток 3'") == "2", "две группы в потоке 3")

    # 3. Команда: один сотрудник
    page.goto(BASE + "/admin/team")
    expect(page.locator("tr", has_text="Алибек Зейнуллин")).to_be_visible()
    page.get_by_role("button", name="+ Сотрудник").click()
    page.locator("#st-name").fill("Асель Нурланова")
    ok(page.locator("#st-login").input_value() == "asel.nurlanova", "логин предлагается из ФИО")
    page.locator("label", has_text="SAT-3A").locator("input").check()
    page.get_by_role("button", name="Создать и получить пароль").click()
    expect(page.get_by_text("показываются один раз")).to_be_visible()
    asel_pw = page.locator("td.font-mono.text-gold").first.inner_text().strip()
    ok(bool(re.match(r"^[A-Z][a-z]+-\d{4}$", asel_pw)), f"временный пароль выдан ({asel_pw})")
    page.screenshot(path=f"{SHOTS}/01-team-created.png", full_page=True)

    # 4. Массовое создание
    page.get_by_role("button", name="Закрыть").click()
    page.get_by_role("button", name="Списком").click()
    page.locator("#bulk").fill("Дана Ерланова; куратор; SAT-3A\nМарат Сейтов; старший учитель\nОдно; учитель\nЖан Повар; повар")
    expect(page.get_by_text("Строка 3: нужны имя и фамилия")).to_be_visible()
    expect(page.get_by_text("Строка 4: неизвестная роль «повар»")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/02-bulk-preview.png", full_page=True)
    page.get_by_role("button", name=re.compile("Создать 2")).click()
    expect(page.get_by_text("Временные пароли")).to_be_visible()
    ok(page.locator("td.font-mono.text-gold").count() == 2, "массово создано 2, ошибочные строки пропущены")
    marat_pw = page.locator("tr", has_text="Марат Сейтов").locator("td.font-mono.text-gold").inner_text().strip()
    page.get_by_role("button", name="Закрыть").click()

    ok(sql("select count(*) from students where email like 'asel%' or email like 'dana%' or email like 'marat%'") == "0", "у сотрудников нет карточек учеников")
    ok(sql("select string_agg(p.role, ',' order by m.full_name) from staff_members m join profiles p on p.id=m.user_id where m.full_name<>'Алибек Зейнуллин'") == "staff,staff,staff", "профили сотрудников = staff")
    ok(sql("select count(*) from group_staff gs join groups g on g.id=gs.group_id where g.name='SAT-3A'") == "2", "в SAT-3A назначены учитель и куратор")
    ok(sql("select count(*) from staff_audit where action='create'") == "3", "создания записаны в журнал")
    page.reload()
    expect(page.locator("tr", has_text="Асель Нурланова").get_by_text("Учитель SAT", exact=True)).to_be_visible()
    expect(page.locator("tr", has_text="Дана Ерланова").get_by_text("SAT-3A")).to_be_visible()

    # 5. Защита: нельзя снять руководителя с себя
    page.locator("tr", has_text="Алибек Зейнуллин").get_by_role("button", name="Изменить").click()
    page.locator("label", has_text="Руководитель").locator("input").uncheck()
    expect(page.get_by_text("С себя роль руководителя снять нельзя")).to_be_visible()
    ok(page.get_by_role("button", name="Сохранить").is_disabled(), "кнопка сохранения заблокирована при снятии своей роли руководителя")
    page.get_by_role("button", name="Отмена").click()

    # 6. Ученик в группу
    page.goto(BASE + "/admin/groups")
    page.get_by_role("button", name=re.compile("SAT-3A")).click()
    expect(page.get_by_text("Учитель: Асель Нурланова")).to_be_visible()
    page.get_by_placeholder("Начните вводить имя или фамилию…").fill("Тим")
    page.get_by_role("button", name="Выбрать").click()
    page.get_by_placeholder("1400").fill("1450")
    page.locator("input[type=date]").nth(-2).fill("2027-03-13")
    page.get_by_role("button", name="Добавить", exact=True).click()
    expect(page.get_by_text("Тимур добавлен(а)", exact=False)).to_be_visible()
    ok(sql("select target_score||' '||sat_date from enrollments where course_id='sat'") == "1450 2027-03-13", "зачисление с целью и датой SAT")
    page.screenshot(path=f"{SHOTS}/03-groups-head.png", full_page=True)

    # 7. Ученик только SAT через «Аккаунты» — не в менторском реестре
    page.goto(BASE + "/admin/accounts")
    page.get_by_role("button", name="+ Создать аккаунт").click()
    page.locator("#acc-name").fill("Дария Сатова")
    page.locator("#acc-course").select_option("sat")
    page.get_by_role("button", name="Создать и получить пароль").click()
    expect(page.get_by_text("показывается один раз")).to_be_visible()
    ok(sql("select count(*) from enrollments e join students s on s.id=e.student_id where s.first_name='Дария'") == "0", "SAT-ученик создан без менторского зачисления")
    page.goto(BASE + "/admin/groups")
    page.get_by_role("button", name=re.compile("SAT-3B")).click()
    page.get_by_placeholder("Начните вводить имя или фамилию…").fill("Дари")
    page.get_by_role("button", name="Выбрать").click()
    page.get_by_role("button", name="Добавить", exact=True).click()
    expect(page.get_by_text("добавлен(а) в «SAT-3B»", exact=False)).to_be_visible()
    page.goto(BASE + "/admin")
    expect(page.get_by_text("Айлин", exact=False).first).to_be_visible()
    page.wait_for_timeout(800)
    ok(page.get_by_text("Сатова").count() == 0, "SAT-only ученик скрыт из менторского реестра")
    ok(page.get_by_text("Ахметов").count() > 0, "ученик менторство+SAT остаётся в реестре")
    page.goto(BASE + "/admin/attendance")
    expect(page.get_by_text("Дуйсенова", exact=False).first).to_be_visible()
    page.wait_for_timeout(800)
    ok(page.get_by_text("Сатова", exact=False).count() == 0, "SAT-only ученика нет в менторской посещаемости")
    logout(page)

    # 8. Учитель
    login(page, "asel.nurlanova", asel_pw)
    page.locator("#np1").wait_for()
    change_password(page, "Asel-New-2026")
    page.wait_for_url(BASE + "/admin/lessons")
    expect(page.get_by_role("heading", name="Занятия")).to_be_visible()
    page.goto(BASE + "/admin/groups")
    expect(page.get_by_text("Потоки и группы")).to_be_visible()
    expect(page.get_by_text("Свои группы вы можете править")).to_be_visible()
    ok(page.get_by_role("button", name="+ Группа").count() == 0, "учитель не создаёт группы")
    ok(page.locator("summary", has_text="Ещё").count() == 0, "у учителя нет менторского меню")
    page.get_by_role("button", name=re.compile("SAT-3A")).click()
    expect(page.get_by_text("моя группа").first).to_be_visible()
    row = page.locator("tr", has_text="Ахметов Тимур")
    row.get_by_label("Цель SAT").fill("1500")
    row.get_by_role("button", name="Сохранить").click()
    expect(page.get_by_text("Ахметов Тимур: сохранено")).to_be_visible()
    ok(sql("select target_score from enrollments where course_id='sat' and ends_on is null and group_id=(select id from groups where name='SAT-3A')") == "1500", "учитель меняет цель в своей группе")
    page.get_by_role("button", name=re.compile("SAT-3A")).click()
    page.get_by_role("button", name=re.compile("SAT-3B")).click()
    expect(page.locator("tr", has_text="Сатова Дария")).to_be_visible()
    ok(page.locator("tr", has_text="Сатова Дария").get_by_role("button", name="Перевести").count() == 0, "чужую группу учитель только видит")
    ok(page.get_by_placeholder("Начните вводить имя или фамилию…").count() == 0, "в чужую группу нельзя добавить ученика")
    page.screenshot(path=f"{SHOTS}/04-groups-teacher.png", full_page=True)
    page.goto(BASE + "/admin")
    page.wait_for_url(BASE + "/admin/lessons")
    ok(True, "учителя с /admin возвращает на его страницу")
    page.goto(BASE + "/admin/team")
    page.wait_for_url(BASE + "/admin/lessons")
    ok(True, "учитель не открывает «Команда»")
    # прямой запрос к API команды с настоящим токеном учителя
    import json, urllib.request, ssl, os
    urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=E2E_DIR + "/cert.pem"))))
    keys = dict(l.strip().split("=", 1) for l in open(E2E_DIR + "/keys.env"))
    cx = ssl.create_default_context(cafile=E2E_DIR + "/cert.pem")
    req = urllib.request.Request("https://e2e.supabase.co/auth/v1/token?grant_type=password",
        data=json.dumps({"email": "asel.nurlanova@students.todayscholars.local", "password": "Asel-New-2026"}).encode(),
        headers={"apikey": keys["ANON"], "content-type": "application/json"})
    token = json.load(urllib.request.urlopen(req))["access_token"]
    def api_status(method, body=None):
        r = urllib.request.Request(BASE + "/api/admin/team", method=method, data=json.dumps(body).encode() if body else None,
            headers={"authorization": "Bearer " + token, "content-type": "application/json"})
        try:
            return urllib.request.urlopen(r).status
        except urllib.error.HTTPError as e:
            return e.code
    status = api_status("GET")
    ok(api_status("POST", {"items": [{"fullName": "Хак Хаков", "roles": ["head"]}]}) == 403, "учитель не может создать руководителя через API")
    r2 = urllib.request.Request(BASE + "/api/admin/accounts", headers={"authorization": "Bearer " + token})
    try:
        s2 = urllib.request.urlopen(r2).status
    except urllib.error.HTTPError as e:
        s2 = e.code
    ok(s2 == 403, "учитель не видит аккаунты учеников через API")
    ok(status == 403, f"API «Команда» для учителя закрыт ({status})")
    logout(page)

    # 9. Ученик: вкладки
    login(page, "timur", "Stud-1234")
    page.wait_for_url(BASE + "/dashboard")
    expect(page.get_by_role("tab", name="Менторство")).to_be_visible()
    ok(page.get_by_role("link", name="Эссе", exact=True).count() == 1, "у ученика менторства «Эссе» в меню есть")
    page.get_by_role("tab", name="SAT").click()
    expect(page.get_by_role("tab", name="SAT")).to_have_attribute("aria-selected", "true")
    expect(page.get_by_role("tab", name="Менторство")).to_have_attribute("aria-selected", "false")
    page.wait_for_timeout(400)
    expect(page.get_by_text("Асель Нурланова")).to_be_visible()
    expect(page.get_by_text("Дана Ерланова")).to_be_visible()
    expect(page.get_by_text("1500")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/05-student-sat-tab.png", full_page=True)
    logout(page)
    # SAT-only ученик: только вкладка SAT, без менторского кабинета
    su_pw = "Daria-New-2026"
    subprocess.run(["su", "postgres", "-c", "psql -d e2e -qc \"update auth.users set encrypted_password=crypt('Daria-New-2026', gen_salt('bf')), raw_user_meta_data = raw_user_meta_data - 'must_change_password' where email like 'dariya%'\""])
    login(page, "dariya.satova", su_pw)
    page.wait_for_url(BASE + "/dashboard")
    expect(page.get_by_text("До официальной сдачи SAT")).to_be_visible()
    ok(page.get_by_role("tab").count() == 0, "у SAT-only ученика нет вкладки менторства")
    for name in ["Эссе", "Проекты", "Возможности"]:
        ok(page.get_by_role("link", name=name, exact=True).count() == 0, f"у SAT-only ученика нет «{name}» в меню")
    page.goto(BASE + "/dashboard/essays")
    page.wait_for_url(BASE + "/dashboard")
    page.goto(BASE + "/opportunities")
    page.wait_for_url(BASE + "/dashboard")
    ok(True, "SAT-only ученика с менторских страниц возвращает в кабинет")
    logout(page)

    # 10. Руководитель: перевод, замена, отключение
    login(page, "alibek", "Admin-1234")
    page.wait_for_url(BASE + "/admin")
    page.goto(BASE + "/admin/groups")
    page.get_by_role("button", name=re.compile("SAT-3A")).click()
    page.locator("tr", has_text="Ахметов Тимур").get_by_role("button", name="Перевести").click()
    page.locator("td[colspan='7'] select").select_option(label="SAT-3B")
    page.locator("td[colspan='7']").get_by_role("button", name="Перевести").click()
    expect(page.get_by_text("переведён(а) в «SAT-3B»", exact=False)).to_be_visible()
    ok(sql("select count(*) from enrollments where course_id='sat' and end_reason='transfer'") == "1", "перевод закрыл старое зачисление")
    ok(sql("select target_score from enrollments where course_id='sat' and ends_on is null and student_id=(select id from students where first_name='Тимур')") == "1500", "цель перенеслась при переводе")
    # замена учителя SAT-3A на Марата с будущей даты
    panel = page.get_by_text("Учитель и куратор").locator("..")
    panel.get_by_label("Сотрудник").select_option(label="Марат Сейтов")
    panel.get_by_label("С даты", exact=True).fill("2026-12-01")
    panel.get_by_role("button", name="Назначить").click()
    expect(page.get_by_text("с 1 дек. 2026 г. учитель Марат Сейтов", exact=False)).to_be_visible()
    ok(sql("select ends_on from group_staff gs join staff_members m using(user_id) where m.full_name='Асель Нурланова'") == "2026-11-30", "текущий учитель работает до дня перед заменой")
    page.screenshot(path=f"{SHOTS}/06-replace-teacher.png", full_page=True)

    page.goto(BASE + "/admin/team")
    page.locator("tr", has_text="Асель Нурланова").get_by_role("button", name="Отключить").click()
    expect(page.get_by_text("Показать отключённых (1)")).to_be_visible()
    ok(sql("select active from staff_members where full_name='Асель Нурланова'") == "f", "сотрудник отключён")
    page.locator("tr", has_text="Марат Сейтов").get_by_role("button", name="Изменить").click()
    page.locator("label", has_text=re.compile("^Учитель SAT")).locator("input").check()
    page.get_by_role("button", name="Сохранить").click()
    expect(page.locator("tr", has_text="Марат Сейтов").get_by_text("Учитель SAT", exact=True)).to_be_visible()
    page.locator("summary", has_text="Журнал изменений").click()
    expect(page.get_by_text("отключён:", exact=False)).to_be_visible()
    page.screenshot(path=f"{SHOTS}/07-team-after.png", full_page=True)
    logout(page)

    login(page, "asel.nurlanova", "Asel-New-2026")
    page.wait_for_timeout(1500)
    ok("/admin" not in page.url, "отключённый сотрудник не может войти")
    ok(page.get_by_text("Неверный логин", exact=False).count() + page.get_by_text("banned", exact=False).count() > 0, "показана ошибка входа")

    # 11. Старший учитель
    page.goto(BASE + "/")
    login(page, "marat.seytov", marat_pw)
    page.locator("#np1").wait_for()
    change_password(page, "Marat-New-2026")
    page.wait_for_url(BASE + "/admin/lessons")
    expect(page.get_by_role("heading", name="Занятия")).to_be_visible()
    page.goto(BASE + "/admin/groups")
    expect(page.get_by_role("button", name="+ Группа")).to_be_visible()
    ok(True, "старший учитель может создавать группы")
    ok(page.locator("summary", has_text="Ещё").count() == 0, "старший учитель не видит менторскую часть")
    logout(page)

    ok(not errors, f"нет ошибок JS на страницах ({errors[:2]})")
    browser.close()

print("\n".join(results))
print(f"\nE2E: {sum(r.startswith('ok') for r in results)} проверок пройдено")
