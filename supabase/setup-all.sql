-- Digital Passport TODAY Scholars — ВСЯ база одним файлом
-- Supabase → SQL Editor → New query → вставьте весь файл → Run.
-- Безопасно запускать повторно: недостающее добавится, данные не удаляются.
-- Файл собирается автоматически (scripts/build-setup-sql.mjs) — не правьте вручную.

-- ════════════════════════════════════════════════════════════
-- schema.sql
-- ════════════════════════════════════════════════════════════

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
  monthly_progress_reviews jsonb not null default '[]'::jsonb,
  vision_map jsonb not null default '{"academicYear":"","yearlyFocus":"","targetGpa":null,"examTargets":[],"projects":[],"softSkills":[],"extracurriculars":[],"futureAcademicGoals":[{"id":"fac-1","text":"","status":"Planned"},{"id":"fac-2","text":"","status":"Planned"},{"id":"fac-3","text":"","status":"Planned"},{"id":"fac-4","text":"","status":"Planned"},{"id":"fac-5","text":"","status":"Planned"}],"futureOtherGoals":[{"id":"fot-1","text":"","status":"Planned"},{"id":"fot-2","text":"","status":"Planned"},{"id":"fot-3","text":"","status":"Planned"},{"id":"fot-4","text":"","status":"Planned"},{"id":"fot-5","text":"","status":"Planned"}]}'::jsonb,
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
  -- Роль НЕ берётся из raw_user_meta_data: эти данные присылает сам пользователь.
  -- Админа назначают вручную (см. раздел 8 ниже).
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

-- Менять profiles (в т.ч. role) может только админ
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

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

-- Ученик может менять в своей карточке только свои разделы (см. migration-security.sql)
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

drop trigger if exists students_enforce_update_rights on public.students;
create trigger students_enforce_update_rights
before update on public.students
for each row execute function public.enforce_student_update_rights();

-- Удаление ученика админом: профиль + auth.user (не трогает admin)
create or replace function public.delete_student_as_admin(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can delete students';
  end if;

  select id, role into v_user_id, v_role
  from public.profiles
  where student_id = p_student_id
  limit 1;

  if v_role = 'admin' then
    raise exception 'Cannot delete a student profile linked to an admin account. First unlink: update profiles set student_id = null where id = %', v_user_id;
  end if;

  delete from public.students where id = p_student_id;

  if v_user_id is not null then
    delete from public.profiles where id = v_user_id;
    delete from auth.users where id = v_user_id;
  end if;
end;
$$;

-- 8) Первый админ (после signup замените email)
-- update public.profiles
-- set role = 'admin', student_id = null
-- where id = (select id from auth.users where email = 'admin@today.edu');

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant execute on function public.get_student_by_parent_token(text) to anon, authenticated;
grant execute on function public.regenerate_parent_token(uuid) to authenticated;
grant execute on function public.delete_student_as_admin(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-monthly-vision.sql
-- ════════════════════════════════════════════════════════════

-- Добавить колонки Monthly Progress Review и Vision Map
-- Выполните в Supabase SQL Editor, если проект уже создан по старой schema.sql

alter table public.students
  add column if not exists monthly_progress_reviews jsonb not null default '[]'::jsonb;

alter table public.students
  add column if not exists vision_map jsonb not null default '{
    "academicYear": "",
    "yearlyFocus": "",
    "targetGpa": null,
    "examTargets": [],
    "projects": [],
    "softSkills": [],
    "extracurriculars": [],
    "futureAcademicGoals": [
      {"id":"fac-1","text":"","status":"Planned"},
      {"id":"fac-2","text":"","status":"Planned"},
      {"id":"fac-3","text":"","status":"Planned"},
      {"id":"fac-4","text":"","status":"Planned"},
      {"id":"fac-5","text":"","status":"Planned"}
    ],
    "futureOtherGoals": [
      {"id":"fot-1","text":"","status":"Planned"},
      {"id":"fot-2","text":"","status":"Planned"},
      {"id":"fot-3","text":"","status":"Planned"},
      {"id":"fot-4","text":"","status":"Planned"},
      {"id":"fot-5","text":"","status":"Planned"}
    ]
  }'::jsonb;

-- ════════════════════════════════════════════════════════════
-- migration-delete-student.sql
-- ════════════════════════════════════════════════════════════

-- Удаление ученика админом (профиль + auth user)
-- Защита: нельзя удалить аккаунт с ролью admin
-- Выполните в Supabase SQL Editor

create or replace function public.delete_student_as_admin(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can delete students';
  end if;

  select id, role into v_user_id, v_role
  from public.profiles
  where student_id = p_student_id
  limit 1;

  if v_role = 'admin' then
    raise exception 'Cannot delete a student profile linked to an admin account. First unlink: update profiles set student_id = null where id = %', v_user_id;
  end if;

  delete from public.students where id = p_student_id;

  if v_user_id is not null then
    delete from public.profiles where id = v_user_id;
    delete from auth.users where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.delete_student_as_admin(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-security.sql
-- ════════════════════════════════════════════════════════════

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

drop trigger if exists students_enforce_update_rights on public.students;
create trigger students_enforce_update_rights
before update on public.students
for each row execute function public.enforce_student_update_rights();

-- 4) Проверка: кто сейчас админ (должны быть только вы) ----------------------
-- select p.full_name, u.email, p.role
-- from public.profiles p join auth.users u on u.id = p.id
-- where p.role = 'admin';

-- ════════════════════════════════════════════════════════════
-- migration-meetings.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — Журнал встреч
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно. Нужен уже применённый migration-security.sql.
--
-- meetings               — встречи (видят ментор, ученик и родитель)
-- meeting_mentor_notes   — план встречи и самооценка ментора (видит ТОЛЬКО админ)
-- Баллы «Посещаемость» и «Выполнение заданий» в карточке ученика
-- теперь считаются автоматически из журнала.

-- 1) Таблицы -----------------------------------------------------------------
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  meeting_date date not null default current_date,
  format text not null default 'individual' check (format in ('individual', 'group')),
  attendance text check (attendance in ('present', 'late', 'absent')),
  prev_homework text not null default '',
  hw_understanding integer check (hw_understanding between 1 and 10),
  hw_quality integer check (hw_quality between 1 and 10),
  summary text not null default '',
  homework text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_student_date_idx
  on public.meetings (student_id, meeting_date desc);

create table if not exists public.meeting_mentor_notes (
  meeting_id uuid primary key references public.meetings (id) on delete cascade,
  plan text not null default '',
  reflection_preparation integer check (reflection_preparation between 1 and 10),
  reflection_engagement integer check (reflection_engagement between 1 and 10),
  reflection_goal integer check (reflection_goal between 1 and 10),
  reflection_value integer check (reflection_value between 1 and 10),
  reflection_comment text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at
before update on public.meetings
for each row execute function public.set_updated_at();

drop trigger if exists meeting_mentor_notes_set_updated_at on public.meeting_mentor_notes;
create trigger meeting_mentor_notes_set_updated_at
before update on public.meeting_mentor_notes
for each row execute function public.set_updated_at();

-- 2) Права доступа -----------------------------------------------------------
alter table public.meetings enable row level security;
alter table public.meeting_mentor_notes enable row level security;

drop policy if exists "meetings_select_own_or_admin" on public.meetings;
create policy "meetings_select_own_or_admin"
on public.meetings for select
to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "meetings_write_admin" on public.meetings;
create policy "meetings_write_admin"
on public.meetings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "meeting_notes_admin_only" on public.meeting_mentor_notes;
create policy "meeting_notes_admin_only"
on public.meeting_mentor_notes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, update, delete on public.meeting_mentor_notes to authenticated;

-- 3) Родитель видит встречи по своей ссылке (без плана и самооценки) --------
create or replace function public.get_meetings_by_parent_token(p_token text)
returns setof public.meetings
language sql
stable
security definer
set search_path = public
as $$
  select m.* from public.meetings m
  join public.students s on s.id = m.student_id
  where s.parent_access_token = p_token
  order by m.meeting_date desc, m.created_at desc;
$$;

grant execute on function public.get_meetings_by_parent_token(text) to anon, authenticated;

-- 4) Автоподсчёт баллов ученика ---------------------------------------------
-- Посещаемость: был = 100%, опоздал = 50%, не пришёл = 0%.
-- Задания: среднее (понимание + качество) по встречам, ×10 → шкала 0–100.
-- Если в журнале ещё нет данных, баллы не трогаются.
create or replace function public.recalc_student_meeting_scores(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendance numeric;
  v_assignments numeric;
begin
  select avg(case attendance when 'present' then 100 when 'late' then 50 else 0 end)
    into v_attendance
    from public.meetings
    where student_id = p_student_id and attendance is not null;

  select avg(
      (coalesce(hw_understanding, hw_quality) + coalesce(hw_quality, hw_understanding)) / 2.0
    ) * 10
    into v_assignments
    from public.meetings
    where student_id = p_student_id
      and (hw_understanding is not null or hw_quality is not null);

  update public.students
  set attendance_score = coalesce(round(v_attendance)::int, attendance_score),
      assignments_score = coalesce(round(v_assignments)::int, assignments_score)
  where id = p_student_id;
end;
$$;

create or replace function public.meetings_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_student_meeting_scores(old.student_id);
    return old;
  end if;
  perform public.recalc_student_meeting_scores(new.student_id);
  if tg_op = 'UPDATE' and old.student_id is distinct from new.student_id then
    perform public.recalc_student_meeting_scores(old.student_id);
  end if;
  return new;
end;
$$;

drop trigger if exists meetings_recalc_scores on public.meetings;
create trigger meetings_recalc_scores
after insert or update or delete on public.meetings
for each row execute function public.meetings_after_change();

-- ════════════════════════════════════════════════════════════
-- migration-platform.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — дедлайны, оценки по четвертям, лента возможностей
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно. Нужны уже применённые migration-security.sql
-- и migration-meetings.sql.
--
-- student_deadlines — дедлайны ученика (олимпиады, конкурсы, хакатоны, задания)
-- term_grades       — GPA по четвертям / триместрам / полугодиям
-- opportunities     — лента возможностей (олимпиады, конкурсы, хакатоны)

-- 1) Дедлайны ---------------------------------------------------------------
create table if not exists public.student_deadlines (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  title text not null,
  category text not null default 'olympiad'
    check (category in ('olympiad', 'contest', 'hackathon', 'exam', 'application', 'task', 'other')),
  due_date date not null,
  url text not null default '',
  notes text not null default '',
  status text not null default 'planned'
    check (status in ('planned', 'submitted', 'skipped')),
  created_by_admin boolean not null default false,
  opportunity_id text,
  group_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_deadlines_student_due_idx
  on public.student_deadlines (student_id, due_date);
create index if not exists student_deadlines_group_idx
  on public.student_deadlines (group_key);

drop trigger if exists student_deadlines_set_updated_at on public.student_deadlines;
create trigger student_deadlines_set_updated_at
before update on public.student_deadlines
for each row execute function public.set_updated_at();

alter table public.student_deadlines enable row level security;

drop policy if exists "deadlines_select_own_or_admin" on public.student_deadlines;
create policy "deadlines_select_own_or_admin"
on public.student_deadlines for select
to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

-- Ученик добавляет только свои личные дедлайны
drop policy if exists "deadlines_insert" on public.student_deadlines;
create policy "deadlines_insert"
on public.student_deadlines for insert
to authenticated
with check (
  public.is_admin()
  or (student_id = public.current_user_student_id() and created_by_admin = false)
);

drop policy if exists "deadlines_update" on public.student_deadlines;
create policy "deadlines_update"
on public.student_deadlines for update
to authenticated
using (public.is_admin() or student_id = public.current_user_student_id())
with check (public.is_admin() or student_id = public.current_user_student_id());

-- Ученик удаляет только свои личные; дедлайны от ментора удаляет только ментор
drop policy if exists "deadlines_delete" on public.student_deadlines;
create policy "deadlines_delete"
on public.student_deadlines for delete
to authenticated
using (
  public.is_admin()
  or (student_id = public.current_user_student_id() and created_by_admin = false)
);

-- В дедлайнах от ментора ученик меняет только статус (подал / не буду)
create or replace function public.enforce_deadline_update_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.student_id is distinct from old.student_id
     or new.created_by_admin is distinct from old.created_by_admin
     or new.group_key is distinct from old.group_key
     or new.opportunity_id is distinct from old.opportunity_id then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  if old.created_by_admin
     and (to_jsonb(new) - array['status', 'updated_at'])
         is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
    raise exception 'Этот дедлайн добавил ментор: можно менять только статус'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists student_deadlines_enforce_rights on public.student_deadlines;
create trigger student_deadlines_enforce_rights
before update on public.student_deadlines
for each row execute function public.enforce_deadline_update_rights();

grant select, insert, update, delete on public.student_deadlines to authenticated;

create or replace function public.get_deadlines_by_parent_token(p_token text)
returns setof public.student_deadlines
language sql
stable
security definer
set search_path = public
as $$
  select d.* from public.student_deadlines d
  join public.students s on s.id = d.student_id
  where s.parent_access_token = p_token
  order by d.due_date;
$$;

grant execute on function public.get_deadlines_by_parent_token(text) to anon, authenticated;

-- 2) Оценки по четвертям / триместрам ---------------------------------------
alter table public.students
  add column if not exists term_system text not null default 'quarters';

