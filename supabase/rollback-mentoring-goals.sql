-- Откат migration-mentoring-goals.sql: цели на четверть, портфолио и полезные ссылки удаляются вместе с данными.
drop function if exists public.get_portfolio_by_parent_token(text);
drop function if exists public.get_goals_by_parent_token(text);
drop table if exists public.useful_links;
drop function if exists public.can_edit_links(text);
drop function if exists public.student_has_course(text);
drop table if exists public.portfolio_items;
drop function if exists public.portfolio_student_guard();
drop table if exists public.student_goals;
notify pgrst, 'reload schema';
