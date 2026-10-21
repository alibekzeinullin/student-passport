-- Digital Passport TODAY Scholars — ученики на паузе
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно. Статус меняет только ментор
-- (защищено триггером из migration-security.sql).

alter table public.students
  add column if not exists status text not null default 'active';

alter table public.students drop constraint if exists students_status_check;
alter table public.students
  add constraint students_status_check check (status in ('active', 'paused'));

alter table public.students
  add column if not exists paused_at timestamptz;