alter table public.students drop constraint if exists students_term_system_check;
alter table public.students
  add constraint students_term_system_check
  check (term_system in ('quarters', 'trimesters', 'semesters'));

create table if not exists public.term_grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  academic_year text not null,
  term_number integer not null check (term_number between 1 and 4),
  gpa numeric(4, 2) check (gpa between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year, term_number)
);

drop trigger if exists term_grades_set_updated_at on public.term_grades;
create trigger term_grades_set_updated_at
before update on public.term_grades
for each row execute function public.set_updated_at();

alter table public.term_grades enable row level security;

drop policy if exists "term_grades_select_own_or_admin" on public.term_grades;
create policy "term_grades_select_own_or_admin"
on public.term_grades for select
to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "term_grades_write_admin" on public.term_grades;
create policy "term_grades_write_admin"
on public.term_grades for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.term_grades to authenticated;

create or replace function public.get_term_grades_by_parent_token(p_token text)
returns setof public.term_grades
language sql
stable
security definer
set search_path = public
as $$
  select g.* from public.term_grades g
  join public.students s on s.id = g.student_id
  where s.parent_access_token = p_token
  order by g.academic_year, g.term_number;
$$;

grant execute on function public.get_term_grades_by_parent_token(text) to anon, authenticated;

-- 3) Лента возможностей -----------------------------------------------------
create table if not exists public.opportunities (
  id text primary key,
  section text not null,
  name text not null,
  short_name text not null default '',
  description text not null default '',
  kind text not null default '',
  due_date date,
  approx boolean not null default false,
  next_cycle boolean not null default false,
  date_note text not null default '',
  location text not null default '',
  stages text not null default '',
  grades text not null default '',
  price text not null default '',
  topics text not null default '',
  gives text not null default '',
  how text not null default '',
  status text not null default '',
  url text not null default '',
  tags text[] not null default '{}',
  tier text not null default 'base',
  money text not null default 'free',
  source text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.opportunities enable row level security;

drop policy if exists "opportunities_select_all" on public.opportunities;
create policy "opportunities_select_all"
on public.opportunities for select
to authenticated
using (true);

drop policy if exists "opportunities_write_admin" on public.opportunities;
create policy "opportunities_write_admin"
on public.opportunities for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.opportunities to authenticated;

-- 4) Данные ленты (из сайта «Олимпиады 2026–27») ----------------------------
insert into public.opportunities (id, section, name, short_name, description, kind, due_date, approx, next_cycle, date_note, location, stages, grades, price, topics, gives, how, status, url, tags, tier, money, source) values
  ('respa', 'kz', 'Республиканская олимпиада по общеобразовательным предметам', 'Респ. олимпиада (школа, город, область)', 'Главная предметная олимпиада страны (Дарын). Здесь только начальные этапы: школьный, районный/городской и областной. Без них на республиканский этап и международные олимпиады не попасть.', 'Школьный этап до', '2026-11-30'::date, true, false, 'По правилам школьный этап проводится не позднее 30 ноября. Районный/городской и областной этапы назначает управление образования (обычно декабрь – февраль). Республиканский этап для справки: в 2026 году 19 марта – 21 апреля. Даты 2026–27 Дарын пока не опубликовал.', 'Очно: своя школа, затем район/город (для Астаны — городской этап), затем область/город республиканского значения', '1) школьный → 2) районный/городской → 3) областной → (4) республиканский). В 2025–26: 358 тыс. участников школьного этапа, 136 тыс. районного, 18 тыс. областного, 1 636 республиканского.', '9–11 классы. На республиканском этапе естественно-математические предметы для 9–11, гуманитарные для 10–11.', 'Бесплатно', '15 предметов: математика, информатика, физика, химия, биология, география, история Казахстана, казахский/русский язык и литература, английский, немецкий, французский, основы права', 'Дипломы городского и областного этапов идут в портфолио и открывают путь дальше. На республиканском этапе: медали МП РК, национальный олимпийский резерв (отбор на международные олимпиады), ректорские гранты вузов, скидки British Council на IELTS.', 'Через учителя-предметника своей школы: школа проводит школьный этап и подаёт победителей на районный/городской.', 'прошлый цикл', 'https://daryn.kz/respa/', array['free','grant','school']::text[], 'top', 'free', ''),
  ('r78', 'kz', 'Республиканская олимпиада для 7–8 классов', 'Олимпиада 7–8 классов', 'Предметная олимпиада Дарына для 7–8 классов. Для 8-классников это первая ступень перед основной олимпиадой 9–11 классов.', 'Районный этап', '2026-12-04'::date, true, false, 'В 2025–26 тур для 8 класса прошёл 4 декабря (естественно-математическое направление в 10:00, гуманитарное в 14:00 по Астане). Дата 2026–27 не объявлена.', 'Районный/городской этап, затем областной', 'Районный → областной → (республиканский)', '7 и 8 классы', 'Бесплатно', 'Математика, информатика, физика, химия, биология, география, история Казахстана, казахский/русский язык и литература, английский', 'Дипломы I–III степени. Хорошая разминка перед основной олимпиадой 9–11 классов.', 'Через школу.', 'прошлый цикл', 'https://daryn.kz/resp-junior-olimpiad-ru/', array['free','school']::text[], 'base', 'free', ''),
  ('po', 'kz', 'Президентская олимпиада по естественно-математическим предметам', 'Президентская олимпиада', 'Олимпиада для 11-классников, которые ещё не участвовали в республиканских и международных олимпиадах. На каждом этапе задачи сразу по четырём предметам.', 'Областной этап до', '2026-11-01'::date, true, false, 'По правилам областной этап проходит с 1 сентября по 1 ноября (в 2025 году 6 октября). Затем отборочный тур (тест на 60 вопросов + эссе) и республиканский этап в ноябре. Если областной этап в регионе уже прошёл, для нынешних 10-классников это цель на следующий год.', 'Областной этап проводит управление образования, затем отбор онлайн и финал в Астане', 'Областной → отборочный (тест 2 часа + эссе 1 час) → республиканский. От региона на отбор до 20 человек.', 'Только 11 класс, без опыта республиканских и международных олимпиад', 'Бесплатно', 'Математика, физика, химия, биология (все четыре)', 'Победителям — преимущественное право на государственный образовательный грант, ректорские гранты (SDU, AITU и др.), дипломы МП РК.', 'Через школу и управление образования; регистрация на платформе по инструкции Дарына.', 'уточнить', 'https://daryn.kz/po-ru/', array['free','grant','school']::text[], 'strong', 'free', ''),
  ('proj', 'kz', 'Республиканский конкурс научных проектов (Дарын)', 'Конкурс научных проектов', 'Исследовательский проект + тест по предмету. Финал проходит по стандартам Regeneron ISEF. Здесь важны школьный/районный и областной этапы.', 'Школьный/районный этап', '2026-11-30'::date, true, false, 'Темы проектов регистрируются через школу и управление образования (в 2025 году списки подавались до 15 сентября). Школьный/районный и областной этапы назначает регион (осень – зима). Республиканский финал в феврале (2026: 17–20 фев Караганда, 24–27 фев Астана).', 'Школа/район, затем областной этап (защита проекта + тест)', 'Школьный/районный → областной (защита + тест 60 вопросов, нужно от 50%) → экспертный отбор → (республиканский)', '8–11 классы (8-классники пишут тест по программе 9 класса). Проект можно делать вдвоём.', 'Бесплатно', '19 секций в 4 направлениях: физика, инженерия, науки о Земле; математика, информатика, экономика; химия, биология, экология; история, краеведение, лингвистика, литература', 'Сильнейшая для портфолио исследовательская строчка в Казахстане: медали МП РК, гранты вузов; в 2023 году лучшие STEM-проекты поехали на Regeneron ISEF.', 'Выбрать тему с научным руководителем в школе, школа регистрирует проект через управление образования.', 'прошлый цикл', 'https://daryn.kz/konkurs-proektov/', array['free','grant','school']::text[], 'top', 'free', ''),
  ('izho', 'kz', 'Международная Жаутыковская олимпиада (IZhO)', 'Жаутыковская олимпиада', 'Международная командная олимпиада по математике, физике и информатике (около 700 школьников из 15 стран). Попасть можно только в сборную своего города или области.', 'Список команд до', '2026-12-20'::date, true, false, 'Дарын публикует список команд до 20 декабря. Сама олимпиада до 1 апреля (в 2025 году 13–17 января в Астане).', 'Очно, Астана (РФМШ)', 'Отбор в сборную региона (по результатам предметных олимпиад) → олимпиада: 2 тура по каждому предмету', 'Школьники физмат-профиля; классы в положении не указаны', 'Бесплатно (расходы несёт направляющая сторона)', 'Математика, физика (теория + эксперимент), информатика', 'Медали и дипломы международной олимпиады — очень сильная строчка.', 'Одна сборная от Астаны: 3 математика, 2 физика, 2 информатика. Пробиваться через городской/областной этап олимпиады и спросить у учителя, как формируется сборная города. НИШ, РФМШ и БИЛ выставляют свои команды.', 'уточнить', 'https://daryn.kz/pol514/ZhautyqOru.pdf', array['free','school']::text[], 'top', 'free', ''),
  ('aul', 'kz', 'Республиканская олимпиада для учащихся сельских школ', 'Олимпиада сельских школ', 'Отдельная олимпиада только для сельских школ. Победители попадают на заключительный этап основной республиканской олимпиады.', 'Регистрация (след. цикл)', '2027-09-20'::date, true, true, 'В 2026 году регистрация на smart.daryn.kz прошла 14–20 сентября. Следующая ожидается в те же сроки, в середине сентября 2027.', 'Районный центр, затем область, финал в Астане', 'Стартовый → районный (октябрь) → областной (ноябрь) → (республиканский)', '9–11 классы сельских школ (последние два года в сельской школе)', 'Бесплатно', '13 предметов естественно-математического и гуманитарного направлений', 'Медали, путь на заключительный этап основной олимпиады, гранты SDU, оплата IELTS для победителей по английскому.', 'Только если школа сельская. Регистрация самостоятельно на smart.daryn.kz.', 'подтверждено', 'https://daryn.kz/aul-olimp/', array['free','grant']::text[], 'base', 'free', ''),
  ('vuz', 'kz', 'Вузовские олимпиады с грантами', 'Вузовские олимпиады', 'Казахстанские вузы проводят свои олимпиады для выпускников и дают победителям ректорские гранты. Даты у всех разные и публикуются на сайтах вузов.', 'Даты', null, true, false, 'Обычно с осени до весны. Каждую олимпиаду нужно проверять отдельно.', 'Очно или онлайн, по правилам вуза', 'Обычно один-два тура', 'Чаще 11 класс, у КБТУ 10–12', 'Обычно бесплатно', 'Аль-Фараби (КазНУ, 11 кл.); предметная олимпиада КБТУ (10–12); SPT (SDU); «Абай сыйы» (КазНПУ); AITUicode, программирование (Astana IT University); олимпиада ЕНУ им. Гумилёва; «Білім шыңы» (физика, математика, информатика)', 'Ректорские гранты и скидки при поступлении в этот вуз.', 'Следить за сайтами и соцсетями вузов, регистрироваться самостоятельно.', 'уточнить', 'https://ertisdaryn.kz/?page_id=3210&lang=ru', array['grant']::text[], 'base', 'free', ''),
  ('amc', 'math', 'AMC 10 / AMC 12', 'AMC 10/12', 'Американская математическая олимпиада, первый шаг к AIME и USAMO. Американские вузы её хорошо знают.', 'Тур', '2026-11-05'::date, false, false, 'AMC 10A/12A — 5 ноября 2026, AMC 10B/12B — 13 ноября 2026. Писать можно в зарегистрированном центре; для стран вне США и Канады есть программа AMC International.', 'Очно в зарегистрированной школе или центре', 'AMC 10/12 → AIME (зимой 2027) → USAMO/USAJMO (для граждан и резидентов США)', 'AMC 10: 10 класс и младше, до 17,5 лет. AMC 12: до 12 класса, до 19,5 лет.', 'Взнос центра (зависит от площадки)', 'Математика: 25 вопросов, 75 минут', 'Балл и AIME-квалификация (от 100 на AMC 10 и 85 на AMC 12) ценятся в заявках в США.', 'Найти в Казахстане центр, который проводит AMC (частные школы и подготовительные центры), или проверить страницу AMC International.', 'подтверждено', 'https://www.maa.org/AMC', array['school']::text[], 'top', 'paid', ''),
  ('himcm', 'math', 'HiMCM — математическое моделирование', 'HiMCM', 'Командный конкурс по моделированию от COMAP: за две недели решаете реальную задачу и пишете отчёт.', 'Окно конкурса', '2026-11-04'::date, false, false, 'Окно 4–17 ноября 2026; команда сама выбирает 14 дней или меньше. Срок регистрации и взнос на странице не указаны.', 'Онлайн', 'Один раунд, централизованная оценка', 'Старшая школа и младше; команды до 4 человек', 'Взнос за команду (уточнить)', 'Математическое моделирование, данные, отчёт на английском', 'Награды Outstanding / Finalist ценятся как исследовательский опыт.', 'Нужен руководитель (учитель), который регистрирует команду на comap.org.', 'уточнить', 'https://comap.org/contests/himcm-midmcm', array['online','team','school']::text[], 'strong', 'paid', ''),
  ('usamts', 'math', 'USAMTS', 'USAMTS', 'Заочная олимпиада с полными письменными решениями. На каждый раунд дают около месяца.', 'Раунд 2 до', '2026-11-30'::date, false, false, 'Сезон 2026–27 (Year 38) идёт: решения раунда 2 принимаются до 30 ноября 2026, 22:00 ET. Раунд 1 уже закрыт.', 'Онлайн', 'Несколько раундов в течение учебного года', 'Средняя и старшая школа', 'Бесплатно', 'Математика, доказательства', 'Тренирует олимпиадное письмо; признание в США.', 'Регистрация на usamts.org. Допуск иностранных школьников проверить в правилах.', 'уточнить', 'https://www.usamts.org/contest/problems', array['free','online']::text[], 'base', 'free', ''),
  ('tot', 'math', 'Турнир городов', 'Турнир городов', 'Международная математическая олимпиада с базовым и сложным вариантами, более 200 городов в 30+ странах.', 'Весенний тур', '2027-02-28'::date, true, false, 'Осенний тур 2026 прошёл: базовый 4 октября, сложный 18 октября. Дата весеннего тура не объявлена (обычно февраль – март).', 'Очно у местного организатора', 'Базовый вариант → сложный вариант (осень и весна отдельно); 11-классникам можно устный тур', '8–11 классы', 'Бесплатно или по условиям местного организатора', 'Математика: 5 часов, 6–7 задач, засчитываются 3 лучшие', 'Дипломы, известные в СНГ; хорошая подготовка к республиканской олимпиаде.', 'Найти организатора в Казахстане на turgor.ru → «География» (контакты региональных организаторов).', 'уточнить', 'https://olimpiada.ru/activity/5', array['school']::text[], 'strong', 'free', ''),
  ('euclid', 'math', 'Euclid Mathematics Contest (Waterloo)', 'Euclid', 'Конкурс Университета Ватерлоо для выпускников. Канадские вузы, особенно Waterloo, смотрят на результат.', 'Заказ через школу до', '2027-03-11'::date, false, false, 'Школа заказывает участие до 11 марта 2027. Сам тур: 7 апреля 2027 (для стран вне Америки).', 'Очно в школе', 'Один тур, 2,5 часа', 'Выпускной класс; младшие тоже могут. Официальные участники родились 1 января 2008 или позже.', '$18 за участника + $5 сбор + доставка', 'Математика', 'Сертификат отличия для топ-25%; результат используется при поступлении на математику в Waterloo.', 'Школа (учитель) регистрируется в Contest Supervisor Portal CEMC.', 'подтверждено', 'https://cemc.uwaterloo.ca/euclid', array['school']::text[], 'strong', 'paid', ''),
  ('purple', 'math', 'Purple Comet! Math Meet', 'Purple Comet', 'Бесплатная онлайн-олимпиада для команд, открыта для всех стран.', 'Окно конкурса', '2027-04-14'::date, true, false, 'В 2026 году: 14–23 апреля (UTC). Дата 2027 не объявлена.', 'Онлайн', 'Один раунд', 'Средняя и старшая школа', 'Бесплатно', 'Математика', 'Хорошее дополнение, но не главная строчка портфолио.', 'Школа может выставить сколько угодно команд; регистрация на purplecomet.org.', 'прошлый цикл', 'https://purplecomet.org/posters/poster2026.pdf', array['free','online','team']::text[], 'base', 'free', ''),
  ('pcup', 'sci', 'Physics Cup', 'Physics Cup', 'Онлайн-олимпиада Яана Калды: раз в месяц одна очень трудная задача, каждую неделю подсказка. Чем быстрее решение, тем больше баллов.', 'Старт', '2026-11-01'::date, true, false, 'Обычно стартует в середине октября (выпуск 2026 начался 19 октября 2025). Объявления о выпуске 2027 на сайте пока нет.', 'Онлайн', '5 задач в течение зимы', 'Школьники, которые по возрасту могут попасть в сборную на IPhO', 'Бесплатно', 'Физика олимпиадного уровня', 'Очень уважаемая среди физиков строчка, даже место в середине таблицы.', 'Регистрация через форму на physicscup.ee.', 'уточнить', 'https://physicscup.ee/', array['free','online']::text[], 'strong', 'free', ''),
  ('opho', 'sci', 'Online Physics Olympiad (OPhO)', 'OPhO', 'Студенческая онлайн-олимпиада для команд до 3 человек: короткие и длинные задачи плюс задачи-симуляции.', 'Тур', '2027-08-20'::date, true, false, 'В 2026 году прошла 21–23 августа. Даты 2027 не объявлены.', 'Онлайн', 'Один раунд', 'До 20 лет, не студенты', 'Бесплатно', 'Физика', 'Медали и места в мировом зачёте.', 'Регистрация команды на сайте OPhO.', 'прошлый цикл', 'https://borderless.so/extracurricular-programs/opho/opho', array['free','online','team']::text[], 'base', 'free', ''),
  ('bbo', 'sci', 'British Biology Olympiad (BBO)', 'British Biology Olympiad', 'Британская олимпиада по биологии. Международные школы могут участвовать, если их признаёт национальный орган образования.', 'Тур', '2027-01-15'::date, false, false, 'BBO 2027: 15–25 января. Регистрация открылась 1 октября 2026.', 'Онлайн, но в своей школе под наблюдением учителя', 'Две части по 45 минут', 'Выпускные классы (эквивалент британских)', '£50 за школу вне Великобритании', 'Биология', 'Золото, серебро, бронза — заметно в заявке в британские вузы.', 'Регистрирует учитель от имени школы на ukbiologycompetitions.org.', 'подтверждено', 'https://ukbiologycompetitions.org/?p=199', array['school']::text[], 'strong', 'paid', ''),
  ('ukcho', 'sci', 'UK Chemistry Olympiad', 'UK Chemistry Olympiad', 'Британская олимпиада по химии (Royal Society of Chemistry). Вне Великобритании доступна только школам с британской программой.', 'Регистрация до', '2027-01-14'::date, true, false, 'В цикле 2026: регистрация 17 сентября – 14 января, первый раунд 28 января. Даты 2027 на странице ещё не обновлены.', 'Письменно в своей школе', 'Раунд 1 (2 часа) → раунд 2 → сборная Великобритании', 'Рекомендуется от 16 лет', 'Для зарубежных школ платно (уточнять по email)', 'Химия', 'Сертификаты; ценится в британских вузах.', 'Только если школа учит по британской программе (IGCSE/A-level или IB) на английском.', 'уточнить', 'https://edu.rsc.org/olympiad', array['school']::text[], 'base', 'paid', ''),
  ('bl4s', 'sci', 'CERN Beamline for Schools', 'Beamline for Schools', 'Команда школьников предлагает эксперимент на пучке частиц. Победители проводят его в CERN или DESY за счёт организаторов.', 'Заявка до', '2027-03-12'::date, true, false, 'В 2026 году заявки принимали до 13 марта. Дата 2027 не опубликована.', 'Онлайн-заявка; финал в CERN, DESY или ELSA', 'Заявка с видео → отбор → эксперимент', 'Команда от 5 человек, от 16 лет', 'Бесплатно; победителям оплачивают дорогу и проживание', 'Физика частиц, эксперимент, проект на английском', 'Даже сертификат участника — редкая и запоминающаяся строчка.', 'Собрать команду и найти учителя-наставника.', 'прошлый цикл', 'https://borderless.so/extracurricular-programs/cern/beamline-for-schools', array['free','online','team']::text[], 'top', 'free', ''),
  ('sin', 'sci', 'Sir Isaac Newton Exam (Waterloo)', 'SIN Exam', 'Двухчасовой экзамен по механике от Университета Ватерлоо, пишется онлайн под наблюдением школы.', 'Тур', '2027-04-30'::date, true, false, 'В 2026 году прошёл 1 мая, регистрация открывалась в начале марта.', 'Онлайн, в школе', 'Один тур', 'Любой класс', '$4 за участника', 'Классическая механика', 'Лучших рассматривают на награды и стипендии Waterloo.', 'Регистрирует школа.', 'прошлый цикл', 'https://borderless.so/extracurricular-programs/university-of-waterloo-physics/sir-isaac-newton-exam', array['online','school']::text[], 'base', 'paid', ''),
  ('usaco', 'cs', 'USA Computing Olympiad (USACO)', 'USACO', 'Самая известная открытая олимпиада по программированию: четыре онлайн-тура за сезон, лестница Bronze → Silver → Gold → Platinum.', 'Первый тур', '2026-12-11'::date, true, false, 'Официальные даты сезона 2026–27 пока не опубликованы. В прошлом сезоне туры были в январе – феврале и US Open в конце марта. Каждый тур открыт с четверга по воскресенье, решать 4 часа подряд.', 'Онлайн', '4 тура; повышение в дивизионе по баллам', 'Школьники любого класса и страны', 'Бесплатно', 'Алгоритмы: C++, Java, Python', 'Gold и Platinum — сильный сигнал для CS-специальностей. Сборы и сборная США только для американских школьников.', 'Создать аккаунт на usaco.org.', 'уточнить', 'https://www.lumiere-education.com/post/everything-you-need-to-know-about-the-usa-computing-olympiad', array['free','online']::text[], 'top', 'free', ''),
  ('cpfed', 'cs', 'Республиканская школьная олимпиада по спортивному программированию (CPFED)', 'CPFED Olymp', 'Олимпиада Федерации спортивного программирования Казахстана. Два дивизиона: специализированные и общеобразовательные школы.', 'Финал', '2027-04-25'::date, true, false, 'В 2025 году финал прошёл 27 апреля в Astana IT University после предварительного отбора. Даты 2026–27 не объявлены.', 'Отбор, затем очный финал в Астане', 'Предварительный отбор → финал', '9–11 классы', 'Бесплатно', 'Спортивное программирование', 'Медали и денежные сертификаты (фонд 3 млн тенге в 2025). Федерация же собирает сборные на IOI и IOAI.', 'Аккаунт на cpfed.kz, следить за новостями федерации.', 'уточнить', 'https://cpfed.kz/', array['free']::text[], 'strong', 'free', ''),
  ('aiolymp', 'cs', 'Республиканская олимпиада по искусственному интеллекту', 'Олимпиада по ИИ', 'Национальная олимпиада по ИИ: онлайн-отбор по программированию, математике и машинному обучению, затем очный финал. Ведёт к сборной на IOAI.', 'Весна', null, true, false, 'Проводится весной: онлайн-отбор и очный финал для 30–40 лучших. Даты 2027 не объявлены. Сборная на IOAI 2026 (Астана) формировалась по итогам сборов федерации.', 'Онлайн-отбор, очный финал', 'Онлайн-отбор → финал → сборы → сборная IOAI', 'Школьники', 'Бесплатно', 'Программирование, математика, классическое машинное обучение', 'Путь в сборную Казахстана на IOAI; в 2026 году сборная взяла 8 медалей.', 'Следить за cpfed.kz и новостями Минцифры.', 'уточнить', 'https://the-tech.kz/v-kazahstane-projdet-pervaya-respublikanskaya-olimpiada-po-iskusstvennomu-intellektu/', array['free']::text[], 'strong', 'free', ''),
  ('faio', 'cs', 'FAIO — международная AI-олимпиада', 'FAIO', 'Международная олимпиада по ИИ для команд школьников в Казахстане. Опыт в машинном обучении не обязателен: теория даётся в задачах.', 'Регистрация (след. цикл)', '2027-09-19'::date, true, true, 'В 2026 году регистрация закрылась 19 сентября, онлайн-отбор прошёл 20 сентября, финал 27–28 октября в Алматы (РФМШ). Следующий цикл ожидается в сентябре 2027; повтор пока не объявлен.', 'Онлайн-отбор, финал в Алматы', 'Онлайн-отбор → финал', 'Школьники, команды 1–3 человека', 'Бесплатно', 'Машинное обучение, программирование, математика', 'Международный диплом по ИИ.', 'Регистрация на faio.kz.', 'подтверждено', 'https://faio.kz/', array['free','online','team']::text[], 'base', 'free', ''),
  ('locke', 'hum', 'John Locke Institute Global Essay Prize', 'John Locke Essay', 'Самый известный международный конкурс эссе для школьников: философия, политика, экономика, история, психология, теология, право.', 'Регистрация до', '2027-03-31'::date, true, false, 'В цикле 2026: регистрация до 31 марта, подача эссе 1 апреля – 31 мая. Вопросы обычно публикуют в январе.', 'Онлайн', 'Регистрация → эссе → шорт-лист → награждение в Оксфорде', 'До 19 лет на дату дедлайна; Junior — до 15 лет', 'Бесплатно (поздняя подача платная)', 'Эссе до 2 000 слов на английском', 'Призы $1 000–5 000 в каждой категории, лучшее эссе $10 000. Шорт-лист и Commendation тоже сильные строчки.', 'Регистрация на johnlockeinstitute.com.', 'прошлый цикл', 'https://www.johnlockeinstitute.com/essay-competition', array['free','online']::text[], 'top', 'free', ''),
  ('immerse', 'hum', 'Immerse Education Essay Competition', 'Immerse Essay', 'Короткое эссе на 500 слов по одной из 20+ тем (от ИИ до права). Призы — стипендии на летние курсы Immerse.', 'Подача до', '2026-10-25'::date, false, false, 'Дедлайн конкурса 2027: 25 октября 2026. Результаты 9 ноября. В FAQ упоминаются и другие дедлайны (сентябрь, январь), сверить на сайте.', 'Онлайн', 'Одна подача', '13–18 лет', 'Бесплатно', 'Любой предмет, 450–550 слов', '10 победителей получают 100% стипендию на курс Immerse, остальные — частичные. Для портфолио средний уровень.', 'Подать эссе на immerse.education.', 'подтверждено', 'https://immerse.education/essay-competition', array['free','online']::text[], 'base', 'free', ''),
  ('philo', 'kz', 'Олимпиада по критическому мышлению и философии (Дарын)', 'Критическое мышление (Дарын)', 'Новая олимпиада Дарына на рассуждение, аргументацию и этику. Задания на английском. Как и основная олимпиада, идёт этапами от школы.', 'Регистрация школы (след. цикл)', '2027-09-30'::date, true, true, 'Цикл 2026–27: школа регистрировалась до 30 сентября, I этап прошёл 5 октября в школах. II–IV этапы — с ноября по февраль (даты не объявлены), туда идут только прошедшие I этап. Следующий набор ожидается в конце сентября 2027.', 'I этап очно в своей школе (тест 60 минут)', 'I школьный → II → III → IV (республиканский)', '9–11 (12) классы, английский от B1', 'Бесплатно', 'Критическое мышление, логика аргументации, этика', 'Дипломы Дарына; редкая для Казахстана гуманитарная олимпиада на английском.', 'Самостоятельно зарегистрироваться нельзя: школа записывается через координатора. Предупредите завуча заранее, в начале сентября.', 'подтверждено', 'https://daryn.kz/kk/philosophy-syni-oilau/', array['free','school']::text[], 'strong', 'free', '@scholars_compass'),
  ('iysb', 'kz', 'International Young Scientists Battles (IYSB)', 'IYSB', 'Международные командные «научные бои» по математике, физике, химии и информатике с финалом в Алматы.', 'Регистрация (след. цикл)', '2027-07-22'::date, true, true, 'В 2026 году: регистрация до 22 июля, онлайн-отбор 23 июля, очный финал 23–27 августа в Алматы (кампус IITU). Цикл 2027 не объявлен, ожидаем те же сроки.', 'Онлайн-отбор, финал в Алматы', 'Онлайн-отбор → очный финал (бои)', '7–12 классы, команды 3–4 человека (химия индивидуально)', 'Бесплатно', 'Математика, физика, химия, информатика', 'Медали, международные сертификаты, гранты в KBTU и IITU.', 'Регистрация на iysb.science.', 'прошлый цикл', 'https://iysb.science/ru/register', array['free','team','grant']::text[], 'strong', 'free', '@scholars_compass, @self_construction1'),
  ('pumac', 'math', 'PUMaC — Princeton University Mathematics Competition', 'PUMaC', 'Математический турнир Принстона: личные тесты по разделам, командный раунд и Power Round с доказательствами. Есть удалённый формат Power Round.', 'Регистрация (след. цикл)', '2027-10-11'::date, true, true, 'Цикл 2026: регистрация закрылась 11 октября, турнир 21 ноября в Принстоне. Следующая регистрация ожидается в начале октября 2027.', 'Очно в Принстоне; Power Round можно удалённо', 'Личные тесты (алгебра, комбинаторика, геометрия, теория чисел) + командный + Power Round → финал лучших', 'До 20 лет; команды до 8 человек, можно в составе международной команды', '$15 за участника, $120 за команду', 'Математика олимпиадного уровня', 'Один из самых уважаемых студенческих турниров США; призовое место заметно в заявке.', 'Собрать команду или войти в международную команду; регистрация на pumac.princeton.edu.', 'прошлый цикл', 'https://pumac.princeton.edu/', array['team']::text[], 'top', 'paid', '@self_construction1'),
  ('bjc', 'sci', 'Breakthrough Junior Challenge', 'Breakthrough Junior Challenge', 'Двухминутное видео на английском, объясняющее идею из физики, наук о жизни или математики. Главный приз — стипендия $250 000.', 'Дедлайн (след. цикл)', '2027-09-15'::date, true, true, 'В 2026 году дедлайн был 15 сентября, плюс обязательная оценка 5 чужих работ до 30 сентября. В 2025 году приём открылся 7 мая и закрылся 15 сентября. Ожидаем открытие в мае 2027 и дедлайн около 15 сентября.', 'Онлайн (видео на YouTube)', 'Видео → взаимная оценка → жюри', '13–18 лет, любая страна, индивидуально', 'Бесплатно', 'Физика, науки о жизни, математика; научная коммуникация', 'Победителю $250 000 на учёбу, учителю $50 000, школе лаборатория на $100 000. Даже полуфинал — сильная строчка.', 'Подать видео на breakthroughjuniorchallenge.org.', 'прошлый цикл', 'https://breakthroughjuniorchallenge.org/news/49', array['free','online']::text[], 'top', 'free', '@scholars_compass'),
  ('bpho', 'sci', 'British Physics Olympiad (BPhO)', 'British Physics Olympiad', 'Британская олимпиада по физике: онлайн-тест, затем письменная олимпиада с полными решениями. Международные центры могут участвовать по правилам организаторов.', 'Регистрация (след. цикл)', '2027-09-16'::date, true, true, 'В 2026 году регистрация закрылась 16 сентября. В сезоне 2025–26 Physics Challenge (Year 13) прошёл 15 декабря, Senior Physics Challenge (Year 12) 9 марта. Ожидаем те же сроки.', 'Онлайн/письменно в школе', 'Раунд 1 (тест, 25 вопросов) → письменная олимпиада → сборная Великобритании', 'Старшие классы (британские Years 12–13)', 'Уточнить у организаторов', 'Механика, электромагнетизм, термодинамика, современная физика', 'Медали и сертификаты, известные британским вузам.', 'Регистрирует учитель физики или школа; для школ вне Великобритании правила уточнять на bpho.org.uk.', 'уточнить', 'https://www.slc.gr/news-article/1472/british-physics-olympiad-2025-2026', array['school']::text[], 'strong', 'paid', '@pasha_harvard'),
  ('usmdo', 'sci', 'US Medicine & Disease Olympiad (USMDO)', 'USMDO', 'Олимпиада по медицине и болезням: 160 вопросов за 2 часа. Открыта для стран без своей национальной олимпиады по медицине, включая Казахстан.', 'Регистрация (след. цикл)', '2027-07-26'::date, true, true, 'В 2026 году регистрация до 26 июля, экзамен 2 августа (окно входа, для Казахстана ночь – утро 3 августа). Ожидаем те же сроки.', 'Онлайн', 'Один экзамен', 'Школьники', '$10', 'Клеточная биология и генетика, физиология человека, болезни', 'Хорошая строчка для будущих медиков.', 'Регистрация через форму на usmdo.org.', 'прошлый цикл', 'https://www.usmdo.org/usmdoreg', array['online']::text[], 'base', 'paid', '@scholars_compass'),
  ('conrad', 'proj', 'Conrad Challenge', 'Conrad Challenge', 'Командный конкурс инноваций: за учебный год команда разрабатывает решение и бизнес-модель, финал в Space Center Houston.', 'Фаза 1 до', '2026-10-29'::date, false, false, 'Фаза 1 и Lean Canvas: до 29 октября 2026, 23:59 CDT (30 октября, 09:59 по Астане). Дальше Innovation Stage и финал весной.', 'Онлайн; финал в Хьюстоне, США', 'Фаза 1 (идея, Lean Canvas) → Innovation Stage (бизнес-план, видео, сайт) → финал', '13–18 лет, команды 2–5 человек + взрослый наставник; можно из разных школ и стран', 'Фаза 1 бесплатно; фаза 2 около $499 с команды в прошлых циклах (есть помощь)', 'Аэрокосмос, кибербезопасность, энергия и окружающая среда, здоровье и питание, вода', 'Статус Pete Conrad Scholar, помощь с патентом, стипендии Lewis & Clark College ($15–22 тыс. в год).', 'Регистрация команды на conradchallenge.awardsplatform.com.', 'подтверждено', 'https://conrad.spacecenter.org/', array['team','online']::text[], 'top', 'paid', '@pasha_harvard, @scholars_compass'),
  ('diamond', 'proj', 'Diamond Challenge (University of Delaware)', 'Diamond Challenge', 'Конкурс предпринимательства для школьников: треки Business Innovation и Social Innovation.', 'Подача до', '2027-01-14'::date, false, false, 'Приём с 16 сентября 2026 по 14 января 2027, 17:00 EST (15 января, 03:00 по Астане). Финалисты выступают 29–30 апреля 2027 в Университете Делавэра.', 'Онлайн; финал в США', 'Концепция (3–5 стр.) + видео 60 с → отбор → финал', '14–18 лет, команды 2–4 + взрослый наставник от 21 года', 'Бесплатно', 'Бизнес и социальное предпринимательство', 'Призовой фонд $100 000.', 'Подача на diamondchallenge.org.', 'подтверждено', 'https://diamondchallenge.org/competition/', array['free','team','online']::text[], 'strong', 'free', '@scholars_compass, @pasha_harvard'),
  ('earthprize', 'proj', 'The Earth Prize', 'The Earth Prize', 'Международный конкурс экологических решений: проблема, решение и план внедрения.', 'Регистрация до', '2027-01-10'::date, false, false, 'Регистрация до 10 января 2027, подача работ до 31 января 2027.', 'Онлайн', 'Регистрация → проект → отбор', 'Родившиеся в 2007–2014 годах, индивидуально или командой', 'Бесплатно', 'Экология и устойчивое развитие', 'Известный международный конкурс с денежными призами (размер уточнить на сайте).', 'Регистрация на theearthprize.org.', 'подтверждено', 'https://theearthprize.org/', array['free','online','team']::text[], 'strong', 'free', '@pasha_harvard'),
  ('whinv', 'proj', 'Wharton Global High School Investment Competition', 'Wharton Investment', 'Команда управляет виртуальным портфелем под цели реального выпускника Wharton. Около 1 800 команд, в полуфинал проходит примерно 3%.', 'Регистрация (след. цикл)', '2027-09-12'::date, true, true, 'Цикл 2026–27: регистрация закрылась 12 сентября, финал 29–30 апреля 2027 в Филадельфии. Следующая регистрация ожидается в начале сентября 2027.', 'Онлайн; финал в Филадельфии', 'Состав команды → инвестиционная политика → отчёт → финал', '9–12 классы, команды 4–6 + учитель-наставник; капитан от 16 лет', 'Бесплатно', 'Финансы, инвестиции', 'Бренд Wharton; полуфинал и финал очень весомы.', 'Регистрирует учитель на сайте Wharton Global Youth.', 'прошлый цикл', 'https://globalyouth.wharton.upenn.edu/competitions/investment-competition/', array['free','team','online','school']::text[], 'strong', 'free', '@scholars_compass, @pasha_harvard'),
  ('whds', 'proj', 'Wharton Global Youth Data Science Competition', 'Wharton Data Science', 'Командный конкурс по анализу данных (спортивная аналитика): рейтинги и прогнозы по данным, затем защита.', 'Регистрация до', '2027-01-26'::date, false, false, 'Регистрация 1 декабря 2026 – 26 января 2027. Данные 1 февраля, первые прогнозы до 1 марта, презентации полуфиналистов до 22 марта, онлайн-финал 14 апреля 2027.', 'Онлайн', 'Анализ → прогнозы → полуфинал → финал', '14–18 лет, команды 3–5 из одной школы; капитан от 16 лет', 'Бесплатно', 'Анализ данных, статистика, спорт', 'Бренд Wharton; хорошо для заявок на CS, экономику, статистику.', 'Учитель регистрирует команду как наставник.', 'подтверждено', 'https://globalyouth.wharton.upenn.edu/competitions/data-science/', array['free','team','online','school']::text[], 'strong', 'free', '@pasha_harvard'),
  ('oxsaid', 'proj', 'Oxford Saïd Global Climate Tech Challenge', 'Oxford Climate Tech', 'Командный конкурс бизнес-школы Оксфорда по климатическим технологиям: презентация и видео.', 'Дедлайн (след. цикл)', '2027-08-17'::date, true, true, 'В 2026 году дедлайн был 17 августа, 23:59 GMT. Цикл 2027 не объявлен.', 'Онлайн', 'PDF до 10 стр. + видео до 3 мин', '15–18 лет, команды 3–5, можно из разных стран', 'Бесплатно', 'Качество воздуха, вода, продовольствие, биоразнообразие, экстремальная погода', 'Бренд Oxford Saïd.', 'Подача на сайте Saïd Business School.', 'прошлый цикл', 'https://www.sbs.ox.ac.uk/climate-change-challenge/oxford-said-global-climate-tech-challenge-2026', array['free','team','online']::text[], 'base', 'free', '@self_construction1'),
  ('ieox', 'hum', 'IEOx Essay Challenge (International Economics Olympiad)', 'IEOx Essay', 'Эссе-конкурс Международной олимпиады по экономике. Тема цикла 2026–27 — экономика климата.', 'Подача до', '2026-12-15'::date, false, false, 'Дедлайн 15 декабря 2026. Онлайн-семинар для отмеченных авторов 16 февраля 2027.', 'Онлайн', 'Аннотация 250–400 слов + эссе 1 500–2 000 слов', 'До 20 лет на 30 июня 2027; индивидуально или до 3 человек', 'Бесплатно', 'Углеродные рынки, зелёные финансы, экономика изменения климата; использование ИИ запрещено', '40 работ отмечаются, 5 спецнаград. Бренд IEO.', 'Подача на ieo-official.org/essaychallenge.', 'подтверждено', 'https://ieo-official.org/essaychallenge', array['free','online','team']::text[], 'strong', 'free', '@self_construction1'),
  ('ippf', 'hum', 'International Public Policy Forum (IPPF)', 'IPPF', 'Письменные дебаты для команд: квалификационное эссе, затем плей-офф письменных раундов и финал в Нью-Йорке.', 'Эссе (след. цикл)', '2027-10-13'::date, true, true, 'Цикл 2026–27: квалификационное эссе до 13 октября 2026. Следующий цикл ожидается с похожим сроком в октябре 2027; ранняя регистрация летом бесплатна.', 'Онлайн; финал в Нью-Йорке', 'Эссе до 3 000 слов → топ-64 → письменные дебаты → 8 команд в финале', '9–12 классы, команды 3–6', 'Летом бесплатно, позже $25 с команды', 'Публичная политика, международные отношения', 'Победитель $10 000, финалист $5 000; финалистам оплачивают поездку.', 'Регистрация на ippfdebate.com.', 'прошлый цикл', 'https://www.ippfdebate.com/', array['team','online']::text[], 'strong', 'free', '@pasha_harvard, @self_construction1'),
  ('benn', 'hum', 'Bennington Young Creators Awards', 'Bennington Awards', 'Награды Беннингтонского колледжа в четырёх категориях: писатели, инноваторы, учёные, художники и музыканты.', 'Подача до', '2026-11-01'::date, false, false, 'Дедлайн 1 ноября 2026, 23:59 ET.', 'Онлайн', 'Одна подача', '9–12 классы, нужна подпись учителя или наставника', 'Бесплатно', 'Проза, эссе, поэзия (до 1 500 слов), инновации, наука, искусство, музыка', '$2 000 / $1 000 / $500 и стипендии Bennington при поступлении.', 'Подача на bennington.edu.', 'подтверждено', 'https://www.bennington.edu/events/bennington-young-creators-awards', array['free','online']::text[], 'base', 'free', '@scholars_compass, @self_construction1'),
  ('nasa', 'hack', 'NASA International Space Apps Challenge', 'NASA Space Apps', 'Крупнейший в мире хакатон на открытых данных NASA: 450+ площадок, можно очно или онлайн. Кодить уметь не обязательно.', 'Хакатон', '2026-11-14'::date, false, false, '14–15 ноября 2026; подача проекта до 15 ноября, 23:59 по местному времени. Регистрация открыта до конца хакатона. Полные задания 28 октября.', 'Местная площадка (проверить Астану/Алматы в «Choose a Local Event») или онлайн', 'Хакатон → глобальное жюри', 'Любой возраст; до 18 лет регистрирует родитель. Команды до 6 человек', 'Бесплатно', 'Космос, Земля, данные NASA', 'Сертификат всем; номинанты глобального жюри — очень заметная строчка.', 'Регистрация на spaceappschallenge.org.', 'подтверждено', 'https://www.spaceappschallenge.org/2026/', array['free','team','online']::text[], 'strong', 'free', '@scholars_compass, @self_construction1'),
  ('yimo', 'res', 'Youth International Math Olympiad (YIMO) + раунд в Астане', 'YIMO', 'Студенческая онлайн-олимпиада по математике (уровень AMC 10 – AIME). Отдельно идёт набор на очный раунд YIMO Astana в NIS IB.', 'Онлайн-тур (след. цикл)', '2027-08-29'::date, true, true, 'В 2026: регистрация до 27 августа, тур 29–30 августа. Раунд в Астане: регистрация открыта, даты не указаны.', 'Онлайн; раунд в Астане очно', '', 'Любые классы', 'Бесплатно', 'Математика', 'Медали топ-10/20/30%.', 'yimo-official.org', 'прошлый цикл', 'https://www.yimo-official.org/', array['free','online','olymp']::text[], 'res', 'free', '@pasha_harvard, @edu_strategies'),
  ('glrc', 'res', 'Global Logic & Reasoning Competition (GLRC)', 'GLRC', 'Онлайн-конкурс по логике: квалификация, полуфинал под наблюдением, финал.', 'Квалификация (след. цикл)', '2027-09-06'::date, true, true, 'В 2026: квалификация до 6 сентября, полуфинал 18–20 октября, финал 17 ноября.', 'Онлайн', '', 'Junior до 16 лет, Youth 16+', '€12 на полуфинале', 'Логика', 'Медали, призовой фонд от $1 500.', 'gllrc.org', 'прошлый цикл', 'https://gllrc.org/en/index', array['online','olymp']::text[], 'res', 'paid', '@self_construction1'),
  ('ewc', 'res', 'Economics World Cup', 'Economics World Cup', 'Онлайн-соревнование по экономике: торговая симуляция, затем бизнес-кейс. Знания экономики не нужны.', 'Регистрация до', '2026-11-01'::date, false, false, 'Регистрация: 1 ноября 2026 (первая сессия) и 15 ноября 2026 (вторая).', 'Онлайн', '', '12–19 лет, индивидуально или до 6 человек', 'Уточнить', 'Экономика, бизнес-кейс', 'По превью — поездка в Оксфорд для победителей (уточнить).', 'economicsworldcup.org', 'подтверждено', 'https://economicsworldcup.org/timeline', array['online','team','biz']::text[], 'res', 'free', '@self_construction1'),
  ('hsacc', 'res', 'Harvard Student Agencies Case Competition (HSACC)', 'HSACC', 'Онлайн-кейс по бизнесу от студенческой организации Гарварда (не самого университета).', 'Регистрация (след. цикл)', '2027-10-17'::date, true, true, 'Цикл 2026: регистрация до 17 октября, первый раунд до 31 октября, итоги 6 декабря.', 'Онлайн', '', 'Старшеклассники, индивидуально', '$5–15', 'Бизнес-стратегия', 'Денежные призы до $3 000, стажировки для лучших.', 'highschoolcasecomp.org', 'прошлый цикл', 'https://forms.highschoolcasecomp.org/registration', array['online','biz']::text[], 'res', 'paid', '@pasha_harvard, @self_construction1'),
  ('crimson', 'res', 'Harvard Crimson Business Competition', 'Crimson Business', 'Кейс-конкурс от газеты Harvard Crimson; отборочный раунд доступный, финал в Гарварде очень избирательный.', 'Регистрация открывается', '2026-12-01'::date, true, false, 'Регистрация на следующий цикл открывается в декабре.', 'Онлайн; финал в Гарварде', '', 'Junior 6–9 кл., Senior 10–12 кл.', 'Уточнить', 'Бизнес', 'Финал — заметная строчка.', 'programs.thecrimson.com', 'уточнить', 'https://programs.thecrimson.com/harvard-crimson-business-comp', array['biz']::text[], 'res', 'paid', '@pasha_harvard'),
  ('blueocean', 'res', 'Blue Ocean Student Entrepreneur Competition', 'Blue Ocean', 'Виртуальный питч-конкурс для команд, 1 500+ команд в год, топ-100 — около 5–7%.', 'Дедлайн', null, true, false, 'Регистрация открыта, дедлайн на сайте.', 'Онлайн', '', 'Школьники, команды', 'Бесплатно', 'Предпринимательство', 'Топ-100 и финал.', 'blueoceancompetition.org', 'уточнить', 'https://blueoceancompetition.org/register/', array['free','online','team','biz']::text[], 'res', 'free', '@pasha_harvard'),
  ('awardx', 'res', 'AwardX International', 'AwardX', 'Питч-конкурс для школьников с бизнесом или идеей.', 'Заявка до', '2026-11-14'::date, false, false, 'Заявка до 14 ноября 2026, финалисты 28 ноября, Demo Day 12 декабря.', 'Онлайн', '', 'Старшеклассники, индивидуально или командой', 'Бесплатно', 'Стартапы', '1 место $5 000 + стипендия LaunchX; финалистам стипендия $3 000.', 'awardx.com', 'подтверждено', 'https://awardx.com/competitions/26-international', array['free','online','biz']::text[], 'res', 'free', '@scholars_compass'),
  ('iasc', 'res', 'International AI Startup Challenge', 'AI Startup Challenge', 'Онлайн-конкурс ИИ-стартапов: видео-питч и прототип.', 'Регистрация до', '2026-11-01'::date, false, false, 'Регистрация до 1 ноября 2026; разработка 2 ноября – 20 декабря; онлайн-финал 22 января – 14 февраля 2027.', 'Онлайн', '', '13–18 лет, до 5 человек', 'Бесплатно', 'ИИ, стартапы', 'Сертификаты и отзывы; денежных призов нет.', 'joiniasc.org', 'подтверждено', 'https://www.joiniasc.org/', array['free','online','team','biz']::text[], 'res', 'free', '@self_construction1'),
  ('apex', 'res', 'Apex Discovery Challenge', 'Apex Discovery', 'Видео на 60–120 секунд с объяснением научного понятия.', 'Подача до', '2026-11-15'::date, false, false, 'Дедлайн 15 ноября 2026.', 'Онлайн', '', '13–18 лет', 'Уточнить', 'Химия, Земля и космос, CS и ИИ, экология', '$1 000 / $750 / $500.', 'thecareerdiscovery.com', 'подтверждено', 'https://www.thecareerdiscovery.com/pitch_competition', array['online']::text[], 'res', 'free', '@self_construction1'),
  ('oxessay', 'res', 'The Oxford Essay Prize (Global Essay Prize)', 'Oxford Essay Prize', 'Коммерческий конкурс эссе (не Оксфордский университет); призы — оплата образовательных программ.', 'Подача до', '2027-01-31'::date, false, false, 'Ранняя подача с бонусом до 15 ноября 2026; бесплатная регистрация до 16 января; финальный дедлайн 31 января 2027.', 'Онлайн', '', '14–18 лет', 'Бесплатно до 16 января, потом £5', 'Эссе до 1 500 слов', 'Программы на £1 000–2 000 + £300–500.', 'globalessayprize.uk', 'подтверждено', 'https://apply.globalessayprize.uk/registration', array['online','essay']::text[], 'res', 'free', '@self_construction1'),
  ('hawc', 'res', 'Harvard International Review Academic Writing Contest (HAWC)', 'HAWC', 'Конкурс академического текста о международных отношениях.', 'Подача до', '2027-01-02'::date, false, false, 'Дедлайн 2 января 2027.', 'Онлайн', '', '7–12 классы', 'Уточнить', 'Международные отношения', 'Уточнить.', 'en.hawc.org.cn', 'уточнить', 'https://en.hawc.org.cn', array['online','essay']::text[], 'res', 'paid', '@pasha_harvard'),
  ('nyt', 'res', 'New York Times Tiny Memoir Contest', 'NYT Tiny Memoir', 'Правдивая история ровно на 100 слов.', 'Подача до', '2026-10-28'::date, false, false, 'Конкурс 16 сентября – 28 октября 2026.', 'Онлайн', '', '13–19 лет', 'Бесплатно', 'Личное эссе', 'Публикация лучших работ в The Learning Network.', 'nytimes.com/learning', 'подтверждено', 'https://www.nytimes.com/2026/09/03/learning/tiny-memoir-contest-for-students-write-a-100-word-personal-narrative.html', array['free','online','essay']::text[], 'res', 'free', '@pasha_harvard, @edu_strategies'),
  ('lumiere', 'res', 'Lumiere Scholars Essay Award', 'Lumiere Essay', 'Исследовательское аргументативное эссе от Lumiere Education.', 'Основной дедлайн', '2026-12-20'::date, false, false, 'Первый дедлайн 25 октября, основной 20 декабря.', 'Онлайн', '', 'Старшеклассники', 'Уточнить', 'Эссе', 'Уточнить.', 'lumiere-education.com', 'уточнить', 'https://www.lumiere-education.com', array['online','essay']::text[], 'res', 'free', '@pasha_harvard, @self_construction1'),
  ('lsesu', 'res', 'LSESU Economics Society Essay Competition', 'LSESU Essay', 'Эссе по экономике на вопросы преподавателей LSE (студенческое общество).', 'Дедлайн (след. цикл)', '2027-09-01'::date, true, true, 'В 2026 дедлайн 1 сентября.', 'Онлайн', '', '9–12 классы', 'Бесплатно', 'Экономика, до 1 500 слов', 'Сертификаты, призы до £100.', 'lsesuesec.org', 'прошлый цикл', 'https://www.lsesuesec.org/essay-en/', array['free','online','essay']::text[], 'res', 'free', '@scholars_compass, @self_construction1'),
  ('neuro', 'res', 'Neuroethics Essay Contest', 'Neuroethics Essay', 'Эссе о нейронауке и этике от International Neuroethics Society.', 'Дедлайн (след. цикл)', '2027-08-21'::date, true, true, 'В 2026 дедлайн 21 августа.', 'Онлайн', '', 'Старшеклассники', 'Бесплатно', 'Нейроэтика, до 1 000 слов', 'До $500 и членство в INS.', 'neuroethicsessaycontest.com', 'прошлый цикл', 'https://neuroethicsessaycontest.com/call-for-neuroethics-essays-2026/', array['free','online','essay']::text[], 'res', 'free', '@scholars_compass'),
  ('fountain', 'res', 'The Fountainhead Essay Contest (Ayn Rand Institute)', 'Fountainhead Essay', 'Эссе по роману «Источник» Айн Рэнд.', 'Дедлайн (след. цикл)', '2027-07-31'::date, true, true, 'В 2026 дедлайн 31 июля.', 'Онлайн', '', '8–12 классы', 'Бесплатно', 'Литература, философия', 'Гран-при $25 000.', 'aynrand.org', 'прошлый цикл', 'https://aynrand.org/students/essay-contests/the-fountainhead', array['free','online','essay']::text[], 'res', 'free', '@scholars_compass'),
  ('earthpartner', 'res', 'Earth Partner Prize', 'Earth Partner Prize', 'Творческий конкурс о климате: фото, фильм, эссе, музыка, приложение.', 'Дедлайн (след. цикл)', '2027-10-07'::date, true, true, 'В 2026 дедлайн 7 октября.', 'Онлайн', '', '14–30 лет', 'Бесплатно', 'Климат, творчество', 'Призы до $10 000.', 'earthpartner.com', 'прошлый цикл', 'https://earthpartner.com/earth-partner-prize/', array['free','online']::text[], 'res', 'free', '@self_construction1'),
  ('xtf', 'res', 'XTF Global Innovation Challenge', 'XTF Challenge', 'Исследовательский или инженерный проект + видео; финалисты в Женеве за счёт организаторов.', 'Дедлайн (след. цикл)', '2027-08-31'::date, true, true, 'В 2026 дедлайн 31 августа. Повтор не подтверждён.', 'Онлайн; финал в Женеве', '', '13–18 лет, до 4 человек', 'Бесплатно', 'ИИ, климат, биотех, робототехника, космос и др.', 'Денежные призы, публикация.', 'xtf.org', 'прошлый цикл', 'https://xtf.org/competition.html', array['free','online','team']::text[], 'res', 'free', '@self_construction1'),
  ('fresh', 'res', 'Fresh International Film Festival', 'Fresh Film Festival', 'Фестиваль коротких фильмов молодых авторов в Лимерике (Ирландия).', 'Подача до', '2026-12-18'::date, false, false, 'Дедлайн 18 декабря 2026; фестиваль в марте – апреле 2027.', 'Онлайн-подача (FilmFreeway)', '', '7–19 лет', 'Бесплатно для иностранцев', 'Кино до 15 минут', 'Награды фестиваля.', 'filmfreeway.com', 'подтверждено', 'https://filmfreeway.com/FreshInternationalFilmFestival', array['free','online']::text[], 'res', 'free', '@self_construction1'),
  ('sigma', 'res', 'SigmaCamp Problem of the Month', 'SigmaCamp PoM', 'Ежемесячные задачи по математике, физике, химии, биологии, CS и лингвистике с развёрнутыми решениями.', 'Задачи месяца до', '2026-10-31'::date, true, false, 'Новые задачи каждый месяц, срок — конец месяца.', 'Онлайн', '', '11–17 лет', 'Бесплатно', 'Естественные науки, математика, CS', 'Сертификаты; преимущество при отборе в летний SigmaCamp.', 'sigmacamp.org/pom', 'подтверждено', 'https://sigmacamp.org/pom', array['free','online','olymp']::text[], 'res', 'free', '@self_construction1'),
  ('hacknext', 'res', 'HACKNEXT', 'HACKNEXT', 'Республиканский хакатон: онлайн-кейс, затем 15 команд в офлайн-финале в Астане.', 'Регистрация (след. цикл)', '2027-10-10'::date, true, true, 'В 2026: регистрация до 10 октября, финал 18 октября в Астане. Повтор не подтверждён.', 'Онлайн + Астана', '', 'Молодые разработчики и дизайнеры', 'Бесплатно', 'Разработка, дизайн', 'Фонд 1,7 млн ₸.', 'Через анонсы в каналах', 'прошлый цикл', 'https://t.me/self_construction1', array['free','team','hack']::text[], 'res', 'free', '@self_construction1'),
  ('auahack', 'res', 'AuaHack (Riviera, Астана)', 'AuaHack', 'Офлайн-хакатон по данным о качестве воздуха с датчиков AuaSense.', 'Хакатон', '2026-10-24'::date, false, false, '24 октября 2026; регистрация закрыта 17 октября.', 'Riviera, Астана', '', '9–12 классы школ Астаны, команды 3–5', '5 000–6 500 ₸', 'Экология, данные, MVP', 'Фонд 300 000 ₸.', 't.me/AuaHack', 'подтверждено', 'https://t.me/AuaHack', array['team','hack']::text[], 'res', 'paid', '@self_construction1'),
  ('spark', 'res', 'SPARK Startup Battle', 'SPARK Startup Battle', 'Питч-баттл школьных стартапов с офлайн-финалом в Астане.', 'Заявка (след. цикл)', '2027-09-15'::date, true, true, 'В 2026: заявка до 15 сентября, финал 20 сентября. Повтор не подтверждён.', 'Онлайн-заявка, финал в Астане', '', '8–11 (12) классы, до 4 человек', '3 000 ₸ с команды', 'Стартапы', 'Призы, гранты на инкубацию и IELTS.', 'Анонсы в каналах', 'прошлый цикл', 'https://t.me/self_construction1', array['team','biz']::text[], 'res', 'paid', '@self_construction1'),
  ('radchem', 'res', 'RadChem Olympiad («Радикальные химики»)', 'RadChem', 'Командная химическая олимпиада: онлайн-отбор, финал в Астане.', 'Регистрация (след. цикл)', '2027-08-06'::date, true, true, 'В 2026: регистрация до 6 августа, отбор 8 августа, финал 15–16 августа. Повтор не подтверждён.', 'Онлайн + Астана', '', 'Окончившие 8–10 классы', 'Бесплатно', 'Химия', 'Фонд 2,4 млн ₸.', 'Анонсы в Instagram организаторов', 'прошлый цикл', 'https://www.instagram.com/p/DbLrojIs9qs/', array['free','team','olymp']::text[], 'res', 'free', '@scholars_compass'),
  ('qazmed', 'res', 'QazMedicine Research Hackathon', 'QazMedicine', 'Исследовательский хакатон по персонализированной медицине на английском.', 'Подача (след. цикл)', '2027-08-10'::date, true, true, 'В 2026: работа до 10 августа, финал 19 августа. Повтор не подтверждён.', 'Онлайн', '', '7–12 классы, до 4 человек', '2 000 ₸ с команды', 'Медицина', 'Фонд 500 000 ₸.', 'instagram.com/qazmedicine24', 'прошлый цикл', 'https://www.instagram.com/qazmedicine24/', array['team','hack']::text[], 'res', 'paid', '@scholars_compass'),
  ('mlh', 'res', 'MLH Global Hack Week', 'MLH Hack Week', 'Регулярные онлайн-недели хакатонов MLH с воркшопами; открыты и для школьников 13–18.', 'Следующая неделя', null, true, false, 'Проходят несколько раз в год; последняя — 11–17 сентября 2026 (тема Data).', 'Онлайн', '', 'От 13 лет', 'Бесплатно', 'Программирование, данные', 'Практика; для портфолио слабее.', 'events.mlh.com', 'уточнить', 'https://events.mlh.com/events/14416-global-hack-week-data', array['free','online','hack']::text[], 'res', 'free', '@scholars_compass'),
  ('cabcc', 'res', 'Central Asia Business Case Competition (CABCC)', 'CABCC', 'Онлайн-кейс-чемпионат для школьников и студентов Центральной Азии.', 'Регистрация (след. цикл)', '2027-07-27'::date, true, true, 'В 2026: регистрация 18–27 июля, итоги 16 августа. Повтор не подтверждён.', 'Онлайн', '', 'Старшеклассники и студенты', 'Бесплатно', 'Бизнес-кейсы', 'Сертификаты.', 't.me/cabcchub', 'прошлый цикл', 'https://t.me/cabcchub', array['free','online','team','biz']::text[], 'res', 'free', '@self_construction1'),
  ('ludo', 'res', '«Идея против зависимости»', 'Идея против зависимости', 'Казахстанский конкурс социальных проектов против игровой зависимости.', 'Подача до', '2026-10-20'::date, false, false, 'Дедлайн 20 октября 2026, проект 2–5 страниц на ludomaniyakonkurs@mail.ru.', 'Онлайн (по почте)', '', 'Старшеклассники, студенты', 'Бесплатно', 'Социальный проект', 'Фонд 500 000 ₸ на 10 проектов.', 'ludomania.kz/news', 'подтверждено', 'https://ludomania.kz/news', array['free']::text[], 'res', 'free', '@self_construction1')
