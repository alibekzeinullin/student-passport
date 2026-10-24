"""Собрать supabase/migration-summer.sql из data/summer-programs-2027.json
(выгрузка страницы «Летние программы 2027», поле DATA).
Запуск: python3 scripts/build-summer-sql.py"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
data = json.load(open(root / "data" / "summer-programs-2027.json"))
q = lambda s: "'" + str(s or "").replace("'", "''") + "'"
SHORT = lambda n: n.split(" (")[0]

rows = []
for o in data:
    d = f"'{o['d']}'::date" if o.get("d") else "null"
    tags = "array[" + ",".join(q(t) for t in o.get("tags", [])) + "]::text[]"
    money = o.get("money", "none")
    vals = [q("s-" + o["id"]), q("summer-" + o["sec"]), q(o["name"]), q(SHORT(o["name"])), q(o.get("desc", "")),
            q("Заявка до"), d, "true" if o.get("approx") else "false", "false", q(o.get("dnote", "")),
            q(o.get("loc", "")), q(o.get("dates", "")), q(o.get("req", "")), q(o.get("price", "")), q(o.get("topics", "")),
            q(o.get("aid", "")), q(o.get("fee", "")), q(o.get("status", "")), q(o.get("url", "")), tags,
            q(o.get("tier", "paid")), q(money), q("Летние программы 2027"), q("summer")]
    rows.append("  (" + ", ".join(vals) + ")")

sql = """-- Digital Passport TODAY Scholars — летние программы 2027 в ленте возможностей
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- (или просто запустите заново supabase/setup-all.sql). Файл можно запускать повторно.
-- Данные собираются скриптом scripts/build-summer-sql.py из data/summer-programs-2027.json.

-- Тип возможности: олимпиада/конкурс или летняя программа
alter table public.opportunities
  add column if not exists program_type text not null default 'competition';
alter table public.opportunities drop constraint if exists opportunities_program_type_check;
alter table public.opportunities
  add constraint opportunities_program_type_check check (program_type in ('competition', 'summer'));

-- Новый тип дедлайна у ученика: летняя программа
alter table public.student_deadlines drop constraint if exists student_deadlines_category_check;
alter table public.student_deadlines
  add constraint student_deadlines_category_check
  check (category in ('olympiad', 'contest', 'hackathon', 'exam', 'application', 'program', 'task', 'other'));

-- Данные (повторный запуск обновляет тексты; удалённые ментором и логотипы не трогает)
insert into public.opportunities (id, section, name, short_name, description, kind, due_date, approx, next_cycle, date_note, location, stages, grades, price, topics, gives, how, status, url, tags, tier, money, source, program_type) values
""" + ",\n".join(rows) + """
on conflict (id) do update set section = excluded.section, name = excluded.name, short_name = excluded.short_name, description = excluded.description, kind = excluded.kind, due_date = excluded.due_date, approx = excluded.approx, next_cycle = excluded.next_cycle, date_note = excluded.date_note, location = excluded.location, stages = excluded.stages, grades = excluded.grades, price = excluded.price, topics = excluded.topics, gives = excluded.gives, how = excluded.how, status = excluded.status, url = excluded.url, tags = excluded.tags, tier = excluded.tier, money = excluded.money, source = excluded.source, program_type = excluded.program_type, updated_at = now();
"""
(root / "supabase" / "migration-summer.sql").write_text(sql)
print(f"summer programs: {len(rows)}")
