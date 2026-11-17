-- Digital Passport TODAY Scholars — закреплённые ученики (например, демо-ученик для показа родителям)
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Закреплённые стоят первыми в реестре и на странице «Родителям». Откат: alter table public.students drop column if exists pinned;
alter table public.students add column if not exists pinned boolean not null default false;