on conflict (id) do update set section = excluded.section, name = excluded.name, short_name = excluded.short_name, description = excluded.description, kind = excluded.kind, due_date = excluded.due_date, approx = excluded.approx, next_cycle = excluded.next_cycle, date_note = excluded.date_note, location = excluded.location, stages = excluded.stages, grades = excluded.grades, price = excluded.price, topics = excluded.topics, gives = excluded.gives, how = excluded.how, status = excluded.status, url = excluded.url, tags = excluded.tags, tier = excluded.tier, money = excluded.money, source = excluded.source, updated_at = now();

-- ════════════════════════════════════════════════════════════
-- migration-pause.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — ученики на паузе
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно. Статус меняет только ментор
-- (защищено триггером из migration-security.sql).

alter table public.students
  add column if not exists status text not null default 'active';

alter table public.students drop constraint if exists students_status_check;
alter table public.students
  add constraint students_status_check check (status in ('active', 'paused'));

alter table public.students
  add column if not exists paused_at timestamptz;

-- ════════════════════════════════════════════════════════════
-- migration-attendance.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — таблица посещаемости и групповые встречи
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно. Нужен уже применённый migration-meetings.sql.
--
-- Групповая встреча хранится как запись в meetings у каждого пришедшего /
-- не пришедшего ученика (format = 'group'); session_key связывает эти записи
-- в одну встречу. Баллы посещаемости учитывают и индивидуальные, и групповые.

