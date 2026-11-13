-- Откат отчётов родителям (migration-parent-reports.sql)
-- ВНИМАНИЕ: удаляет отчёты о встречах для родителей, привязки Telegram-групп и историю месячных отчётов.
begin;
drop table if exists public.parent_reports cascade;
drop table if exists public.student_telegram cascade;
alter table public.meeting_mentor_notes drop column if exists parent_win;
alter table public.meeting_mentor_notes drop column if exists parent_focus;
alter table public.meeting_mentor_notes drop column if exists parent_help;
commit;
