-- Digital Passport TODAY Scholars — удаление возможностей из ленты (ментор)
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- (или просто запустите заново supabase/setup-all.sql). Файл можно запускать повторно.

-- «Удалить» = скрыть: запись остаётся (дедлайны учеников не ломаются),
-- и повторный запуск setup-all.sql не возвращает её в ленту.
alter table public.opportunities
  add column if not exists hidden boolean not null default false;
