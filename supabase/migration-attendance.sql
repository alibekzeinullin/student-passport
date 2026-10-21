-- Digital Passport TODAY Scholars — таблица посещаемости и групповые встречи
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно. Нужен уже применённый migration-meetings.sql.
--
-- Групповая встреча хранится как запись в meetings у каждого пришедшего /
-- не пришедшего ученика (format = 'group'); session_key связывает эти записи
-- в одну встречу. Баллы посещаемости учитывают и индивидуальные, и групповые.

alter table public.meetings add column if not exists session_key uuid;

create index if not exists meetings_session_key_idx on public.meetings (session_key);
create index if not exists meetings_date_idx on public.meetings (meeting_date);