alter table public.meetings add column if not exists session_key uuid;

create index if not exists meetings_session_key_idx on public.meetings (session_key);
create index if not exists meetings_date_idx on public.meetings (meeting_date);

-- ════════════════════════════════════════════════════════════
-- migration-schedule.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — график встреч и приглашения
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно. Нужен уже применённый migration-attendance.sql.
--
-- students.ind_parity — неделя индивидуальной встречи (0 / 1, чётность недели),
--   индивидуальные раз в 2 недели. Групповые — каждую субботу у всех.
-- meeting_invites — отметки «приглашение на встречу отправлено» (только ментор).

alter table public.students add column if not exists ind_parity smallint;
alter table public.students drop constraint if exists students_ind_parity_check;
alter table public.students
  add constraint students_ind_parity_check check (ind_parity in (0, 1));

create table if not exists public.meeting_invites (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  week_monday date not null,
  format text not null check (format in ('individual', 'group')),
  invited_at timestamptz not null default now(),
  unique (student_id, week_monday, format)
);

create index if not exists meeting_invites_week_idx on public.meeting_invites (week_monday);

alter table public.meeting_invites enable row level security;

drop policy if exists "meeting_invites_admin_only" on public.meeting_invites;
create policy "meeting_invites_admin_only"
on public.meeting_invites for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.meeting_invites to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-avatars.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — фото учеников и логотипы конкурсов
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно.
--
-- 1) Хранилище avatars (публичное чтение; загружать — ментор или сам ученик
--    в свою папку <student_id>/…)
-- 2) Ученик может менять своё фото (avatar_url)
-- 3) opportunities.logo_url — свой логотип конкурса (по желанию)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_user_student_id()::text)
);

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_user_student_id()::text)
);

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_user_student_id()::text)
);

