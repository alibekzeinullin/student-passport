-- Откат migration-sat-6.sql: адресные office hours и «Прочитал», доступ к тестам по списку и коду, время на вопрос, «Требует внимания».
drop function if exists public.sat_attention();
drop function if exists public.my_sat_groups();
drop function if exists public.add_question_time(uuid, uuid, integer);
alter table public.test_answers drop column if exists time_ms;
drop function if exists public.start_test(uuid, text);
drop function if exists public.my_tests();
drop table if exists public.test_allowed;
alter table public.test_assignments drop column if exists code_until;
alter table public.test_assignments drop column if exists access_code;
alter table public.test_assignments drop column if exists gated;
drop function if exists public.sat_group_roster(uuid);
drop function if exists public.ack_lesson(uuid);
drop table if exists public.lesson_acks;
drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons for select to authenticated
using (
  public.is_admin() or public.is_head() or public.is_sat_staff()
  or exists (
    select 1 from public.enrollments e
    where e.group_id = lessons.group_id
      and e.student_id = public.current_user_student_id()
      and e.starts_on <= lessons.lesson_date
      and (e.ends_on is null or e.ends_on >= lessons.lesson_date)
  )
);
alter table public.lessons drop column if exists student_ids;
-- после отката заново выполните из migration-sat-5.sql функции my_tests() и start_test(uuid) с правами
notify pgrst, 'reload schema';
