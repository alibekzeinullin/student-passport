-- Digital Passport TODAY Scholars — что ученик может вносить сам
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно. Нужен уже применённый migration-platform.sql.
--
-- Ученик может сам: баллы SAT/IELTS, свои цели года в Vision Map,
-- оценки за четверти (помечаются «ждёт проверки», ментор подтверждает).

create or replace function public.enforce_student_update_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Колонки, которые ученик может менять в своей карточке целиком
  v_allowed text[] := array[
    'academic_activities', 'projects', 'books', 'skills', 'sprint_tasks',
    'avatar_url', 'test_scores', 'updated_at'
  ];
  v_old_sprints jsonb;
  v_new_sprints jsonb;
begin
  -- Админ — без ограничений.
  -- auth.uid() пустой — это SQL Editor / service role, тоже без ограничений.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - v_allowed - 'vision_map') is distinct from (to_jsonb(old) - v_allowed - 'vision_map') then
    raise exception 'Недостаточно прав: это поле может менять только ментор'
      using errcode = '42501';
  end if;

  -- Vision Map: ученик меняет только свои цели года (Future Review)
  if (coalesce(new.vision_map, '{}'::jsonb) - 'futureAcademicGoals' - 'futureOtherGoals')
     is distinct from (coalesce(old.vision_map, '{}'::jsonb) - 'futureAcademicGoals' - 'futureOtherGoals') then
    raise exception 'В Vision Map ученик может менять только свои цели года'
      using errcode = '42501';
  end if;

  -- Спринты: ученик не может добавлять/удалять спринты и менять их название.
  select coalesce(jsonb_agg(jsonb_build_array(e->'id', e->'sprintLabel', e->'title') order by ord), '[]'::jsonb)
    into v_old_sprints
    from jsonb_array_elements(coalesce(old.sprint_tasks, '[]'::jsonb)) with ordinality as t(e, ord);

  select coalesce(jsonb_agg(jsonb_build_array(e->'id', e->'sprintLabel', e->'title') order by ord), '[]'::jsonb)
    into v_new_sprints
    from jsonb_array_elements(coalesce(new.sprint_tasks, '[]'::jsonb)) with ordinality as t(e, ord);

  if v_old_sprints is distinct from v_new_sprints then
    raise exception 'Недостаточно прав: список и названия спринтов меняет только ментор'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Оценки за четверти: ученик вносит свои, ментор подтверждает
alter table public.term_grades add column if not exists verified boolean not null default true;

create or replace function public.term_grades_mark_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    -- Ментор: его оценки и правки сразу проверены (кроме явной снятой проверки)
    if tg_op = 'INSERT' or new.gpa is distinct from old.gpa then
      new.verified := true;
    end if;
  else
    if new.student_id is distinct from public.current_user_student_id() then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    new.verified := false;
  end if;
  return new;
end;
$$;

drop trigger if exists term_grades_mark_verified on public.term_grades;
create trigger term_grades_mark_verified
before insert or update on public.term_grades
for each row execute function public.term_grades_mark_verified();

drop policy if exists "term_grades_write_admin" on public.term_grades;
drop policy if exists "term_grades_admin_all" on public.term_grades;
create policy "term_grades_admin_all"
on public.term_grades for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "term_grades_student_insert" on public.term_grades;
create policy "term_grades_student_insert"
on public.term_grades for insert
to authenticated
with check (student_id = public.current_user_student_id());

drop policy if exists "term_grades_student_update" on public.term_grades;
create policy "term_grades_student_update"
on public.term_grades for update
to authenticated
using (student_id = public.current_user_student_id())
with check (student_id = public.current_user_student_id());

-- Ученик может удалить только свою ещё не проверенную оценку
drop policy if exists "term_grades_student_delete" on public.term_grades;
create policy "term_grades_student_delete"
on public.term_grades for delete
to authenticated
using (student_id = public.current_user_student_id() and verified = false);

-- Ученик сохраняет свои цели года, не трогая остальную Vision Map
create or replace function public.update_my_vision_goals(p_academic jsonb, p_other jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := public.current_user_student_id();
begin
  if v_student is null then
    raise exception 'Нет профиля ученика' using errcode = '42501';
  end if;
  update public.students
  set vision_map = coalesce(vision_map, '{}'::jsonb)
    || jsonb_build_object('futureAcademicGoals', coalesce(p_academic, '[]'::jsonb),
                          'futureOtherGoals', coalesce(p_other, '[]'::jsonb))
  where id = v_student;
end;
$$;

grant execute on function public.update_my_vision_goals(jsonb, jsonb) to authenticated;