-- Ученик может менять: свои разделы + фото
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

alter table public.opportunities add column if not exists logo_url text;

-- ════════════════════════════════════════════════════════════
-- migration-student-edit.sql
-- ════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════
-- migration-activity.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — история действий
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно.
--
-- activity_log пишется автоматически триггерами базы: входы, изменения
-- карточек, встреч, дедлайнов, оценок, ролей, открытия ссылки родителями.
-- Читать может только ментор (админ); писать напрямую не может никто.

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_role text not null default 'system',
  actor_name text not null default '',
  student_id uuid,
  action text not null check (action in ('login', 'insert', 'update', 'delete', 'parent_view')),
  entity text not null,
  fields text[] not null default '{}',
  changes jsonb not null default '{}'::jsonb
);

create index if not exists activity_log_at_idx on public.activity_log (at desc);
create index if not exists activity_log_student_idx on public.activity_log (student_id, at desc);

alter table public.activity_log enable row level security;

drop policy if exists "activity_admin_read" on public.activity_log;
create policy "activity_admin_read"
on public.activity_log for select
to authenticated
using (public.is_admin());

revoke insert, update, delete on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

-- Кто сейчас действует
create or replace function public.activity_actor(out p_id uuid, out p_role text, out p_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  p_id := auth.uid();
  if p_id is null then
    p_role := 'system';
    p_name := '';
    return;
  end if;
  select coalesce(role, 'student'), coalesce(full_name, '') into p_role, p_name
  from public.profiles where id = p_id;
  p_role := coalesce(p_role, 'student');
  p_name := coalesce(p_name, '');
end;
$$;

-- Короткое значение для истории (длинный текст обрезаем)
create or replace function public.activity_short(v jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when v is null then 'null'::jsonb
    when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 160
      then to_jsonb(left(v #>> '{}', 160) || '…')
    when jsonb_typeof(v) in ('array', 'object') then to_jsonb('…'::text)
    else v
  end;
$$;

-- Общий триггер изменений
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_row jsonb := case when tg_op = 'DELETE' then v_old else v_new end;
  v_ignore text[] := array['updated_at', 'created_at', 'attendance_score', 'assignments_score', 'id'];
  v_fields text[] := '{}';
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_student uuid;
  a record;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key = any(v_ignore) then continue; end if;
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_fields := v_fields || v_key;
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_array(public.activity_short(v_old -> v_key), public.activity_short(v_new -> v_key))
        );
      end if;
    end loop;
    -- Только служебные поля (пересчёт баллов и т.п.) — не пишем
    if array_length(v_fields, 1) is null then
      return null;
    end if;
  end if;

  if tg_table_name = 'students' then
    v_student := (v_row ->> 'id')::uuid;
  elsif tg_table_name = 'profiles' then
    v_student := nullif(v_row ->> 'student_id', '')::uuid;
  elsif tg_table_name = 'meeting_mentor_notes' then
    select m.student_id into v_student from public.meetings m where m.id = (v_row ->> 'meeting_id')::uuid;
  else
    v_student := nullif(v_row ->> 'student_id', '')::uuid;
  end if;

  if tg_op = 'INSERT' then
    v_changes := jsonb_strip_nulls(jsonb_build_object(
      'meeting_date', v_new -> 'meeting_date',
      'format', v_new -> 'format',
      'attendance', v_new -> 'attendance',
      'title', public.activity_short(v_new -> 'title'),
      'due_date', v_new -> 'due_date',
      'gpa', v_new -> 'gpa',
      'term_number', v_new -> 'term_number',
      'academic_year', v_new -> 'academic_year'
    ));
  elsif tg_op = 'DELETE' then
    v_changes := jsonb_strip_nulls(jsonb_build_object(
      'meeting_date', v_old -> 'meeting_date',
      'title', public.activity_short(v_old -> 'title'),
      'due_date', v_old -> 'due_date',
      'first_name', v_old -> 'first_name',
      'last_name', v_old -> 'last_name'
    ));
  end if;

  select * into a from public.activity_actor();
  insert into public.activity_log (actor_id, actor_role, actor_name, student_id, action, entity, fields, changes)
  values (a.p_id, a.p_role, a.p_name, v_student, lower(tg_op), tg_table_name, v_fields, v_changes);

  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['students', 'profiles', 'meetings', 'meeting_mentor_notes', 'student_deadlines', 'term_grades']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_activity', t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()',
        t || '_activity', t
      );
    end if;
  end loop;
end;
$$;

-- Входы на сайт
create or replace function public.log_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_student uuid;
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    select role, full_name, student_id into v_role, v_name, v_student from public.profiles where id = new.id;
    insert into public.activity_log (actor_id, actor_role, actor_name, student_id, action, entity)
    values (new.id, coalesce(v_role, 'student'), coalesce(v_name, new.email, ''), v_student, 'login', 'auth');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_sign_in on auth.users;
create trigger on_auth_user_sign_in
after update of last_sign_in_at on auth.users
for each row execute function public.log_sign_in();

-- Родитель открыл ссылку (не чаще раза в 30 минут на ученика)
create or replace function public.log_parent_visit(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  select id into v_student from public.students where parent_access_token = p_token;
  if v_student is null then return; end if;
  if exists (
    select 1 from public.activity_log
    where student_id = v_student and action = 'parent_view' and at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  insert into public.activity_log (actor_role, actor_name, student_id, action, entity)
  values ('parent', 'Родитель', v_student, 'parent_view', 'parent_link');
end;
$$;

grant execute on function public.log_parent_visit(text) to anon, authenticated;

-- Хранить историю 1 год
create or replace function public.activity_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.activity_log where at < now() - interval '365 days';
$$;

-- ════════════════════════════════════════════════════════════
-- migration-workflow.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — эссе (100 тем) и шаблоны встреч
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно.

-- 1) Темы эссе -------------------------------------------------------------
create table if not exists public.essay_topics (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique,
  title text not null,
  prompt text not null default '',
  created_at timestamptz not null default now()
);

alter table public.essay_topics enable row level security;

drop policy if exists "essay_topics_read" on public.essay_topics;
create policy "essay_topics_read" on public.essay_topics for select to authenticated using (true);

drop policy if exists "essay_topics_admin" on public.essay_topics;
create policy "essay_topics_admin" on public.essay_topics for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.essay_topics to authenticated;

-- 2) Работы учеников (каждая версия — отдельная строка) --------------------
create table if not exists public.essay_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  topic_id uuid not null references public.essay_topics (id) on delete cascade,
  version integer not null default 1,
  body text not null default '',
  word_count integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'accepted', 'revision')),
  submitted_at timestamptz,
  -- Проверка ментора: 4 критерия по 10 баллов
  score_structure integer check (score_structure between 1 and 10),
  score_content integer check (score_content between 1 and 10),
  score_language integer check (score_language between 1 and 10),
  score_topic integer check (score_topic between 1 and 10),
  mentor_comment text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, topic_id, version)
);

