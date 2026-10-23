"""Пересобрать блок данных ленты возможностей в supabase/migration-platform.sql
из JSON-выгрузки сайта «Олимпиады 2026–27» (поле DATA).
Запуск: python3 scripts/build-opportunities-sql.py path/to/data.json"""
import json, re, sys
from pathlib import Path

data = json.load(open(sys.argv[1]))["DATA"]
q = lambda s: "'" + str(s or "").replace("'", "''") + "'"
rows = []
for o in data:
    d = f"'{o['d']}'::date" if o.get("d") else "null"
    tags = "array[" + ",".join(q(t) for t in o.get("tags", [])) + "]::text[]"
    vals = [q(o["id"]), q(o["sec"]), q(o["name"]), q(o.get("short", "")), q(o.get("desc", "")), q(o.get("kind", "")), d,
            "true" if o.get("approx") else "false", "true" if o.get("next") else "false", q(o.get("dnote", "")),
            q(o.get("loc", "")), q(o.get("stages", "")), q(o.get("grades", "")), q(o.get("price", "")), q(o.get("topics", "")),
            q(o.get("gives", "")), q(o.get("how", "")), q(o.get("status", "")), q(o.get("url", "")), tags,
            q(o.get("tier", "base")), q(o.get("money", "free")), q(o.get("src", ""))]
    rows.append("  (" + ", ".join(vals) + ")")

p = Path(__file__).resolve().parent.parent / "supabase" / "migration-platform.sql"
s = p.read_text()
head = "insert into public.opportunities (id, section, name, short_name, description, kind, due_date, approx, next_cycle, date_note, location, stages, grades, price, topics, gives, how, status, url, tags, tier, money, source) values\n"
a = s.index(head) + len(head)
b = s.index("on conflict (id) do update set section", a)
s = s[:a] + ",\n".join(rows) + "\n" + s[b:]
p.write_text(s)
print(f"opportunities: {len(rows)}")
