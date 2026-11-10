-- Убрать демо SAT (созданное supabase/demo-seed.sql). Реальные данные не трогает.
begin;
-- демо-ученики: результаты, отметки, комментарии и зачисления удаляются вместе с карточкой
delete from public.profiles where student_id in (select id from public.students where email like '%@demo.todayscholars.local');
delete from auth.users where email = 'demo.asel@students.todayscholars.local';
delete from public.students where email like '%@demo.todayscholars.local';
-- группа (расписание, занятия, практисы — каскадом), моки и поток
delete from public.groups where stream_id in (select id from public.streams where name = 'Демо поток');
delete from public.mocks where stream_id in (select id from public.streams where name = 'Демо поток');
delete from public.streams where name = 'Демо поток';
commit;
