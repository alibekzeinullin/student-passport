-- Digital Passport TODAY Scholars — исправления безопасности
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно.
--
-- Что исправляет:
--   1. При регистрации роль больше не берётся из данных пользователя —
--      каждый новый аккаунт всегда 'student'. Админа назначают вручную в SQL.
--   2. Пользователь больше не может менять свою строку в profiles
--      (раньше ученик мог выставить себе role = 'admin').
--   3. Ученик может менять в своей карточке только свои разделы:
--      академ активность, проекты, книги, навыки и в спринтах —
--      только отметку «выполнено» и ссылки на артефакты.
--      Комментарии ментора, оценки, GPA, SAT/IELTS, ссылка родителей и т.д. —
--      только админ.

-- 1) Регистрация: роль всегда student ---------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Роль НЕ берётся из raw_user_meta_data: эти данные присылает сам пользователь.
  v_role text := 'student';
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_first_name text := coalesce(new.raw_user_meta_data->>'first_name', split_part(v_full_name, ' ', 1));
  v_last_name text := coalesce(new.raw_user_meta_data->>'last_name', '');
  v_class_name text := coalesce(new.raw_user_meta_data->>'class_name', '');
  v_school text := coalesce(new.raw_user_meta_data->>'school', '');
  v_education_system text := coalesce(new.raw_user_meta_data->>'education_system', 'Национальная');
  v_student_id uuid;
  v_default_skills jsonb := '[
    {"id":"skill-1","name":"Тайм-менеджмент и самодисциплина","status":"К освоению","notes":""},
    {"id":"skill-2","name":"Навыки коммуникации и самопрезентация","status":"К освоению","notes":""},
    {"id":"skill-3","name":"Лидерство и работа в команде","status":"К освоению","notes":""},
    {"id":"skill-4","name":"Навык написания Эссе","status":"К освоению","notes":""},
    {"id":"skill-5","name":"Цифровая гигиена","status":"К освоению","notes":""}
  ]'::jsonb;
begin
  insert into public.students (
    first_name, last_name, class_name, school, education_system, email, skills
  ) values (
    v_first_name, v_last_name, v_class_name, v_school, v_education_system, new.email, v_default_skills
  )
  returning id into v_student_id;

  insert into public.profiles (id, role, full_name, student_id)
  values (new.id, v_role, v_full_name, v_student_id);

  return new;
end;
$$;

-- 2) profiles: менять может только админ -------------------------------------
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 3) students: ученик меняет только разрешённые разделы ----------------------
create or replace function public.enforce_student_update_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Колонки, которые ученик может менять в своей карточке
  v_allowed text[] := array[
    'academic_activities', 'projects', 'books', 'skills', 'sprint_tasks', 'updated_at'
  ];
  v_old_sprints jsonb;
  v_new_sprints jsonb;
begin
  -- Админ — без ограничений.
  -- auth.uid() пустой — это SQL Editor / service role, тоже без ограничений.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'Недостаточно прав: это поле может менять только ментор'
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

drop trigger if exists students_enforce_update_rights on public.students;
create trigger students_enforce_update_rights
before update on public.students
for each row execute function public.enforce_student_update_rights();

-- 4) Проверка: кто сейчас админ (должны быть только вы) ----------------------
-- select p.full_name, u.email, p.role
-- from public.profiles p join auth.users u on u.id = p.id
-- where p.role = 'admin';
