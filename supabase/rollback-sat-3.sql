-- Откат SAT, этап 3 (migration-sat-3.sql)
-- ВНИМАНИЕ: удаляет темы, моки, практисы, их результаты и комментарии SAT. Этапы 1–2 не трогает.
begin;
drop table if exists public.sat_comments cascade;
drop table if exists public.practice_results cascade;
drop table if exists public.practices cascade;
drop table if exists public.mock_results cascade;
drop table if exists public.mocks cascade;
drop table if exists public.sat_topics cascade;
drop function if exists public.stamp_sat_comment();
drop function if exists public.can_edit_practice(uuid);
drop function if exists public.has_own_practice_result(uuid);
drop function if exists public.has_own_mock_result(uuid);
drop function if exists public.stamp_mock_result();
drop function if exists public.check_practice_result();
drop function if exists public.can_edit_sat_student(uuid);
commit;