create index if not exists essay_submissions_student_idx on public.essay_submissions (student_id);
create index if not exists essay_submissions_status_idx on public.essay_submissions (status);

drop trigger if exists essay_submissions_set_updated_at on public.essay_submissions;
create trigger essay_submissions_set_updated_at
before update on public.essay_submissions
for each row execute function public.set_updated_at();

alter table public.essay_submissions enable row level security;

drop policy if exists "essays_select" on public.essay_submissions;
create policy "essays_select" on public.essay_submissions for select to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "essays_insert" on public.essay_submissions;
create policy "essays_insert" on public.essay_submissions for insert to authenticated
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "essays_update" on public.essay_submissions;
create policy "essays_update" on public.essay_submissions for update to authenticated
using (public.is_admin() or student_id = public.current_user_student_id())
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "essays_delete" on public.essay_submissions;
create policy "essays_delete" on public.essay_submissions for delete to authenticated
using (public.is_admin() or (student_id = public.current_user_student_id() and status = 'draft'));

grant select, insert, update, delete on public.essay_submissions to authenticated;

-- Ученик: пишет черновик и сдаёт; оценки и статусы проверки ставит только ментор
create or replace function public.enforce_essay_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    if new.status in ('accepted', 'revision') and new.reviewed_at is null then
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
  else
    if old.status <> 'draft' then
      raise exception 'Работа уже сдана — изменить можно только новую версию' using errcode = '42501';
    end if;
    if new.status not in ('draft', 'submitted')
       or new.student_id is distinct from old.student_id
       or new.topic_id is distinct from old.topic_id
       or new.version is distinct from old.version then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
  end if;

  if new.score_structure is not null or new.score_content is not null
     or new.score_language is not null or new.score_topic is not null
     or coalesce(new.mentor_comment, '') <> '' or new.reviewed_at is not null then
    raise exception 'Оценку ставит только ментор' using errcode = '42501';
  end if;

  if new.status = 'submitted' and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists essay_submissions_rights on public.essay_submissions;
