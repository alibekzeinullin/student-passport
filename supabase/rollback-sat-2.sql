-- Откат SAT, этап 2 (migration-sat-2.sql)
-- Supabase → SQL Editor → вставьте весь файл → Run.
-- ВНИМАНИЕ: удаляет расписание групп, занятия и все отметки посещаемости/ДЗ по SAT.
-- Этап 1 (сотрудники, группы, зачисления) и менторские данные не трогает.

begin;

drop function if exists public.marked_lessons(date, date);
drop function if exists public.sat_roster_stats();
drop function if exists public.sat_student_info(uuid);
drop function if exists public.lesson_roster(uuid);
drop function if exists public.ensure_lessons(date, date);

drop table if exists public.lesson_marks cascade;
drop table if exists public.lessons cascade;
drop table if exists public.schedule_slots cascade;

drop function if exists public.protect_lesson_identity();
drop function if exists public.reset_future_slot_lessons();
drop function if exists public.enforce_mark_window();
drop function if exists public.can_mark_lesson(uuid);
drop function if exists public.is_group_staff_on(uuid, date);

alter table public.streams drop constraint if exists streams_weeks_total_check;
alter table public.streams drop column if exists weeks_total;

drop function if exists public.local_today();

commit;
