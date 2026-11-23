"""Собрать supabase/data-opportunities.sql — только данные ленты возможностей (олимпиады + летние),
без изменений схемы. Его применяет к рабочей базе workflow «Обновить ленту возможностей»
(.github/workflows/db-opportunities.yml). Логотипы и «удалённые» ментором возможности не трогаются.

Порядок обновления ленты:
  1. выгрузить DATA со страниц «Олимпиады 2026–27» и «Летние программы 2027» в
     data/opportunities-2026-27.json ({"DATA": [...]}) и data/summer-programs-2027.json ([...])
  2. python3 scripts/build-opportunities-sql.py data/opportunities-2026-27.json
     python3 scripts/build-summer-sql.py
     python3 scripts/build-opportunities-data-sql.py
     node scripts/build-setup-sql.mjs
  3. закоммитить, затем: gh workflow run db-opportunities.yml --ref main"""
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "supabase"


def upsert(name: str) -> str:
    s = (root / name).read_text()
    a = s.index("insert into public.opportunities (")
    b = s.index(";", s.index("on conflict (id) do update set", a)) + 1
    return s[a:b]


out = (
    "-- Данные ленты возможностей (собрано scripts/build-opportunities-data-sql.py — не редактируйте вручную)\n"
    "begin;\n\n" + upsert("migration-platform.sql") + "\n\n" + upsert("migration-summer.sql") + "\n\ncommit;\n"
)
(root / "data-opportunities.sql").write_text(out)
print(f"data-opportunities.sql: {len(out) // 1024} KB")