create trigger essay_submissions_rights
before insert or update on public.essay_submissions
for each row execute function public.enforce_essay_rights();

-- Место ученика в рейтинге (без чужих имён)
create or replace function public.my_essay_rank()
returns table (accepted integer, place integer, total_students integer)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select s.id as student_id,
           count(distinct e.topic_id) filter (where e.status = 'accepted') as accepted
    from public.students s
    left join public.essay_submissions e on e.student_id = s.id
    where coalesce(s.status, 'active') = 'active' or s.id = public.current_user_student_id()
    group by s.id
  ),
  ranked as (
    select student_id, accepted, rank() over (order by accepted desc) as place from counts
  )
  select r.accepted::int, r.place::int, (select count(*) from counts)::int
  from ranked r
  where r.student_id = public.current_user_student_id();
$$;

grant execute on function public.my_essay_rank() to authenticated;

-- Для родителя по ссылке: статусы и оценки эссе (без текста работ и комментариев)
create or replace function public.get_essays_by_parent_token(p_token text)
returns setof public.essay_submissions
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.student_id, e.topic_id, e.version, ''::text, e.word_count, e.status, e.submitted_at,
         e.score_structure, e.score_content, e.score_language, e.score_topic, ''::text,
         e.reviewed_at, e.created_at, e.updated_at
  from public.essay_submissions e
  join public.students s on s.id = e.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token;
