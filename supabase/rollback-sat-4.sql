-- Откат migration-sat-4.sql. Функции ensure_lessons / sat_student_info / sat_roster_stats вернутся при повторном запуске migration-sat-2.sql.
drop function if exists public.my_mock_rank(uuid);
drop table if exists public.sat_official_results;
alter table public.sat_topics drop column if exists practice_url;
alter table public.lessons drop column if exists homework;
alter table public.lessons drop constraint if exists lessons_kind_check;
alter table public.lessons drop column if exists kind;
alter table public.schedule_slots drop constraint if exists schedule_slots_kind_check;
alter table public.schedule_slots drop column if exists kind;
