-- Откат SAT, этап 1 (migration-sat-1.sql)
-- Supabase → SQL Editor → вставьте весь файл → Run.
-- ВНИМАНИЕ: удаляет группы, потоки, зачисления, роли сотрудников и журнал сотрудников.
-- Менторские данные не трогает. Перед откатом скачайте копию (Ещё → База и копии).
-- Аккаунты сотрудников SAT останутся в Authentication → Users без доступа — удалите их там вручную.

begin;

drop function if exists public.student_courses(uuid);
drop function if exists public.sat_roster();
drop function if exists public.search_students_for_enrollment(text);
drop function if exists public.replace_group_staff(uuid, text, uuid, date);
drop function if exists public.transfer_enrollment(uuid, uuid, date);

drop table if exists public.enrollments cascade;
drop table if exists public.group_staff cascade;
drop table if exists public.groups cascade;
drop table if exists public.streams cascade;
drop table if exists public.courses cascade;

drop trigger if exists profiles_enforce_role_change on public.profiles;
drop function if exists public.enforce_profile_role_change();

drop table if exists public.staff_audit cascade;
drop table if exists public.staff_roles cascade;
drop table if exists public.staff_members cascade;

drop function if exists public.enrollment_course_from_group();
drop function if exists public.sync_staff_profile_role();
drop function if exists public.ensure_head_remains();
drop function if exists public.can_edit_group(uuid);
drop function if exists public.can_view_student(uuid);
drop function if exists public.can_manage_sat();
drop function if exists public.is_sat_staff();
drop function if exists public.is_head();
drop function if exists public.has_staff_role(text);
drop function if exists public.is_active_staff();

-- is_admin() как до этапа 1
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Регистрация как до этапа 1
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

-- Сотрудники SAT теряют вход в кабинет (роль student без карточки ученика ничего не видит)
update public.profiles set role = 'student' where role = 'staff';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'admin'));

commit;