$$;

grant execute on function public.get_essays_by_parent_token(text) to anon, authenticated;

-- Журнал действий (если подключена история)
do $$
begin
  if to_regprocedure('public.log_change()') is not null then
    drop trigger if exists essay_submissions_activity on public.essay_submissions;
    create trigger essay_submissions_activity
    after insert or update or delete on public.essay_submissions
    for each row execute function public.log_change();
  end if;
end;
$$;

-- 3) Шаблоны встреч --------------------------------------------------------
create table if not exists public.meeting_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('plan', 'summary', 'homework')),
  title text not null,
  body text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.meeting_templates enable row level security;

drop policy if exists "meeting_templates_admin" on public.meeting_templates;
create policy "meeting_templates_admin" on public.meeting_templates for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.meeting_templates to authenticated;

insert into public.meeting_templates (kind, title, body, sort)
select * from (values
  ('plan', 'Разбор эссе', E'— Как шла работа над эссе, что было сложно?\n— Разобрать 2–3 сильных и 2 слабых места\n— Договориться о правках и сроке новой версии', 1),
  ('plan', 'Выбор олимпиады / конкурса', E'— Какие предметы и темы интересны?\n— Пройтись по ленте возможностей, выбрать 1–2\n— Поставить дедлайн подачи и первый шаг', 2),
  ('plan', 'Цели на месяц', E'— Что получилось за прошлый месяц?\n— 3 цели на этот месяц (учёба / проект / навык)\n— Что может помешать и как это обойти', 3),
  ('plan', 'Учёба и оценки', E'— Как оценки в этой четверти? Где проседает?\n— План на проблемный предмет\n— Кто может помочь (учитель, репетитор, друг)', 4),
  ('plan', 'Проект', E'— Что сделано по проекту с прошлой встречи?\n— Следующий шаг и измеримый результат\n— Нужна ли помощь / контакт', 5),
  ('summary', 'Хорошая встреча', 'Ученик пришёл подготовленным, обсудили … Договорились о …', 1),
  ('summary', 'Домашка не сделана', 'Домашнее задание не выполнено. Причина: … Договорились: …', 2),
  ('homework', 'Эссе 250–300 слов', 'Написать эссе на тему из списка (250–300 слов) и сдать на сайте в разделе «Эссе»', 1),
  ('homework', 'Выбрать олимпиаду', 'Выбрать в ленте возможностей 1 олимпиаду или конкурс и добавить в дедлайны', 2),
  ('homework', 'Прочитать главу', 'Прочитать … и записать 3 главные мысли', 3)
) as v(kind, title, body, sort)
where not exists (select 1 from public.meeting_templates);
