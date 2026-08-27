-- Digital Passport TODAY Scholars
-- Выполните этот файл в Supabase: SQL Editor → New query → Run

-- 1) Профили (связь с auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'admin')) default 'student',
  full_name text not null default '',
  student_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Ученики (основные данные + jsonb для списков)
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  class_name text not null default '',
  school text not null default '',
  education_system text not null default 'Национальная',
  email text not null unique,
  avatar_url text,
  parent_access_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  mentor_note text not null default '',
  mentor_summary jsonb not null default '{"monthlyComment":"","nextMonthFocus":""}'::jsonb,
  attendance_score integer not null default 0 check (attendance_score between 0 and 100),
  assignments_score integer not null default 0 check (assignments_score between 0 and 100),
  gpa jsonb not null default '{"startMonthLabel":"Старт менторства","start":null,"january2027":null,"july2027":null}'::jsonb,
  test_scores jsonb not null default '{"sat":null,"ielts":null,"satTarget":null,"ieltsTarget":null}'::jsonb,
  sprint_tasks jsonb not null default '[]'::jsonb,
  academic_activities jsonb not null default '[]'::jsonb,
  projects jsonb not null default '[]'::jsonb,
  books jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  growth_zones jsonb not null default '[]'::jsonb,
  monthly_focuses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  drop constraint if exists profiles_student_id_fkey;

alter table public.profiles
  add constraint profiles_student_id_fkey
  foreign key (student_id) references public.students (id) on delete set null;

create index if not exists students_email_idx on public.students (email);
create index if not exists students_parent_token_idx on public.students (parent_access_token);
create index if not exists profiles_student_id_idx on public.profiles (student_id);

-- 3) updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

-- 4) helpers для RLS
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select student_id from public.profiles where id = auth.uid();
$$;

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

-- 5) Гостевой доступ родителя по токену (без логина)
create or replace function public.get_student_by_parent_token(p_token text)
returns setof public.students
language sql
stable
security definer
set search_path = public
as $$
  select * from public.students
  where parent_access_token = p_token
  limit 1;
$$;

create or replace function public.regenerate_parent_token(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can regenerate parent token';
  end if;

  new_token := encode(gen_random_bytes(16), 'hex');
  update public.students
  set parent_access_token = new_token
  where id = p_student_id;

  return new_token;
end;
$$;

-- 6) Регистрация ученика: создать student + profile после signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
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
  if v_role not in ('student', 'admin') then
    v_role := 'student';
  end if;

  if v_role = 'student' then
    insert into public.students (
      first_name, last_name, class_name, school, education_system, email, skills
    ) values (
      v_first_name, v_last_name, v_class_name, v_school, v_education_system, new.email, v_default_skills
    )
    returning id into v_student_id;
  end if;

  insert into public.profiles (id, role, full_name, student_id)
  values (new.id, v_role, v_full_name, v_student_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 7) RLS
alter table public.profiles enable row level security;
alter table public.students enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "students_select_own_or_admin" on public.students;
create policy "students_select_own_or_admin"
on public.students for select
to authenticated
using (
  public.is_admin()
  or id = public.current_user_student_id()
);

drop policy if exists "students_update_own_or_admin" on public.students;
create policy "students_update_own_or_admin"
on public.students for update
to authenticated
using (
  public.is_admin()
  or id = public.current_user_student_id()
)
with check (
  public.is_admin()
  or id = public.current_user_student_id()
);

drop policy if exists "students_insert_admin" on public.students;
create policy "students_insert_admin"
on public.students for insert
to authenticated
with check (public.is_admin());

drop policy if exists "students_delete_admin" on public.students;
create policy "students_delete_admin"
on public.students for delete
to authenticated
using (public.is_admin());

-- 8) Первый админ (после signup замените email)
-- update public.profiles
-- set role = 'admin', student_id = null
-- where id = (select id from auth.users where email = 'admin@today.edu');

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant execute on function public.get_student_by_parent_token(text) to anon, authenticated;
grant execute on function public.regenerate_parent_token(uuid) to authenticated;
