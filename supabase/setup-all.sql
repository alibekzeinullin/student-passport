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
    'avatar_url', 'updated_at'
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
    'avatar_url', 'updated_at'
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
  ('aiolymp', 'cs', 'Республиканская олимпиада по искусственному интеллекту', 'Олимпиада по ИИ', 'Национальная олимпиада по ИИ: онлайн-отбор по программированию, математике и машинному обучению, затем очный финал. Ведёт к сборной на IOAI.', 'Онлайн-отбор (след. цикл)', '2027-02-22'::date, true, true, 'AI Olymp для 9–12 классов. В 2026 онлайн-отбор прошёл 22 февраля, затем финал и сборы; победители вошли в сборную на IOAI 2026. Ожидаем отбор в феврале 2027 (IOAI 2027 — 4–10 июля в Сингапуре).', 'Онлайн-отбор, очный финал', 'Онлайн-отбор → финал → сборы → сборная IOAI', 'Школьники', 'Бесплатно', 'Программирование, математика, классическое машинное обучение', 'Путь в сборную Казахстана на IOAI; в 2026 году сборная взяла 8 медалей.', 'Следить за cpfed.kz и новостями Минцифры.', 'уточнить', 'https://the-tech.kz/v-kazahstane-projdet-pervaya-respublikanskaya-olimpiada-po-iskusstvennomu-intellektu/', array['free']::text[], 'strong', 'free', ''),
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
  ('ludo', 'res', '«Идея против зависимости»', 'Идея против зависимости', 'Казахстанский конкурс социальных проектов против игровой зависимости.', 'Подача до', '2026-10-20'::date, false, false, 'Дедлайн 20 октября 2026, проект 2–5 страниц на ludomaniyakonkurs@mail.ru.', 'Онлайн (по почте)', '', 'Старшеклассники, студенты', 'Бесплатно', 'Социальный проект', 'Фонд 500 000 ₸ на 10 проектов.', 'ludomania.kz/news', 'подтверждено', 'https://ludomania.kz/news', array['free']::text[], 'res', 'free', '@self_construction1'),
  ('eo', 'kz', 'Economics Olympiad (EO) — оператор Нархоз', 'Economics Olympiad (Нархоз)', 'Олимпиада по экономике с отбором в сборную Казахстана: школьный, региональный и национальный туры, затем международный раунд в Олимпии (Греция). Экономические олимпиады пока менее конкурентны, чем олимпиады по математике или физике.', 'Регистрация школы до', '2027-02-07'::date, false, false, 'Школа регистрируется до 7 февраля 2027. Школьный тур 18 февраля (онлайн, в школе), региональный 3 апреля (Астана, Алматы или Актобе), национальный 24 апреля (Нархоз, Алматы). Сборы 21–27 июня, международный раунд 2–6 августа 2027 в Олимпии. Регламент может меняться до конца 2026.', 'Школьный тур онлайн в школе; региональный и национальный очно', 'Школьный (топ-10% по каждому языку) → региональный (от 50%) → национальный (тест + устный экзамен на английском для топ-10) → международный (топ-5 страны)', 'Школьники; в финале были 10–12 классы. По посту участвовать могут даже 7–8 классы', 'Не указано', 'Экономика; задания на казахском, русском или английском', 'Золотые медалисты национального тура получают гранты Нархоза; топ-5 — сборная Казахстана и международные медали (10 медалей за 2024–2026).', 'Самостоятельно нельзя: школа назначает координатора приказом и регистрируется через форму на econolympiad.kz. Координатор раздаёт ученикам код доступа.', 'подтверждено', 'https://econolympiad.kz/', array['school','grant']::text[], 'strong', 'free', 'присланный пост'),
  ('fingram', 'kz', 'Олимпиада по финансовой грамотности и безопасности (smart.daryn.kz)', 'Финансовая грамотность', 'Олимпиада по финансовой грамотности, регистрация через платформу Дарына. Подробные условия на официальных страницах проверить не удалось.', 'Тур', '2026-11-03'::date, false, false, 'По посту: 3 ноября 2026. Классы, этапы и призы не подтверждены.', 'Уточнить', 'Уточнить', 'По посту доступна и для 7–8 классов', 'Уточнить', 'Финансовая грамотность, финансовая безопасность', 'Уточнить.', 'Регистрация на smart.daryn.kz.', 'уточнить', 'https://smart.daryn.kz/', array['free']::text[], 'base', 'free', 'присланный пост'),
  ('kimep', 'cs', 'KIMEP AI Challenge', 'KIMEP AI Challenge', 'Школьники представляют свой проект по искусственному интеллекту постером перед жюри на KIMEP AI Conference. Главный приз — грант на обучение в KIMEP.', 'Постер до', '2026-11-22'::date, false, false, 'Постер для печати организаторами — до 22 ноября 2026 (после 25 ноября печатать постер A0 самим). Конференция и защита 27–28 ноября, итоги 28 ноября. Срок регистрации на странице не указан.', 'KIMEP, Алматы: команды из Алматы очно, из других регионов онлайн', 'Регистрация → постер → защита перед жюри', '9–12 классы. Гранты получают только выпускники 2027 года; 9–10 классы получают подарки и бесплатные воркшопы', 'Бесплатно', 'Искусственный интеллект, проект в формате постера', 'Гранты на год обучения в KIMEP: 100% / 50% / 25% каждому участнику команды (до 3 человек). Сертификаты всем.', 'Регистрация через Google-форму на странице конференции, правила в PDF на казахском.', 'подтверждено', 'https://www.kimep.kz/school-of-computer-science-and-artificial-intelligence/kz/2026/10/07/kimep-ai-conference-2026/', array['free','team','grant']::text[], 'base', 'free', 'присланный пост'),
  ('veritas', 'hack', 'Veritas AI International High School Hackathon', 'Veritas AI Hackathon', 'Онлайн-хакатон на 48 часов: рабочий ИИ-проект по реальной проблеме. Опыт программирования не обязателен, есть воркшопы и стартовые ноутбуки.', 'Регистрация до', '2026-11-13'::date, false, false, 'Регистрация до 13 ноября 2026, 23:59 ET. Хакатон 14–15 ноября (подача до 15 ноября, 23:59 ET). Финалисты 18 ноября, финал в прямом эфире 21 ноября.', 'Онлайн', 'Проект + описание + демо 2 мин → слепая оценка → живой финал', 'Старшеклассники любой страны; индивидуально или до 3 человек', 'Бесплатно', 'ИИ для медицины, экологии, финансов и других сфер', 'Фонд от $75 000 в образовательных призах: 1 место — стажировка в Arecibo AI, 2–3 места — стипендии на программы Veritas AI. Сертификат за завершённый проект.', 'Регистрация на highschoolhackathon.org/register.', 'подтверждено', 'https://highschoolhackathon.org/', array['free','online','team']::text[], 'base', 'free', 'присланный пост'),
  ('gte', 'math', 'Global Talent Examination (Constructor University, Бремен)', 'Global Talent Examination', 'Бесплатный онлайн-экзамен по математике на 4 часа с прокторингом. Хороший результат открывает стипендию на летний лагерь Constructor University в Бремене (12 дней, студенты из 40+ стран) и стипендии на бакалавриат.', 'Экзамен', '2026-10-29'::date, false, false, '25–28 октября: пробный раунд и проверка прокторинга (необязательно). 29 октября: регистрация до 19:00 по Астане, экзамен в 20:00. До 31 декабря 2026: ранняя подача заявки в лагерь. Лагерь 9–20 июля 2027 в Бремене.', 'Экзамен онлайн; лагерь в кампусе в Бремене (Германия)', 'Экзамен → письмо с результатом → заявка в летний лагерь или в университет → стипендия', 'Экзамен открыт всем. Для стипендии на лагерь: 16–18 лет на момент лагеря, школьник, английский от B2', 'Экзамен и заявка бесплатно. Лагерь €5 100 (€4 600 при подаче до 31 декабря): обучение, проживание, питание, экскурсии, транспорт. Не входят перелёт, шенгенская виза, страховка, карманные деньги', 'Математика (экзамен). В лагере 2 из 10 университетских курсов: ИИ и робототехника, программирование, математика, физика, химия, биология, нейронауки, экономика, предпринимательство; на английском', 'Стипендия на летний лагерь по итогам экзамена (размер на странице не указан). Для поступающих в 2027: стипендии вплоть до полного покрытия обучения в Constructor University после отбора и интервью.', 'Регистрация на constructor.university/lp/global-talent-examination до 29 октября, 19:00 по Астане.', 'подтверждено', 'https://constructor.university/lp/global-talent-examination', array['free','online','grant']::text[], 'base', 'free', 'присланный пост'),
  ('elumiti', 'kz', 'El Umiti Premiasy', 'El Umiti Premiasy', 'Республиканская премия фонда «El Umiti» для активных подростков: полгода развития по одному из 7 направлений, свой проект с ментором и защита в летнем лагере. Победитель каждого направления получает 1 000 000 ₸.', 'Заявка до', '2026-11-15'::date, false, false, 'Заявки до 15 ноября 2026, итоги отбора до 1 декабря. Дальше около полугода: саморазвитие → проектная работа → финал с защитой проекта в летнем лагере.', 'Приложение ÜMITTEN; финал в летнем образовательном лагере', 'Заявка → отбор → саморазвитие → проект с ментором → защита в лагере', '15–17 лет (на баннере сайта 14–17, сверить с положением); школьники Казахстана', 'Бесплатно', '7 направлений: культура чтения, спорт и ЗОЖ, волонтёрство, экология и туризм, цифровые навыки, Meta-Skills, национальное наследие', '7 победителей по 1 000 000 ₸ (фонд 7 млн ₸), менторы, летний лагерь, бесплатный курс по проектированию в предпринимательстве.', 'Скачать приложение ÜMITTEN (umitten.kz), найти раздел El Umiti Premiasy, заполнить анкету и приложить материалы о достижениях. Вопросы: help.premia@el-umiti.kz.', 'подтверждено', 'https://premia.elumiti.kz/', array['free','online','grant']::text[], 'base', 'free', 'присланный пост'),
  ('wso', 'proj', 'World Space Olympiad (WSO)', 'World Space Olympiad', 'Чемпионат по прикладной аэрокосмической инженерии с финалом на Alem TechFest в Астане: свои ракеты, спутники, планетоходы и инженерные проекты.', 'Регистрация и проект до', '2027-01-15'::date, false, false, 'До 15 января 2027: регистрация и сдача проектов на онлайн-этап. 18–21 февраля 2027: чемпионат на Alem TechFest, Астана.', 'Онлайн-этап, финал очно в Астане', 'Регистрация и проект → онлайн-этап → чемпионат', 'Школьники и студенты. В 2024 году: CanSat 7–12 классы командами 2–3; Inventors 5–8 и 9–12 классы, до 3 человек. Условия 2027 сверить с положением', 'Бесплатно', 'CanSat (ракета со спутником), CubeSat 1U (испытания на вибрацию, перегрузки, мороз), Rovers (планетоход на снежном полигоне), Inventors (инженерные проекты для космоса). Новая награда Impact Award за популяризацию и открытую документацию проекта', 'Призы и стажировки в аэрокосмических компаниях Казахстана; в прошлые годы также гранты ведущих вузов. Редкая для школьника инженерная строчка с реальным «железом».', 'Положение на wso.space/ru, вопросы в Telegram-сообществе WSO (ссылка в Instagram wso.space).', 'уточнить', 'https://www.wso.space/ru', array['free','team']::text[], 'strong', 'free', 'присланный пост'),
  ('lpydc', 'proj', 'Learning Planet Youth Design Challenge', 'Learning Planet Challenge', 'Международный конкурс социальных и экологических проектов от Learning Planet Institute (Франция). Лучше подавать уже начатый проект или прототип.', 'Заявка до', '2027-01-07'::date, false, false, 'Заявки до 7 января 2027, 23:59 CET. Февраль 2027: жюри отбирает 60 проектов. Март – июнь: онлайн-обучение и менторство. Июль 2027: выбирают 12 амбассадоров.', 'Онлайн', 'Заявка → 60 проектов в шорт-листе → обучение и менторство → 12 победителей', '15–26 лет, любая страна; индивидуально или командой', 'Бесплатно', 'Мир и демократия, ментальное здоровье, экология и климат; заявка на английском', '60 проектам: менторство, тренинги, сертификация UNU FLY, публикация на платформе LPI. 12 лучшим по $1 000 на проект.', 'Подача на learningplanetinstitute.org.', 'подтверждено', 'https://www.learningplanetinstitute.org/en/programs/lp-ydc/', array['free','online','team']::text[], 'base', 'free', 'присланный пост'),
  ('dubaiai', 'cs', 'Create AI Agents Championship (Дубай)', 'Create AI Agents', 'Международный конкурс ИИ-агентов от Dubai Chamber. Нужен работающий прототип агента, презентация и демо-видео; есть отдельная молодёжная номинация.', 'Регистрация и подача', '2027-01-15'::date, true, false, 'Регистрация открыта с 7 октября 2026 и закрывается в январе 2027 (точный день не указан). Подача ноябрь – январь. Финал в первую неделю мая 2027.', 'Онлайн; финал в Дубае', 'Регистрация → прототип + питч + демо → финал вживую', 'Без минимального возраста; команды до 6 человек (каждый регистрируется сам). Best Youth AI Agent — для лидера команды до 21 года', 'Бесплатно', 'ИИ-агенты для общества, личного использования и бизнеса; всё на английском', '4 номинации по $150 000 (около 550 000 AED) на развитие проекта, плюс титул AI Agent of the Year с доп. финансированием. Финалисты показывают работающего агента вживую.', 'Регистрация на dubaichamberdigital.com.', 'подтверждено', 'https://www.dubaichamberdigital.com/en/create-ai-agents', array['free','online','team']::text[], 'base', 'free', 'присланный пост'),
  ('yfl', 'res', 'Young Founders Lab', 'Young Founders Lab', 'Не конкурс, а платный онлайн-инкубатор стартапов для школьников с ментором. Основан выпускниками Harvard и Stanford.', 'Зимний набор до', '2026-11-21'::date, false, false, 'По посту дедлайн зимнего набора 21 ноября 2026; на сайте дат нет.', 'Онлайн', '', '9–12 классы', 'Individual Program $4 390; есть финансовая помощь при доходе семьи ниже ~$80 000 (не гарантирована)', 'Стартап с нуля: идея, рынок, продукт, питч', 'Собственный проект для портфолио; ценность зависит от того, что вы реально построите.', 'Онлайн-заявка, 3 эссе до 300 слов, интервью.', 'уточнить', 'https://www.youngfounderslab.org/', array['online','biz']::text[], 'res', 'paid', 'присланный пост'),
  ('technovation', 'proj', 'Technovation Girls', 'Technovation Girls', 'Глобальный конкурс для девушек: команда делает мобильное или веб-приложение (или другой цифровой продукт) под проблему своего сообщества и бизнес-план к нему. В сезоне 2027 пилотно запускают и смешанный трек.', 'Регистрация до', '2027-03-11'::date, false, false, 'Сезон стартовал 12 октября 2026. Регистрация учениц и менторов до 11 марта 2027 (23:59 UTC), сдача проекта до 5 мая 2027. Судейство апрель – июнь, финалисты едут на World Summit.', 'Онлайн; финал на Technovation World Summit', 'Регистрация → работа над проектом с ментором → подача → судейство → финал', 'Девушки 8–18 лет: Junior 13–15, Senior 16–18 (по возрасту старшей в команде на 1 августа 2027)', 'Бесплатно', 'Приложение или цифровой продукт, бизнес-план, питч', 'Известный международный конкурс в IT для девушек; финал и региональные награды хорошо смотрятся в заявках.', 'Собрать команду и найти ментора, регистрация на technovationchallenge.org.', 'подтверждено', 'https://technovationchallenge.org/program-timeline', array['free','online','team']::text[], 'strong', 'free', 'каталог'),
  ('rise', 'proj', 'Rise (Schmidt Futures × Rhodes Trust)', 'Rise', 'Глобальная программа для 15–17-летних: в заявке видео, проект и интервью. Победители получают поддержку на всю жизнь — стипендии на учёбу по нужде, менторство, летний саммит.', 'Заявка до', '2027-01-17'::date, true, false, 'Дедлайн обычно около 17 января (в прошлые циклы 17 января). Точная дата цикла 2027 на официальном сайте не проверена.', 'Онлайн (приложение Rise)', 'Заявка → проект → 500 финалистов → интервью → до 100 Global Winners', '15–17 лет, любая страна, нужен английский и согласие родителя', 'Бесплатно', 'Собственный проект на пользу людям; любые сферы', 'До 100 Global Winners в год: стипендии по нужде, полностью оплачиваемый саммит, менторство, гранты. Одна из самых сильных строчек для заявки.', 'Профиль на risefortheworld.org, заполнить заявку до дедлайна.', 'уточнить', 'https://risefortheworld.org/faq', array['free','online','grant']::text[], 'top', 'free', 'каталог'),
  ('hult', 'proj', 'Hult Future Leaders Challenge', 'Hult Future Leaders', '11-недельный командный кейс-чемпионат Hult International Business School с реальным брифом от компании (в 2026 — LEGO).', 'Старт (след. цикл)', '2027-09-15'::date, true, true, 'Конкурс запускается каждый сентябрь; цикл 2026 уже идёт. Ожидаем старт нового цикла в сентябре 2027.', 'Онлайн; живые полуфиналы и глобальный финал', 'Онлайн-обучение → решение кейса → региональные презентации → финал', '15–18 лет, команды 4–6 + учитель-наставник из школы', 'Бесплатно', 'Бизнес-кейс, маркетинг, стратегия', 'Стипендии на бакалавриат Hult: $15 000 / $10 000 / $5 000 в год участникам призовых команд.', 'Регистрирует учитель на hult.edu/hflc.', 'прошлый цикл', 'https://www.hult.edu/hflc/faq', array['free','online','team','school','biz']::text[], 'base', 'free', 'каталог'),
  ('horizonessay', 'hum', 'Horizon Academic Essay Prize', 'Horizon Essay Prize', 'Бесплатный международный конкурс академических эссе для старшеклассников; тема цикла 2027 — «Back to the Future».', 'Бесплатная регистрация до', '2027-01-17'::date, false, false, 'Бесплатная регистрация до 17 января 2027, поздняя регистрация и подача до 24 января 2027. Шорт-лист 8 февраля, онлайн-церемония 14 февраля 2027.', 'Онлайн', 'Регистрация → эссе → шорт-лист → церемония', 'Ученики старшей школы на 31 мая 2027, любая страна', 'Бесплатно', 'Эссе на английском по одному из промптов (политика, общество, будущее)', 'Шорт-лист и призы — хорошая строчка в разделе эссе.', 'Регистрация на horizoninspires.com/essay-prize.', 'подтверждено', 'https://horizoninspires.com/essay-prize/1', array['free','online','essay']::text[], 'base', 'free', 'каталог'),
  ('nytlearning', 'hum', 'New York Times Learning Network: конкурсы для школьников', 'NYT Student Contests', 'Серия конкурсов New York Times для 13–19 лет со всего мира. STEM Writing Contest в этом году заменён на видео-конкурс The STEM Interview.', 'Ближайший дедлайн', '2026-12-09'::date, false, false, 'Визуальное искусство «What It’s Like to Grow Up in 2026»: 28 окт – 9 дек 2026. The STEM Interview (видео до 2 мин с интервью эксперта): 6 янв – 17 фев 2027. Open Letters (мнение): 17 фев – 31 мар. Audio Stories (подкаст): 31 мар – 12 мая 2027.', 'Онлайн', 'Одна подача на каждый конкурс', '13–19 лет, ученики средней и старшей школы, любая страна', 'Бесплатно', 'Визуальное искусство, научная журналистика (видео), эссе-мнение, подкаст; всё на английском', 'Публикация лучших работ на сайте NYT — узнаваемая строчка.', 'Подача через страницы конкурсов на nytimes.com/learning.', 'подтверждено', 'https://www.aralia.com/helpful-information/the-new-york-times-student-contest-calendar-2026-2027/', array['free','online','essay']::text[], 'base', 'free', 'каталог'),
  ('swb', 'hum', 'Science Without Borders® Challenge (International Student Art Contest)', 'Science Without Borders', 'Международный конкурс рисунка об океане от Khaled bin Sultan Living Oceans Foundation. Тема 2027 — «Navigate with Care».', 'Подача до', '2027-03-01'::date, false, false, 'Работы до 1 марта 2027, 23:59 по восточному времени США. Новое: нужно приложить две фотографии процесса и фото готовой работы.', 'Онлайн', 'Одна подача', '11–19 лет, школьники; категории 11–14 и 15–19', 'Бесплатно', 'Искусство + наука об океане и его охране', 'Стипендии $500 / $350 / $200 в каждой возрастной группе, приз зрительских симпатий $50.', 'Онлайн-форма на lof.org/SWBChallenge, нужны контакты учителя и родителя.', 'подтверждено', 'https://www.livingoceansfoundation.org/science-without-borders-challenge/', array['free','online']::text[], 'base', 'free', 'каталог'),
  ('hmun', 'mun', 'Harvard Model United Nations (HMUN), Бостон', 'HMUN Boston', 'Старейшая и самая известная модель ООН для школьников, четыре дня в Бостоне; проводят студенты Гарварда.', 'Регистрация до', '2026-12-01'::date, true, false, 'HMUN 2027: 28–31 января 2027, Бостон. Дедлайн регистрации 1 декабря 2026 — по вторичному источнику, сверьте на harvardmun.org.', 'Бостон, США', 'Регистрация делегации → позиционные документы → конференция', 'Старшеклассники; регистрируется обычно школьная делегация', 'Взносы за делегацию и делегата + перелёт и проживание', 'Модель ООН, международные отношения', 'Награды HMUN узнаваемы в заявках в американские вузы.', 'Через MUN-клуб или учителя: регистрация делегации на сайте HMUN.', 'уточнить', 'https://www.heysuccess.com/opportunity/HMUN-2027-Harvard-Model-United-Nations-29074', array['school','team']::text[], 'strong', 'paid', 'каталог'),
  ('hmundubai', 'mun', 'HMUN Dubai', 'HMUN Dubai', 'Региональная конференция Harvard Model United Nations для школьников в Дубае — ближе и дешевле, чем Бостон.', 'Конференция', '2027-01-07'::date, false, false, '7–10 января 2027, Дубай. Сроки регистрации — на странице конференции.', 'Дубай, ОАЭ', 'Регистрация → конференция', 'Школьники', 'Взнос + поездка', 'Модель ООН', 'Бренд Harvard MUN, награды комитетов.', 'Регистрация через mymun.com или сайт HMUN Dubai.', 'уточнить', 'https://mymun.com/conferences/hmun-dubai-2027', array['team']::text[], 'base', 'paid', 'каталог'),
  ('mismun', 'mun', 'Miras MUN (MIS MUN), Алматы', 'Miras MUN', 'Одна из старейших MUN-конференций Казахстана при Miras International School; сертификаты, согласованные с ООН в Казахстане.', 'Регистрация (след. цикл)', '2027-01-21'::date, true, true, 'В 2026: регистрация 21 ноября 2025 – 21 января 2026, конференция 19–20 февраля. Ожидаем те же сроки: регистрация до ≈21 января, конференция в феврале 2027.', 'Miras International School, Алматы', 'Регистрация → конференция (2 дня)', 'Школьники', '30 000 ₸ (в 2026: пакет делегата, трансфер, питание)', 'Модель ООН на английском, русском и казахском', 'Сертификат и опыт известной казахстанской MUN.', 'Регистрация на mismun.miras.kz.', 'прошлый цикл', 'https://mismun.miras.kz/', array['team']::text[], 'base', 'paid', 'каталог'),
  ('kzmun', 'mun', 'MUN-конференции в Казахстане (AGISMUN, MUNORDA, AltynMUN, Harmony MUN и др.)', 'MUN в Казахстане', 'Школьные и вузовские модели ООН почти каждые выходные. Точных дат по AGISMUN, MUNORDA, AltynMUN и Harmony MUN я не нашёл — они публикуются в Instagram/Telegram организаторов и на mymun.com.', 'Даты', null, true, false, 'Ориентиры по прошлому сезону: MUNIX (NIS Алматы), Turan MUN (апрель), ASTMUN (апрель), Zaman MUN (февраль, онлайн), QS MUN (январь).', 'Астана, Алматы, Шымкент и онлайн', 'Регистрация → конференция', 'Школьники и студенты', 'Обычно 3 000–30 000 ₸', 'Модель ООН', 'Для портфолио ценнее роль в секретариате или награды, чем просто участие.', 'Следить за mymun.com (фильтр Kazakhstan) и MyDebate.kz.', 'уточнить', 'https://mymun.com/conferences/mismun-2026', array['team']::text[], 'base', 'paid', 'каталог'),
  ('aifcmoot', 'mun', 'AIFC Court Junior Moot Competition', 'AIFC Junior Moot', 'Учебный суд в Суде МФЦА для старшеклассников Казахстана: письменные позиции и устные выступления по делу в системе общего права, на английском.', 'Соревнование', '2027-03-15'::date, true, false, 'Первый Junior Moot прошёл в марте 2026 в здании Суда МФЦА. Даты 2027 не объявлены — ожидаем похожий период.', 'Суд МФЦА, Астана', 'Письменные позиции → устные раунды', 'Старшеклассники школ Казахстана', 'Уточнить', 'Право, судебная аргументация', 'Редкий для школьника юридический опыт в настоящем суде; ценно для будущих юристов.', 'Следить за court.aifc.kz; школы участвуют через оргкомитет.', 'уточнить', 'https://court.aifc.kz/news/aifc-court-hosts-first-meeting-of-aifc-court-junior-moot-organising-committee/', array['team','school']::text[], 'strong', 'free', 'каталог'),
  ('iacmed', 'mun', 'AIFC Court & IAC Eurasia High Schools’ Mediation Competition', 'AIFC Mediation', 'Ежегодный конкурс медиации для школьников Евразии при Суде МФЦА и Международном арбитражном центре (IAC).', 'Финал', '2027-04-15'::date, true, false, 'Финал 4-го конкурса прошёл 16 апреля 2025 (30 участников из 10 школ Казахстана, Армении, Кыргызстана, Таджикистана, Турции). Даты 2027 не объявлены.', 'МФЦА, Астана', 'Обучение → отбор → финал', '14–18 лет, команды школ', 'Уточнить', 'Медиация, переговоры, право', 'Награды Best Mediation Team; уникальный для Казахстана юридический конкурс.', 'Через школу: следить за новостями aifc.kz.', 'уточнить', 'https://aol.aifc.kz/news/iac-eurasia-high-schools-mediation-competition-final-2025', array['team','school']::text[], 'strong', 'free', 'каталог'),
  ('huirsp', 'mun', 'Harvard Undergraduate International Relations Scholars Program (HUIRSP)', 'HUIRSP', 'Онлайн-конференция Harvard Undergraduate Foreign Policy Initiative для школьников, которые интересуются внешней политикой: спикеры, policy-writing, межкультурная работа.', 'Программа', '2027-06-01'::date, true, false, 'Проходит онлайн в июне; заявки и interest form весной. Даты 2027 не объявлены.', 'Онлайн', 'Interest form → заявка → онлайн-конференция', 'Старшеклассники и недавние выпускники', 'Уточнить', 'Международные отношения, внешняя политика', 'Бренд Harvard-студентов; хорошее дополнение к MUN.', 'sites.harvard.edu/foreign-policy/ir-scholars-program', 'уточнить', 'https://sites.harvard.edu/foreign-policy/ir-scholars-program', array['online']::text[], 'base', 'paid', 'каталог'),
  ('techgirls', 'vol', 'TechGirls (Госдеп США)', 'TechGirls', 'Полностью оплачиваемый обмен для девушек в STEM: 3 недели в США плюс 7 месяцев менторства и проект в своём сообществе. Казахстан исторически среди стран-участниц.', 'Заявка до', '2027-01-20'::date, true, false, 'В цикле 2026 заявки принимались 11 декабря – 20 января (12:00 по Нью-Йорку). На 2027 ожидается дедлайн около 20 января; проверьте список стран на techgirlsglobal.org.', 'США (летом) + онлайн', 'Заявка → отбор → обмен в США → проект дома', 'Девушки 15–17 лет', 'Бесплатно: виза, перелёт, проживание, питание, страховка', 'STEM, программирование, лидерство', 'Очень сильная строчка: государственная программа США с полным финансированием.', 'Заявка на techgirlsglobal.org; использование ИИ в заявке ведёт к дисквалификации.', 'уточнить', 'https://techgirlsglobal.org/apply%20/eligibility-and-application-2/', array['free','grant']::text[], 'top', 'free', 'каталог'),
  ('hundred', 'vol', 'HundrED × IB Youth Ambassador Programme', 'HundrED Youth Ambassador', 'Бесплатная онлайн-программа HundrED и International Baccalaureate (Festival of Hope) для молодых изменщиков: социальный проект по ЦУР, менторство, сертификат.', 'Заявка до', '2027-01-13'::date, true, false, 'В прошлом цикле заявки 18 декабря – 13 января, программа 1 марта – 31 мая. Есть и осенняя когорта (заявки в мае). Даты 2027 не объявлены.', 'Онлайн (Discord)', 'Заявка с видео → когорта 3 месяца', '12/13–19 лет, любая страна; учиться в IB-школе не нужно', 'Бесплатно', 'Социальные проекты, образование, ЦУР ООН', 'Сертификат HundrED и IB, сообщество, развитие своего проекта.', 'Аккаунт на hundred.org и заявка с видео.', 'прошлый цикл', 'https://www2.fundsforngos.org/?p=432913', array['free','online']::text[], 'base', 'free', 'каталог'),
  ('ibgyaf', 'vol', 'IB Global Youth Action Fund', 'IB Youth Action Fund', 'Гранты International Baccalaureate до $3 000 на школьные социальные проекты. Не нужно учиться в IB-школе.', 'Окно заявок', '2027-01-30'::date, true, false, 'В 2026 окно было 12–30 января; в 2026 профинансировали 110 проектов из 42 стран. Ожидаем похожее окно в январе 2027.', 'Онлайн', 'Заявка → оценка международной комиссией → грант', '12–19 лет, школьники (индивидуально или группой)', 'Бесплатно', 'Социальный проект в своём сообществе', 'Грант до $3 000 — сильное подтверждение проекта в портфолио.', 'Заявка через сайт IB в январе.', 'прошлый цикл', 'https://ibo.org/news/news-about-the-ib/global-youth-action-fund-2026-applications-are-now-open/', array['free','online','grant']::text[], 'strong', 'free', 'каталог'),
  ('afs', 'vol', 'AFS Global You / Global STEM Changemakers', 'AFS Global You', 'Виртуальные обмены AFS: Global You Changemaker (12 недель, свой социальный проект, платно) и Global STEM Changemakers (только по полной стипендии).', 'Стипендия (след. цикл)', '2027-08-02'::date, true, true, 'Global STEM Changemakers 2026: заявки 2 июня – 2 августа, программа 31 августа – 22 ноября. Global You Adventurer идёт несколькими потоками в год; даты 2027 обещают позже.', 'Онлайн', 'Заявка → виртуальный обмен → проект', '15–20 лет (STEM Changemakers); Global You — школьники с хорошим английским', 'STEM Changemakers бесплатно по стипендии; Global You — платно', 'Устойчивое развитие, межкультурные навыки, социальное предпринимательство', 'Сертификат AFS (с UPenn для продвинутого трека).', 'afs.org/global-stem/changemakers', 'прошлый цикл', 'https://afs.org/global-stem/changemakers/', array['online']::text[], 'base', 'free', 'каталог'),
  ('wlf', 'vol', 'World Literacy Foundation Youth Ambassador', 'WLF Youth Ambassador', 'Онлайн-программа амбассадоров грамотности: обучающие модули, кампания и фандрайзинг для литературного проекта фонда.', 'Заявка (след. цикл)', '2027-05-12'::date, true, true, 'В 2026: заявки 1 апреля – 12 мая, программа 8 июня – 6 сентября (около 30 часов за 3 месяца).', 'Онлайн', 'Заявка → модули → кампания и фандрайзинг → отчёт', '16–25 лет', 'Бесплатно', 'Грамотность, образование, адвокация', 'Сертификат; рекомендательное письмо тем, кто провёл фандрайзинг.', 'Заявка на сайте World Literacy Foundation весной.', 'прошлый цикл', 'https://opportunitydesk.org/2026/04/02/world-literacy-foundations-youth-ambassador-program-2026/', array['free','online']::text[], 'base', 'free', 'каталог'),
  ('a360', 'vol', 'Awareness 360 Fellowship', 'Awareness 360', 'Шестимесячная бесплатная программа для молодых изменщиков: обучение и свой социальный проект по ЦУР ООН с ментором.', 'Заявка (след. цикл)', '2027-03-31'::date, true, true, 'В 2026 дедлайн был 31 марта. Ожидаем похожий срок в 2027.', 'Онлайн', 'Заявка → обучение → проект в своём сообществе', '14–25 лет, любая страна', 'Бесплатно', 'Социальные проекты, ЦУР', 'Сертификат, возможность стать Country Ambassador.', 'Заявка на сайте Awareness 360.', 'прошлый цикл', 'https://www.scholarshipbob.com/scholarship/cal-l-for-applications-awareness-360-fellowship-2026', array['free','online']::text[], 'base', 'free', 'каталог'),
  ('schoolhouse', 'vol', 'Schoolhouse.world — волонтёр-тьютор', 'Schoolhouse.world', 'Платформа Сала Хана: бесплатные онлайн-занятия в мини-группах по математике и SAT. Школьники проходят сертификацию и сами ведут занятия.', 'Набор', null, true, false, 'Круглый год: сертификация по теме → заявка → проведение сессий.', 'Онлайн (Zoom)', 'Сертификация → заявка → тьюторство', 'От 13 лет', 'Бесплатно', 'Математика, SAT, AP', 'Публичный транскрипт с часами волонтёрства — удобно показывать в заявках.', 'schoolhouse.world/become-a-tutor', 'подтверждено', 'https://schoolhouse.world/become-a-tutor', array['free','online']::text[], 'base', 'free', 'каталог'),
  ('ypeer', 'vol', 'Y-PEER Qazaqstan', 'Y-PEER', 'Молодёжная сеть «равный — равному» при поддержке ЮНФПА: тренинги для подростков о здоровье и правах, волонтёрство.', 'Набор', null, true, false, 'Наборы объявляют в соцсетях; дат на сайте нет.', 'Города Казахстана', 'Набор → обучение тренеров → тренинги', 'Подростки и молодёжь', 'Бесплатно', 'Здоровье, права молодёжи, лидерство', 'Опыт тренера-волонтёра.', 'Следить за соцсетями Y-PEER Qazaqstan.', 'уточнить', 'https://ayu.edu.kz/birimler/en/0-ahmet-yesevi-universitesi/y-peer-qazaqstan', array['free']::text[], 'base', 'free', 'каталог'),
  ('tumo', 'learn', 'TUMO Astana', 'TUMO Astana', 'Бесплатный центр креативных технологий для подростков в alem.ai: 11 направлений, без вступительных экзаменов. Планируются филиалы в Алматы, Актобе и Акмолинской области.', 'Набор', null, true, false, 'Запись открыта постоянно: родители регистрируют ребёнка на сайте и подписывают договор через eGov Mobile.', 'alem.ai, Астана', 'Регистрация → самообучение + воркшопы → лаборатории', '12–18 лет', 'Бесплатно', 'Генеративный ИИ, программирование, робототехника, дизайн, анимация, кино, музыка, 3D, веб, игры', 'Портфолио реальных проектов; бренд мировой сети TUMO.', 'astana.tumo.kz/enroll-now', 'подтверждено', 'https://astanahub.com/en/article/v-astane-otkrylsia-pervyi-v-tsentralnoi-azii-tsentr-kreativnykh-tekhnologii-tumo', array['free']::text[], 'strong', 'free', 'каталог'),
  ('aisp', 'learn', 'AI Skills Passport (EY × Microsoft)', 'AI Skills Passport', 'Бесплатный 10-часовой онлайн-курс об ИИ: что это, этика, применение в бизнесе и устойчивом развитии.', 'Доступ', null, true, false, 'Круглый год, в своём темпе.', 'Онлайн (веб и мобильное приложение)', 'Курс → сертификат', 'От 16 лет', 'Бесплатно', 'Основы ИИ, этика ИИ, карьеры', 'Сертификат EY и Microsoft.', 'ey.com/ai-skills-passport', 'подтверждено', 'https://ey.com/en_gl/ai-skills-passport', array['free','online']::text[], 'base', 'free', 'каталог'),
  ('springpod', 'learn', 'Springpod — виртуальный опыт работы', 'Springpod', 'Бесплатные виртуальные стажировки и «пробники» университетских специальностей от компаний и вузов (технологии, бизнес, медицина, дизайн, архитектура, авиация и др.).', 'Доступ', null, true, false, 'Круглый год; некоторые программы с фиксированными датами.', 'Онлайн', 'Выбор программы → задания → сертификат', 'От 13 лет', 'Бесплатно', 'Профориентация по десяткам сфер', 'Сертификаты для резюме; помогает выбрать специальность.', 'springpod.com', 'подтверждено', 'https://partners.springpod.com/solutions/teachers', array['free','online']::text[], 'base', 'free', 'каталог'),
  ('premed', 'learn', 'Premed Projects — бесплатный онлайн-опыт для будущих врачей', 'Premed Projects', 'Бесплатные живые онлайн-сессии с врачами NHS (Future Doctors Month осенью, Future Doctors Weekend весной) с подписанным сертификатом.', 'Тест Future Doctors Month до', '2026-12-01'::date, false, false, 'Future Doctors Month 2026: сессии в октябре – ноябре, финальный срок для теста и сертификата 1 декабря 2026. Весной ожидается Future Doctors Weekend (в 2026 — 23–24 мая).', 'Онлайн', 'Живые сессии → тест → сертификат', '14–18 лет', 'Бесплатно', 'Медицина: кейсы, хирургия, диагностика, эпидемиология', 'Сертификат от врачей — полезно для заявок на медицину.', 'premedprojects.co.uk/free', 'подтверждено', 'https://careers.sphs.uk.com/premed-projects-future-doctors-weekend-saturday-23rd-sunday-24th-may-2026-live-online-each-day-12pm-2pm', array['free','online']::text[], 'base', 'free', 'каталог'),
  ('moocs', 'learn', 'Forage, edX, Alison — бесплатные онлайн-курсы', 'Forage / edX / Alison', 'Forage — бесплатные симуляции работы от крупных компаний; edX — университетские курсы (бесплатно в режиме audit); Alison — короткие бесплатные курсы.', 'Доступ', null, true, false, 'Круглый год.', 'Онлайн', 'Курс в своём темпе', 'Школьники (условия по возрасту — на каждой платформе)', 'Бесплатно; сертификаты edX и Alison обычно платные', 'Бизнес, финансы, IT, наука и др.', 'Хорошо как подтверждение интереса к специальности, но не как главная строчка.', 'theforage.com, edx.org, alison.com', 'уточнить', 'https://www.theforage.com/', array['free','online']::text[], 'base', 'free', 'каталог'),
  ('rephack', 'hack', 'Республиканский хакатон для школьников (Астана дарыны × CAP Education)', 'Республиканский хакатон', 'Ежегодный хакатон для школьников Казахстана: онлайн-тест, неделя разработки MVP, финал DemoDay. Направления: AI & Big Data, Digital Business & GovTech, Smart Technologies & IoT.', 'Отбор (след. цикл)', '2027-01-10'::date, true, true, 'В 2026: отборочный тест 10 января, разработка MVP 12–17 января, затем 50 команд в финале. Ожидаем похожие сроки в январе 2027.', 'Онлайн-отбор, финал в Астане', 'Тест → MVP → финал (DemoDay)', 'Школьники Казахстана, команды', 'Уточнить', 'ИИ, данные, госуслуги, IoT', 'Победителям — бесплатный доступ к Startup School и Startup Academy Astana Hub.', 'Следить за astanahub.com и «Астана дарыны».', 'прошлый цикл', 'https://astanahub.com/ru/event/respublikanskii-khakaton-dlia-shkolnikov1770973516/', array['team','hack']::text[], 'strong', 'free', 'каталог'),
  ('teeneagle', 'res', 'Teen Eagle (английский)', 'Teen Eagle', 'Международная олимпиада по английскому: онлайн-раунды или региональный раунд, затем платные Global Finals (Дубай, Лондон, США).', 'Регион. раунд Казахстан', '2027-02-28'::date, true, false, 'В сезоне 2025–26: онлайн-раунды 29 ноября и 14 февраля, региональный раунд в Казахстане 28 февраля – 1 марта 2026. Даты 2026–27 не проверены.', 'Онлайн / регион. раунд; финалы за рубежом', '', 'Школьники разных возрастов', 'Финалы платные', 'Английский язык', 'Медали; для портфолио средне.', 'teeneagle.org', 'уточнить', 'https://teeneagle.competzy.com/', array['olymp']::text[], 'res', 'paid', 'каталог'),
  ('stemco', 'res', 'StemCo Global (Science, Biology, Physics, Chemistry, Math)', 'StemCo', 'Сингапурская коммерческая олимпиада: национальные раунды через партнёров, глобальный финал в Сингапуре.', 'Даты', null, true, false, 'Глобальные финалы 2026 прошли в Сингапуре весной – летом (математика — 19–21 июня). Партнёра в Казахстане найти не удалось.', 'Национальный раунд + финал в Сингапуре', '', 'Начальная и средняя школа, Junior/Senior', 'Платно', 'Естественные науки, математика', 'Медали; для портфолио средне.', 'Через национального партнёра StemCo', 'уточнить', 'https://sites.google.com/view/aiminc-edu/competitions/stemco-global-ph', array['olymp']::text[], 'res', 'paid', 'каталог'),
  ('smartkangaroo', 'res', 'Кенгуру / «Смарт Кенгуру»', 'Кенгуру', 'Массовый математический конкурс; в Казахстане участие через школу, оплата при регистрации.', 'Даты', null, true, false, 'Школа подаёт заявку и получает ссылку для регистрации учеников. Даты 2027 не нашёл.', 'В школе', '', 'Разные классы', 'Платно', 'Математика', 'Сертификат; для портфолио слабо.', 'Узнать у учителя математики', 'уточнить', 'https://docs.google.com/document/d/1GcaMB7TTfIc3G2M7-8wNfosGr4wmcWHJ/export?format=pdf', array['olymp','school']::text[], 'res', 'paid', 'каталог'),
  ('friction', 'res', 'F(r)iction Writing Contests', 'F(r)iction', 'Конкурсы рассказов, флэш-прозы и поэзии литературного журнала F(r)iction — для всех авторов, не только школьников.', 'Весенний конкурс', '2027-05-15'::date, true, true, 'Осенний конкурс 2026 закрылся 13 ноября. Весенний обычно до середины мая (в 2026 — 15 мая).', 'Онлайн', '', 'Все возрасты', '$10–15 за работу', 'Проза, поэзия', 'Рассказ: $1 000; поэзия и флэш: $300 + публикация.', 'frictioncontests.submittable.com', 'прошлый цикл', 'https://frictioncontests.submittable.com/submit', array['online','essay']::text[], 'res', 'paid', 'каталог'),
  ('singularity', 'res', 'Singularity: AI Essay Contest (Veritas AI)', 'Singularity AI Essay', 'Бесплатный конкурс эссе о будущем ИИ от Veritas AI; призы — скидки на программы Veritas.', 'Подача (след. цикл)', '2027-04-26'::date, true, true, 'Весенний цикл 2026 закрыт (дедлайн 26 апреля). Ожидаем похожий весенний цикл 2027.', 'Онлайн', '', 'Старшеклассники, любая страна', 'Бесплатно', 'Эссе об ИИ, до 1 500 слов', 'До $2 490 в виде стипендий на программы Veritas AI.', 'veritasai.com/singularity-ai-essay-contest', 'прошлый цикл', 'https://www.veritasai.com/singularity-ai-essay-contest', array['free','online','essay']::text[], 'res', 'free', 'каталог'),
  ('iynaideathon', 'res', 'IYNA Ideathon (нейронауки)', 'IYNA Ideathon', 'Онлайн-идеатон International Youth Neuroscience Association с Alzheimer’s Association: командное исследовательское предложение по нейронауке.', 'Даты', null, true, false, 'Набор 2026 закрыт; в прошлые годы идеатон шёл в первую неделю января. Дат 2027 нет.', 'Онлайн', '', 'Старшеклассники и студенты, команды 2–4', 'Бесплатно', 'Нейронауки, нейродегенерация', 'Сертификаты и призы.', 'Discord IYNA, youthneuro.org', 'уточнить', 'https://docs.google.com/forms/d/1abrOVNKFjvqoarbrVKr5oBKaznmHcGDRpxIAqdjWy6Q/closedform', array['free','online','team']::text[], 'res', 'free', 'каталог'),
  ('o4e', 'res', 'Olympiad4Everyone (USAMO Guide)', 'Olympiad4Everyone', 'Бесплатная онлайн-олимпиада по математике с прокторингом: три этапа от уровня AMC 10 до AIME. Независимая, не отбор на AMC или USAMO.', 'Этап 1', '2026-11-07'::date, false, false, 'Этап 1: 7 или 8 ноября, этап 2: 14 или 15 ноября, финал 21 ноября 2026 (время по Нью-Йорку, 12:00–13:00 = 22:00–23:00 по Астане). Срок регистрации не указан.', 'Онлайн', '', 'Любые страны; рекомендуется 8–12 классам', 'Бесплатно', 'Математика: 20 задач AMC 10 → 20 задач AMC 12 → 11 задач AIME', 'Купоны AoPS и денежные призы спонсоров для топ-10.', 'purpleproof.olympiad4everyone.com', 'подтверждено', 'https://www.olympiad4everyone.com/', array['free','online','olymp']::text[], 'res', 'free', 'присланный пост'),
  ('kbo', 'res', 'Kazakhstan Bilim Olympiad (Edlight Academy)', 'KBO (Edlight)', 'Олимпиады учебного центра Edlight. В посте упоминаются туры по экономике и финансам в январе 2027; классы, формат и призы на сайте не указаны.', 'KBO 1', '2026-11-25'::date, true, false, 'В расписании на сайте (без года): KBO 1 — 25.11, KBO 2 — 27.01, KBO-3 — 06.04, KBO Senior — 18–22.05. Какие предметы в каждом туре, уточнять у академии.', 'Уточнить', '', 'Уточнить', 'Уточнить', 'Предметные олимпиады, в т. ч. экономика и финансы', 'Уточнить.', 'academy@edlight.kz, Instagram edlight_academy', 'уточнить', 'https://edlightacademy.kz/', array['olymp']::text[], 'res', 'paid', 'присланный пост'),
  ('rorda', 'res', 'Research Orda Kazakhstan — набор в команду', 'Research Orda (команда)', 'Не конкурс, а волонтёрская роль в бесплатной студенческой исследовательской программе, которая соединяет школьников с наставниками и профессорами. Идёт набор в команду организаторов перед потоком 2027.', 'Заявка до', '2026-11-02'::date, false, false, 'Дедлайн 2 ноября 2026; надёжнее подать до 1 ноября. Анкета на английском.', 'Онлайн', 'Анкета с короткими ответами → отбор в отдел', 'Школьники средних и старших классов, студенты, gap year', 'Бесплатно (волонтёрство)', 'Отделы: Vision & Mission, Admission, Finance, Organization, Communication, SMM', 'Организаторская роль в исследовательской программе — строчка для раздела активностей и лидерства.', 'Анкета: forms.gle/eY95pvcssb3JdC5XA. Два ответа с минимальным объёмом: «Почему этот отдел?» (от 300 слов) и «Три главных навыка» (от 200 слов), лучше написать заранее. Нагрузка 1–4 часа в неделю и отчёт раз в две недели; за пропущенные сроки штрафные баллы, при их накоплении исключают.', 'уточнить', 'https://www.instagram.com/researchordakaz/', array['free','online']::text[], 'res', 'free', 'присланный пост'),
  ('unicef', 'res', 'Волонтёрская программа ЮНИСЕФ Жастары', 'ЮНИСЕФ Жастары', 'Не конкурс, а волонтёрская программа ЮНИСЕФ Казахстан: курсы, социальные проекты, сертификат волонтёра. Хабы в Астане, Алматы, Шымкенте, Актау, Семее, Кокшетау.', 'Регистрация', null, true, false, 'Набор 2026 закрылся 16 октября. Когда будет следующий, не объявлено.', 'Онлайн и офлайн', '', '16–35 лет', 'Бесплатно', 'Права детей, ментальное здоровье, защита от насилия, климат, лидерство', 'Сертификат волонтёра ЮНИСЕФ и собственный социальный проект — хорошо для раздела активностей.', 'unicefzhastary.kz', 'уточнить', 'https://unicefzhastary.kz/', array['free']::text[], 'res', 'free', 'присланный пост')
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
    'avatar_url', 'updated_at'
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
-- Ученик может сам: свои цели года в Vision Map,
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
    'avatar_url', 'updated_at'
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

-- ════════════════════════════════════════════════════════════
-- migration-achievements.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — достижения: результат олимпиады / конкурса
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- (или просто запустите заново supabase/setup-all.sql). Файл можно запускать повторно.

-- Результат отмечает только ментор: прошёл на следующий этап / призёр
alter table public.student_deadlines
  add column if not exists result text;

alter table public.student_deadlines drop constraint if exists student_deadlines_result_check;
alter table public.student_deadlines
  add constraint student_deadlines_result_check
  check (result is null or result in ('advanced', 'prize'));

-- В дедлайнах от ментора ученик меняет только статус; результат — только ментор
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

  if tg_op = 'INSERT' then
    if new.result is not null then
      raise exception 'Результат отмечает ментор' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.student_id is distinct from old.student_id
     or new.created_by_admin is distinct from old.created_by_admin
     or new.group_key is distinct from old.group_key
     or new.opportunity_id is distinct from old.opportunity_id
     or new.result is distinct from old.result then
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
before insert or update on public.student_deadlines
for each row execute function public.enforce_deadline_update_rights();

-- ════════════════════════════════════════════════════════════
-- migration-feed.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — удаление возможностей из ленты (ментор)
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- (или просто запустите заново supabase/setup-all.sql). Файл можно запускать повторно.

-- «Удалить» = скрыть: запись остаётся (дедлайны учеников не ломаются),
-- и повторный запуск setup-all.sql не возвращает её в ленту.
alter table public.opportunities
  add column if not exists hidden boolean not null default false;

-- ════════════════════════════════════════════════════════════
-- migration-works.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — «Проекты и исследования» ученика
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- (или просто запустите заново supabase/setup-all.sql). Файл можно запускать повторно.

create table if not exists public.student_works (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  kind text not null check (kind in ('project', 'research')),
  title text not null default '',
  status text not null default 'idea' check (status in ('idea', 'active', 'paused', 'done')),
  -- Проект
  problem text not null default '',
  goal text not null default '',
  team text not null default '',
  my_role text not null default '',
  results text not null default '',
  links jsonb not null default '[]'::jsonb,
  -- Исследование
  question text not null default '',
  hypothesis text not null default '',
  supervisor text not null default '',
  competition text not null default '',
  -- Этапы: [{id, title, due, done, note, mentorComment, commentAt}]
  stages jsonb not null default '[]'::jsonb,
  mentor_comment text not null default '',
  legacy_id text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_works_student_idx on public.student_works (student_id);
create unique index if not exists student_works_legacy_idx on public.student_works (student_id, legacy_id) where legacy_id is not null;

drop trigger if exists student_works_set_updated_at on public.student_works;
create trigger student_works_set_updated_at
before update on public.student_works
for each row execute function public.set_updated_at();

alter table public.student_works enable row level security;

drop policy if exists "works_select" on public.student_works;
create policy "works_select" on public.student_works for select to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "works_insert" on public.student_works;
create policy "works_insert" on public.student_works for insert to authenticated
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "works_update" on public.student_works;
create policy "works_update" on public.student_works for update to authenticated
using (public.is_admin() or student_id = public.current_user_student_id())
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "works_delete" on public.student_works;
create policy "works_delete" on public.student_works for delete to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

grant select, insert, update, delete on public.student_works to authenticated;

-- Комментарии ментора (общий и к этапам) меняет только ментор
create or replace function public.enforce_work_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st jsonb;
  prev jsonb;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.student_id is distinct from old.student_id
       or new.mentor_comment is distinct from old.mentor_comment then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
  elsif coalesce(new.mentor_comment, '') <> '' then
    raise exception 'Комментарий пишет ментор' using errcode = '42501';
  end if;

  for st in select * from jsonb_array_elements(coalesce(new.stages, '[]'::jsonb)) loop
    prev := null;
    if tg_op = 'UPDATE' then
      select e into prev from jsonb_array_elements(coalesce(old.stages, '[]'::jsonb)) e
      where e->>'id' = st->>'id' limit 1;
    end if;
    if coalesce(st->>'mentorComment', '') is distinct from coalesce(prev->>'mentorComment', '')
       or coalesce(st->>'commentAt', '') is distinct from coalesce(prev->>'commentAt', '') then
      raise exception 'Комментарий к этапу пишет ментор' using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists student_works_rights on public.student_works;
create trigger student_works_rights
before insert or update on public.student_works
for each row execute function public.enforce_work_rights();

-- Краткая сводка в students.projects — на ней держится балл «Академ успехи» и отчёты
create or replace function public.sync_student_projects(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students s
  set projects = coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id::text,
      'title', case when w.kind = 'research' then 'Исследование: ' || w.title else w.title end,
      'role', w.my_role,
      'description', case when w.kind = 'research' then w.question else w.problem end,
      'status', case w.status when 'done' then 'Завершён' when 'active' then 'В работе'
                              when 'paused' then 'На паузе' else 'Идея' end,
      'impactMetrics', w.results
    ) order by w.sort, w.created_at)
    from public.student_works w
    where w.student_id = p_student_id and w.title <> ''
  ), '[]'::jsonb)
  where s.id = p_student_id;
end;
$$;

create or replace function public.student_works_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_student_projects(coalesce(new.student_id, old.student_id));
  if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
    perform public.sync_student_projects(old.student_id);
  end if;
  return null;
end;
$$;

drop trigger if exists student_works_sync on public.student_works;
create trigger student_works_sync
after insert or update or delete on public.student_works
for each row execute function public.student_works_sync();

-- Перенос старой «Внеучебной деятельности» (один раз; повторный запуск не дублирует)
insert into public.student_works (student_id, kind, title, status, problem, my_role, results, legacy_id, sort)
select s.id, 'project',
       coalesce(p->>'title', ''),
       case p->>'status' when 'Завершён' then 'done' when 'В работе' then 'active'
                         when 'На паузе' then 'paused' else 'idea' end,
       coalesce(p->>'description', ''),
       coalesce(p->>'role', ''),
       coalesce(p->>'impactMetrics', ''),
       coalesce(p->>'id', md5(p::text)),
       (ord)::int
from public.students s
cross join lateral jsonb_array_elements(coalesce(s.projects, '[]'::jsonb)) with ordinality as t(p, ord)
where coalesce(p->>'title', '') <> ''
  -- свои же записи (id = uuid работы) не переносим повторно
  and not exists (select 1 from public.student_works w where w.student_id = s.id and w.id::text = p->>'id')
on conflict do nothing;

-- Для родителя по ссылке
create or replace function public.get_works_by_parent_token(p_token text)
returns setof public.student_works
language sql
stable
security definer
set search_path = public
as $$
  select w.* from public.student_works w
  join public.students s on s.id = w.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token
  order by w.sort, w.created_at;
$$;

grant execute on function public.get_works_by_parent_token(text) to anon, authenticated;

-- Журнал действий
do $$
begin
  if to_regprocedure('public.log_change()') is not null then
    drop trigger if exists student_works_activity on public.student_works;
    create trigger student_works_activity
    after insert or update or delete on public.student_works
    for each row execute function public.log_change();
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- migration-summer.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — летние программы 2027 в ленте возможностей
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- (или просто запустите заново supabase/setup-all.sql). Файл можно запускать повторно.
-- Данные собираются скриптом scripts/build-summer-sql.py из data/summer-programs-2027.json.

-- Тип возможности: олимпиада/конкурс или летняя программа
alter table public.opportunities
  add column if not exists program_type text not null default 'competition';
alter table public.opportunities drop constraint if exists opportunities_program_type_check;
alter table public.opportunities
  add constraint opportunities_program_type_check check (program_type in ('competition', 'summer'));

-- Новый тип дедлайна у ученика: летняя программа
alter table public.student_deadlines drop constraint if exists student_deadlines_category_check;
alter table public.student_deadlines
  add constraint student_deadlines_category_check
  check (category in ('olympiad', 'contest', 'hackathon', 'exam', 'application', 'program', 'task', 'other'));

-- Данные (повторный запуск обновляет тексты; удалённые ментором и логотипы не трогает)
insert into public.opportunities (id, section, name, short_name, description, kind, due_date, approx, next_cycle, date_note, location, stages, grades, price, topics, gives, how, status, url, tags, tier, money, source, program_type) values
  ('s-yygs', 'summer-usa', 'Yale Young Global Scholars (YYGS)', 'Yale Young Global Scholars', 'Двухнедельная очная программа Yale для школьников со всего мира: лекции, семинары, проект.', 'Заявка до', '2027-01-06'::date, false, false, 'Основной раунд 6 янв 2027, 23:59 ET. Ранний раунд закрылся 15 окт 2026. Решения до 10 марта, оплата до 15 марта.', 'Yale University, Нью-Хейвен, США', 'Сессия I: 20 июня – 2 июля; II: 4–16 июля; III: 18–30 июля 2027', '16–18 лет к 18 июля 2027; 10–11 класс (выпуск 2028 или 2029); английский для академической работы; только впервые участвующие.', '$7,500 за сессию (без дороги)', 'Наука и технологии (IST), политика, право и экономика (PLE), глобальные проблемы (SGC)', 'Помощь по нужде до 100% стоимости, из любой страны. Дорога не покрывается.', '$85 (ранний раунд), $100 (основной). Освобождение от взноса через школу.', '2027 подтверждено', 'https://globalscholars.yale.edu/how-apply/application-deadlines', array['aid','humanities','science','business']::text[], 'strong', 'aid', 'Летние программы 2027', 'summer'),
  ('s-launchx', 'summer-usa', 'LaunchX Online Entrepreneurship', 'LaunchX Online Entrepreneurship', 'Онлайн-программа по запуску стартапа.', 'Заявка до', '2027-01-07'::date, true, false, 'Цикл 2026: ранний 7 янв, затем 11 фев и 4 мар (вторичный источник)', 'Онлайн', 'Лето (даты не проверены)', 'Школьники со всего мира (вторичный источник)', '$1,995–$6,495 (вторичный источник, цикл 2026)', 'Предпринимательство, стартапы', 'Не проверено', 'н/д', 'уточнить', 'https://pioneeracademics.com/news/best-research-oriented-summer-programs-for-both-us-and-international-high-school-students/', array['business']::text[], 'paid', 'none', 'Летние программы 2027', 'summer'),
  ('s-harvard', 'summer-usa', 'Harvard Secondary School Program', 'Harvard Secondary School Program', 'Университетские курсы Harvard Summer School для школьников (7, 4 недели и короткие Pre-College сессии).', 'Заявка до', '2027-01-13'::date, false, false, 'Ранний 13 янв; основной и международный 10 фев (нужна виза/I-20); поздний 31 мар без помощи. 2027.', 'Harvard University, Кембридж, Массачусетс, США', 'Цикл 2026: 7 недель с 22 июня, 4 недели с 13 июля, Pre-College сессии с 22 июня, 6 и 20 июля', 'Цикл 2026: выпуск 2026–2028; 16 лет к 20 июня; TOEFL/IELTS/Duolingo для неносителей (типичные успешные баллы: TOEFL 103+, IELTS 7.5+).', 'Цикл 2026: от $4,180 до $15,735 в зависимости от формата (вторичный источник)', 'Университетские курсы по выбору (список на сайте)', 'Помощь только для граждан и резидентов США и DACA. Для Казахстана помощи нет.', '$75', '2027 подтверждено', 'https://summer.harvard.edu/high-school-programs/secondary-school-program/calendar/', array['humanities','science','business']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-nd', 'summer-usa', 'Notre Dame Leadership Seminars', 'Notre Dame Leadership Seminars', 'Двухнедельные семинары по лидерству в University of Notre Dame, около 150 участников в год.', 'Заявка до', '2027-01-20'::date, true, false, '20 янв 2027, 23:59 EST; результаты тестов до 31 янв. Приём открывается 19 окт 2026.', 'University of Notre Dame, Индиана, США', 'Сессия I: 19–30 июня; II: 10–21 июля 2027', 'Сильная учёба и лидерство в сообществе; конкурс. Иностранные ученики допускаются; вопросы: precoll@nd.edu.', 'Бесплатно: обучение, проживание и питание оплачивает университет; после зачисления взнос $150', 'Лидерство, семинары с преподавателями университета', 'Дорога за счёт студента. Освобождение от взноса и помощь с дорогой дают «редко и только в крайних случаях». Иностранные ученики приглашены к участию (admissions.nd.edu).', '$75', 'уточнить', 'https://precollege.nd.edu/leadership-seminars/', array['free','humanities']::text[], 'strong', 'free', 'Летние программы 2027', 'summer'),
  ('s-wharton', 'summer-usa', 'Wharton Global Youth Program', 'Wharton Global Youth Program', 'Программы Wharton (UPenn) по бизнесу, финансам и данным: очно 2–3 недели и онлайн.', 'Заявка до', '2027-01-27'::date, false, false, 'Приоритетный 27 янв 2027; окончательный для очных 19 марта; онлайн по мере заполнения.', 'UPenn, Филадельфия; также Сан-Франциско, Кембридж (UK), онлайн', 'Очно 2–3 недели (Leadership in the Business World, Data Science Academy, Moneyball, AI Leadership и др.)', 'GPA от 3.3 (3.5 для Leadership in the Business World и M&T); TOEFL iBT 100, IELTS 7 или Duolingo 130 для неносителей; рекомендация учителя; эссе.', 'На странице заявки не указана (Management & Technology: ≈$9,000, вторичный источник)', 'Бизнес, финансы, данные, предпринимательство, спортивный бизнес, ИИ', 'Освобождение от взноса для школ Филадельфии и партнёров. Условия стипендий уточнить.', '$100', '2027 подтверждено', 'https://globalyouth.wharton.upenn.edu/application-information/', array['business']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-sumac', 'summer-usa', 'Stanford SUMaC', 'Stanford SUMaC', 'Математическая программа Stanford для сильных школьников, очно или онлайн.', 'Заявка до', '2027-02-02'::date, true, false, 'Цикл 2026: заявка ≈ 2 фев (вторичный источник), помощь до 9 фев, документы до 16 фев', 'Stanford University, Калифорния, США (или онлайн)', 'Лето, даты на сайте', 'Сильная подготовка по математике; детали отбора на сайте.', 'Очно $8,950; онлайн $3,750 (цикл 2026)', 'Углублённая математика (темы на сайте)', 'Помощь по нужде для всех, включая международных (форма SSS, школьный код 200189). Документы по доходу в переводе на английский.', '$60, есть освобождение', 'уточнить', 'https://sumac.spcs.stanford.edu/tuition-and-financial-aid-sumac', array['aid','math']::text[], 'strong', 'aid', 'Летние программы 2027', 'summer'),
  ('s-uchicago', 'summer-usa', 'UChicago Pre-College', 'UChicago Pre-College', 'Университетские курсы University of Chicago очно и онлайн, 2–8 недель.', 'Заявка до', '2027-02-11'::date, true, false, 'Цикл 2026: приоритетный 11 фев, основной 12 мар', 'University of Chicago, США (или онлайн)', 'Курсы 2–8 недель, лето', 'Высокий уровень английского (ESL нет); эссе, образец текста, рекомендация учителя; тесты необязательны.', 'От $2,500 до $15,200 очно; $4,980–$8,550 удалённо (вторичный источник)', 'Наука, математика, экономика, информатика, гуманитарные курсы', 'Помощь запрашивается в заявке с документами; после решения помощь не дают.', '$75, списывается при подаче на помощь с документами', 'цикл 2026', 'https://summer.uchicago.edu/pre-college/application-instructions', array['aid','humanities','science']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-mathcamp', 'summer-usa', 'Canada/USA Mathcamp', 'Canada/USA Mathcamp', 'Пятинедельный математический лагерь: курсы вне школьной программы, 120 участников.', 'Заявка до', '2027-02-23'::date, true, false, 'Цикл 2026: приём с 12 янв, дедлайн 23 фев, решения 17 апр. Даты 2027 объявят в декабре.', 'Champlain College, Берлингтон, Вермонт, США', 'Цикл 2026: 28 июня – 2 августа (35 дней)', '13–18 лет; пройден предкалкулюс; квалификационные задачи с полными решениями; тестов и TOEFL нет.', 'От $0 до $7,500 в зависимости от помощи', 'Углублённая математика вне школьной программы', 'Бесплатно для семей США и Канады с доходом до $100k. Для иностранцев значительная часть бюджета помощи; обещают покрыть 100% нужды, включая билеты.', 'Нет', 'цикл 2026', 'https://mathcamp.org/admission/fast_facts', array['aid','math']::text[], 'top', 'aid', 'Летние программы 2027', 'summer'),
  ('s-promys', 'summer-usa', 'PROMYS', 'PROMYS', 'Шестинедельная программа по математике с решением больших серий задач.', 'Заявка до', '2027-02-28'::date, true, false, 'Конец февраля 2027 (дата TBD). Помощь: форма до срока заявки (цикл 2026: 15 марта). Решения в конце апреля.', 'Boston University, США (также PROMYS Europe, India, Italia)', '27 июня – 7 августа 2027', '14–18 лет; окончен 9 класс; не студент вуза; подавать можно только в одну программу PROMYS; виза визитёра.', 'До $8,000 (реальная стоимость больше $10,000)', 'Математика уровня исследований, в основе теория чисел', 'Для иностранцев помощь решается индивидуально и ограниченно. Все кандидаты автоматически рассматриваются на полную стипендию Breakout Fellowship. США: до $80k бесплатно.', 'н/д', '2027 подтверждено', 'https://promys.org/programs/promys/for-students/', array['aid','math']::text[], 'top', 'aid', 'Летние программы 2027', 'summer'),
  ('s-ross', 'summer-usa', 'Ross Mathematics Program', 'Ross Mathematics Program', 'Шестинедельная программа по теории чисел и математическому мышлению.', 'Заявка до', '2027-03-08'::date, true, false, 'Цикл 2026: 8 марта; позже «может не быть полного рассмотрения»; решения в середине апреля.', 'Otterbein University (Огайо) и Rose-Hulman (Индиана), США', 'Цикл 2026: 14 июня – 24 июля', 'Эссе, видео, рекомендация учителя, транскрипт, сложные задачи.', '$7,500 (6 недель с проживанием)', 'Теория чисел и математические исследования', 'Помощь по нужде есть; запрос на ross@rossprogram.org. Допуск иностранцев на странице не указан.', 'Не указана', 'цикл 2026', 'https://rossprogram.org/participants/application/', array['aid','math']::text[], 'top', 'aid', 'Летние программы 2027', 'summer'),
  ('s-spcs', 'summer-usa', 'Stanford Pre-Collegiate Summer Institutes', 'Stanford Pre-Collegiate Summer Institutes', 'Университетские курсы Stanford для школьников по естественным и гуманитарным наукам.', 'Заявка до', '2027-03-13'::date, true, false, 'Цикл 2026: заявка 13 марта, помощь 20 марта, документы 27 марта, решения в середине мая', 'Stanford University, Калифорния, США', 'Лето, даты на сайте', '8–11 класс; старше 13 и моложе 19 лет на время программы; один раунд.', '$3,200 (по странице помощи, цикл 2026)', 'Науки, гуманитарные, экономика, ИИ', 'Помощь по нужде, в том числе международным ученикам.', '$60, есть освобождение', 'цикл 2026', 'https://summerinstitutes.spcs.stanford.edu/admissions', array['aid','science','humanities']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-awesome', 'summer-usa', 'AwesomeMath Summer Program', 'AwesomeMath Summer Program', 'Олимпиадная математика, несколько сессий.', 'Заявка до', '2027-04-09'::date, true, false, 'Цикл 2026: 28 янв, 9 апр, 6 мая, 4 июня (вторичный источник)', 'США, очно и онлайн', 'Лето, несколько сессий', 'Одарённые ученики со всего мира (вторичный источник)', '$1,275–$1,575 (вторичный источник)', 'Олимпиадная математика', 'Не проверено', 'н/д', 'уточнить', 'https://pioneeracademics.com/news/best-research-oriented-summer-programs-for-both-us-and-international-high-school-students/', array['math']::text[], 'paid', 'none', 'Летние программы 2027', 'summer'),
  ('s-hcssim', 'summer-usa', 'HCSSiM (Hampshire College Summer Studies in Mathematics)', 'HCSSiM', 'Шестинедельная математическая программа без экзаменов.', 'Заявка до', '2027-04-17'::date, true, false, 'Цикл 2026: новые заявки до 17 апр, тест Interesting Test до 25 апр', 'Hampshire College, Массачусетс, США', 'Цикл 2026: 28 июня – 8 августа', 'Талантливые школьники; детали на сайте.', '$7,208', 'Углублённая математика (темы на сайте)', '«Достаточная помощь», условия на hcssim.org/money. Допуск иностранцев на странице не указан.', 'н/д', 'цикл 2026', 'https://hcssim.org/', array['aid','math']::text[], 'strong', 'aid', 'Летние программы 2027', 'summer'),
  ('s-mathily', 'summer-usa', 'MathILy', 'MathILy', 'Пятинедельная математическая программа.', 'Заявка до', '2027-04-29'::date, true, false, 'Приоритетный срок цикла 2026 (вторичный источник)', 'Bryn Mawr College, Пенсильвания, США', 'Цикл 2026: 28 июня – 1 августа', 'Участники «из США и иногда из мира».', '≈$5,300 (вторичный источник)', 'Углублённая математика (темы на сайте)', 'Не проверено', 'н/д', 'уточнить', 'https://www.mathily.org/', array['math']::text[], 'strong', 'none', 'Летние программы 2027', 'summer'),
  ('s-cuhk', 'summer-hk', 'CUHK Summer Institute', 'CUHK Summer Institute', 'Короткие университетские курсы CUHK, можно взять до двух курсов, до 2 кредитов.', 'Заявка до', '2027-04-10'::date, true, false, 'Цикл 2026 для иностранцев: ранний срок и Merit Award 27 марта, общий 10 апреля. Для местных 24 апреля и 8 мая.', 'Chinese University of Hong Kong, Гонконг', 'Цикл 2026: 14–17 июля и 20–21 июля (по ~15 часов на курс)', 'От 16 лет; приоритет у 11 класса (Grade 11 / Year 12 / DP1), 10 класс тоже можно; оценки за два последних периода; иностранцам может понадобиться студенческая виза.', '1 курс HK$4,750 (ранний срок) или HK$5,000; 2 курса HK$8,740 или HK$9,200 (цикл 2026)', 'Искусство, менеджмент, образование, социальные науки, право, медицина (в т. ч. традиционная китайская)', 'Merit Award даёт скидку за сильные результаты. Финансовая помощь только для жителей Гонконга.', 'HK$150', 'цикл 2026', 'https://www.summer.cuhk.edu.hk/si-online-application/', array['humanities','business']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-hkust', 'summer-hk', 'HKUST Summer Institute и Bootcamp', 'HKUST Summer Institute и Bootcamp', 'Кредитные курсы, тематические программы и десятидневный Bootcamp for Polymath в HKUST.', 'Заявка до', '2027-05-31'::date, false, false, '31 мая 2027. Приём открывается в середине декабря 2026, заявки по очереди, решения с февраля.', 'Hong Kong University of Science and Technology, Гонконг', 'Bootcamp: 16–25 июля 2027; курсы (по 1 кредиту) и тематические программы: 17–24 июля; корпоративные: 26–30 июля', '10 класс (Year 11 / Grade 10 / Form 4) и старше; в 2026 для школ не на английском IELTS от 6.0; кредиты можно засчитать при поступлении в HKUST.', 'Цены 2027 объявят до середины декабря. В 2026: bootcamp HK$13,800; курсы и тематические программы HK$8,000 без проживания', 'Науки, инженерия, бизнес, гуманитарные и социальные науки, ИИ', 'Стипендии на странице не упомянуты.', 'н/д на странице', '2027 подтверждено', 'https://join.hkust.edu.hk/pre-university', array['science','business']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-hku', 'summer-hk', 'HKU Summer Institute', 'HKU Summer Institute', 'Летние курсы HKU для школьников, плюс пятидневное погружение с проживанием.', 'Заявка до', '2027-05-31'::date, true, false, 'Цикл 2026: 31 мая для местных. Для иностранных школьников срок на найденных страницах не указан.', 'University of Hong Kong, Гонконг; программы в Шанхае 24 янв – 2 фев 2027', 'Цикл 2026: 15 июня – 31 июля; погружение 9–13 июля с проживанием', 'Year 9–13 (Grade 7–12) по обзору Sing Tao; для школ не на английском IELTS от 6.5.', 'HK$5,600–18,800; погружение HK$19,800 (цикл 2026, обзор Sing Tao)', 'Бизнес и экономика, искусство, ИИ, анализ данных, право, устойчивое развитие, STEAM, общественное здравоохранение', 'Не указана', 'н/д', 'уточнить', 'https://www.summerinstitute.hku.hk', array['humanities','science','business']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-pioneer', 'summer-res', 'Pioneer Research Institute', 'Pioneer Research Institute', 'Онлайн-исследовательский проект под руководством профессора.', 'Заявка до', '2026-10-31'::date, true, false, 'Spring-to-Summer: срок объявят в 3-ю неделю октября 2026. Summer Term: во 2-ю неделю января 2027. Решения за 6–8 недель.', 'Онлайн (Pioneer Academics, США)', 'Spring-to-Summer и Summer Term, даты на сайте', 'Эссе, транскрипт, оценка учителя или консультанта, видеоинтервью и письменное задание на время; тесты необязательны.', '$7,465 (+ до 2% на материалы)', 'Исследовательский проект по выбранной дисциплине (до 4 интересов в заявке)', 'Ограниченное число грантов по нужде; зависит от того, можно ли подтвердить доход в вашей стране. Полный грант требует возвращаемый депозит.', 'н/д на странице', '2027 подтверждено', 'https://pioneeracademics.com/pioneer-research-institute/admission', array['aid','research']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-rsi', 'summer-res', 'Research Science Institute (RSI)', 'Research Science Institute', 'Самая известная бесплатная исследовательская программа: неделя занятий и пять недель стажировки.', 'Заявка до', '2026-12-11'::date, false, false, '11 дек 2026, 23:59. Иностранцы подают через национальное агентство, график отбора свой.', 'MIT, Кембридж, США; с 2027 также Stanford (50 мест)', 'Неделя занятий + 5 недель исследования + неделя презентаций; даты 2027 не опубликованы', 'Только 11 класс (12 класс не допускается); около 100 мест в MIT и 50 в Stanford; примерно треть участников иностранцы.', 'Бесплатно', 'Естественные науки, математика, инженерия, исследовательский проект', 'Полностью покрывается программой. Для Казахстана нужно выяснить процедуру у CEE (Maite Ballestero).', '≈$75, возможно освобождение (вторичный источник)', '2027 подтверждено', 'https://www.cee.org/research-science-institute', array['free','science','research']::text[], 'top', 'free', 'Летние программы 2027', 'summer'),
  ('s-ssrp', 'summer-res', 'Rockefeller University SSRP', 'Rockefeller University SSRP', 'Семь недель в лаборатории Rockefeller University в Нью-Йорке.', 'Заявка до', '2027-01-04'::date, false, false, '4 янв 2027, 17:00 ET, поздние заявки не рассматриваются. Интервью в марте, решения в конце апреля.', 'Rockefeller University, Нью-Йорк, США', '21 июня – 5 августа 2027, пн–пт 9:00–17:00', '11–12 класс; 16 лет к 21 июня 2027; 10 класс не допускается; минимального GPA нет.', 'Не указана на странице (вторичный источник: бесплатно)', 'Работа в исследовательской команде лаборатории, направление в анкете', 'Стипендии не гарантированы, даются по нужде. Жильё, визу и билеты организуют сами.', 'н/д', '2027 подтверждено', 'https://www.rockefeller.edu/outreach/ssrp/', array['science','research']::text[], 'top', 'none', 'Летние программы 2027', 'summer'),
  ('s-wolfram', 'summer-res', 'Wolfram High School Summer Research Program', 'Wolfram High School Summer Research Program', 'Трёхнедельная программа по вычислениям и исследовательскому проекту.', 'Заявка до', '2027-01-18'::date, true, false, 'Цикл 2026: ранний 18 янв, основной 22 марта; решения 16 фев и 17 апр', 'Bentley University, Бостон, США (цикл 2026)', 'Цикл 2026: 24 июня – 11 июля', 'Моложе 18 лет к концу программы; иностранцы принимаются; около 80 участников; курс Creative Computation до старта.', '$5,500 по FAQ (год уточнить), включает депозит $500 и проживание', 'Вычисления и исследовательский проект на технологиях Wolfram (любая STEM-область)', 'Помощь по нужде до 90%, не покрывает транспорт и депозит; отбор без учёта нужды.', 'н/д на странице', 'цикл 2026', 'https://education.wolfram.com/summer-research-high-school/admission/', array['aid','science','research']::text[], 'strong', 'aid', 'Летние программы 2027', 'summer'),
  ('s-ssp', 'summer-res', 'Summer Science Program (SSP)', 'Summer Science Program', 'Исследовательский проект в естественных науках с расчётами и наблюдениями.', 'Заявка до', '2027-01-29'::date, true, false, 'Январь 2027 для международных (точная дата не объявлена; приём с декабря). Решения в середине марта.', 'Кампусы в США (список на сайте)', 'Старт в середине июня 2027', '11 класс; от 15 до 19 лет на время программы; 10 класс не допускается; баллы по английскому при необходимости.', '≈$9,800 (вторичный источник, цикл 2026)', 'Исследовательский проект в естественных науках', 'Отбор без учёта нужды. Бесплатно при доходе до $75k, скидка до ~$140k; стипендии $3,000; помощь с билетом студента.', 'Бесплатно', '2027 подтверждено', 'https://ssp.org/application/', array['aid','science','research']::text[], 'top', 'aid', 'Летние программы 2027', 'summer'),
  ('s-bl4s', 'summer-res', 'Beamline for Schools (CERN)', 'Beamline for Schools', 'Командный конкурс: победители ставят свой эксперимент на ускорителе.', 'Заявка до', '2027-03-31'::date, true, false, 'Конец марта 2027 (точная дата TBD; в 2026: 31 марта). Результаты в июне 2027.', 'Ускоритель частиц (CERN)', 'Даты эксперимента определяются после конкурса', 'Команда от 5 школьников и взрослый тренер; школьники из любых стран; письменная заявка и видео на 1 минуту.', 'Бесплатно', 'Физика частиц, командный эксперимент', 'Победителям оплачивают дорогу, жильё и питание для 9 учеников и 2 тренеров.', 'Нет', '2027 подтверждено', 'https://beamline-for-schools.web.cern.ch/about', array['free','science','research']::text[], 'strong', 'free', 'Летние программы 2027', 'summer'),
  ('s-srp', 'summer-res', 'NU Summer Research Projects (SRP)', 'NU Summer Research Projects', 'Летние исследовательские проекты Nazarbayev University для школьников и студентов.', 'Заявка до', '2027-04-20'::date, true, false, 'Ориентировочно весна 2027; данные за 2025. Вопросы: srp@nu.edu.kz', 'Nazarbayev University, Астана', 'Лето; в 2025 году 9 проектов', 'Старшеклассники и студенты; документы на странице SRP 2025.', 'н/д', 'Экология, геология, энергетика, лингвистика, физика, ИИ, химия, предпринимательство', 'н/д', 'н/д', 'уточнить', 'https://nu.edu.kz/news-en/summer-research-projects-2025-opportunities-for-high-school-and-university-students/', array['research']::text[], 'kz', 'none', 'Летние программы 2027', 'summer'),
  ('s-nucamp', 'summer-kz', 'NU Summer Camp', 'NU Summer Camp', 'Одиннадцатидневный лагерь при Nazarbayev University: лаборатории, проекты, проживание в общежитии.', 'Заявка до', '2027-04-15'::date, true, false, 'Весна 2027 (ориентир). Дедлайн не указан, регистрация на camp.nu.edu.kz.', 'Nazarbayev University, Астана', 'Цикл 2026: 4 сессии с 3 июня по 25 июля, по 11 дней', '14–18 лет, из любого региона Казахстана.', 'н/д (осенняя программа NU, 5 дней: 280,000 ₸ со скидкой)', 'Cybermind (робототехника и ИИ), Human Lab (медицина и биомеханика), Inside Science, Success Track (поступление), Maker Lab', 'н/д', 'н/д', 'цикл 2026', 'https://nu.edu.kz/?p=48701', array['science']::text[], 'kz', 'none', 'Летние программы 2027', 'summer'),
  ('s-npaa', 'summer-kz', 'Летняя школа NPAA (NU и ISTC)', 'Летняя школа NPAA', 'Четыре недели физики и робототехники при Nazarbayev University, высокий конкурс.', 'Заявка до', '2027-04-30'::date, true, false, 'Весна 2027 (ориентир). Дедлайн не опубликован.', 'Nazarbayev University, Астана', 'Цикл 2026: 8–30 июня', 'Старшеклассники и студенты из Казахстана; эссе и интервью; в 2026 году 30 мест на 700 заявок.', 'н/д', 'Астрофизика, физика, ядерная физика, робототехника', 'При поддержке ISTC; условия не указаны', 'н/д', 'цикл 2026', 'https://nu.edu.kz/news-en/700-applications-30-spots-nu-launches-summer-school-in-nuclear-physics/', array['science','research']::text[], 'kz', 'none', 'Летние программы 2027', 'summer'),
  ('s-nnc', 'summer-kz', 'Летняя школа «Юный физик»', 'Летняя школа «Юный физик»', 'Пятидневная школа в Национальном ядерном центре РК.', 'Заявка до', '2027-05-01'::date, true, false, 'Ориентир; дедлайн не указан', 'Национальный ядерный центр РК, Курчатов', 'Цикл 2026: 15–19 июня', '8–10 класс; 50 участников.', 'н/д', 'Физика, термоядерный синтез, радиационная безопасность, экскурсия на токамак КТМ', 'н/д', 'н/д', 'уточнить', 'https://www.nnc.kz/en/news/show/685', array['science']::text[], 'kz', 'none', 'Летние программы 2027', 'summer'),
  ('s-tumo', 'summer-kz', 'Летние курсы TUMO Astana', 'Летние курсы TUMO Astana', 'Бесплатные летние курсы по цифровым направлениям.', 'Заявка до', '2027-05-15'::date, true, false, 'Ориентир; сроки записи не опубликованы', 'TUMO, Астана', 'Летние каникулы', '12–18 лет.', 'Бесплатно (по сообщению Informburo)', 'Генеративный ИИ, робототехника, программирование, анимация, графический дизайн', 'Бесплатное обучение; летом 2026 добавили 800 мест', 'Нет', 'уточнить', 'https://www.inform.kz/ru/shkolniki-kazahstana-smogut-besplatno-izuchat-iskusstvenniy-intellekt-letom-f7cd9ee3', array['free']::text[], 'kz', 'free', 'Летние программы 2027', 'summer'),
  ('s-nyuad', 'summer-kz', 'NYU Abu Dhabi High School Programs', 'NYU Abu Dhabi High School Programs', 'Пятидневные курсы NYUAD для школьников без проживания.', 'Заявка до', '2027-06-01'::date, true, false, 'Ориентир; дедлайн на странице не указан', 'NYU Abu Dhabi, ОАЭ', '2027: 5–16 июля, 2 недели, возраст 15–18, на полдня или полный день (Design Lab: 3 дня). Цикл 2026: 6–10 июля, 5 дней по 3 часа', '«Амбициозные школьники»; допуск иностранцев не указан.', 'AED 6,000 за программу; AED 10,000 за обе', 'Robotics and Intelligent Systems; Creative Writing', 'Не указано', 'AED 184', 'уточнить', 'https://nyuad.nyu.edu/en/academics/community-programs/high-school-programs.html', array['science','humanities']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-brown', 'summer-usa', 'Brown University Pre-College', 'Brown University Pre-College', 'Курсы Brown для школьников очно и онлайн, в линейке есть Leadership Institute.', 'Заявка до', '2027-05-15'::date, true, false, 'Цикл 2026: приём с 14 янв, срок 15 мая, rolling, финальные решения 22 мая. Даты 2027 не подтверждены.', 'Brown University, Провиденс, США (или онлайн)', 'Лето; сессии 2027 не подтверждены', 'Школьники; детали на сайте программы.', 'Leadership Institute 2026: $6,052 с проживанием, $4,748 без, $5,778 онлайн (вторичный источник)', 'Курсы по выбору, лидерство', 'Стипендия Sibley только для жителей США; для иностранных учеников в 2026 помощи не было.', 'н/д', 'цикл 2026', 'https://precollege.brown.edu/apply', array['humanities']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-columbia', 'summer-usa', 'Columbia University Pre-College', 'Columbia University Pre-College', 'Курсы Columbia в Нью-Йорке на 1–3 недели, очно и онлайн; открыто для школьников всех стран.', 'Заявка до', '2027-03-01'::date, false, false, 'Приём открывается в середине ноября 2026. Ранняя регистрация до 1 фев 2027; общий срок 1 мар (очно с проживанием) и 1 апр (без проживания и онлайн); документы на помощь до 10 фев.', 'Columbia University, Нью-Йорк, США (или онлайн)', 'Очно: 21–25 июн; 28 июн – 16 июл; 20 июл – 6 авг; 2–6 авг. Онлайн: 21–25 июн; 12–23 июл (2027)', 'Школьники; детали на сайте.', '$2,868 (1 неделя онлайн) – $12,838 (3 недели очно) (вторичный источник)', 'Курсы по выбору: гуманитарные, науки, бизнес', 'Помощь по нужде есть; условия для иностранцев уточнить.', 'н/д', 'уточнить', 'https://sps.columbia.edu/highschool', array['aid','humanities','science']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-stanfordss', 'summer-usa', 'Stanford Summer Session (школьники)', 'Stanford Summer Session', 'Восьминедельная сессия Stanford: университетские курсы с кредитами и официальным транскриптом.', 'Заявка до', '2027-03-31'::date, true, false, 'Источники расходятся: на официальных страницах значится срок 20 янв (возможно, прошлых лет); вторичный источник для 2026: 31 мар, для I-20 до 27 апр. Иностранцам советуют подавать как можно раньше. Сверьте на summer.stanford.edu.', 'Stanford University, Калифорния, США', 'Цикл 2026: 20 июн – 16 авг; на 2027 обещаны варианты с проживанием и без', 'Завершён учебный год в школе; транскрипт, эссе, подтверждение английского; для иностранцев студенческая виза (I-20).', '$1,505 за юнит; без проживания минимум 5 юнитов, от $8,226', 'Курсы Stanford по выбору', 'Есть форма интереса к Merit Grant; условия для иностранцев уточнить.', 'н/д', 'уточнить', 'https://summer.stanford.edu/home', array['humanities','science']::text[], 'paid', 'none', 'Летние программы 2027', 'summer'),
  ('s-georgetown', 'summer-usa', 'Georgetown Summer College и Academies', 'Georgetown Summer College и Academies', 'Курсы и тематические академии Georgetown, очно и онлайн.', 'Заявка до', '2027-01-31'::date, false, false, 'Программы 2027 публикуются 16 нояб 2026, рассмотрение с 15 нояб. Academies: ранний срок 31 янв (взнос освобождается), финальный 15 мая.', 'Georgetown University, Вашингтон, США (или онлайн)', 'Summer College 1: 30 мая – 2 июля 2027; Summer College Online: 30 мая – 23 июля 2027; Pre-College Online круглый год', 'Школьники; детали на сайте.', 'н/д, смотрите на сайте', 'Политика, право, бизнес, науки, гуманитарные курсы', 'н/д', '$50', 'уточнить', 'https://summer.georgetown.edu', array['humanities','business']::text[], 'paid', 'none', 'Летние программы 2027', 'summer'),
  ('s-nucpp', 'summer-usa', 'Northwestern College Preparation Program', 'Northwestern College Preparation Program', 'Университетские курсы Northwestern для школьников.', 'Заявка до', '2027-04-01'::date, false, false, 'Приём открывается в начале декабря 2026, рассмотрение с января, финальный срок 1 апр 2027. Срок на стипендию в 2026: 16 фев.', 'Northwestern University, Эванстон, США', 'Лето 2027, даты на сайте', 'GPA от 3.0.', 'н/д', 'Курсы по выбору', 'Стипендии есть; условия для иностранцев уточнить.', 'н/д', '2027 подтверждено', 'https://sps.northwestern.edu/college-preparation/admission.php', array['aid','humanities','science']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-dartmouth', 'summer-usa', 'Dartmouth Summer Scholars (через Summer Discovery)', 'Dartmouth Summer Scholars', 'Двухнедельная программа на кампусе Dartmouth, организует компания Summer Discovery.', 'Заявка до', '2026-12-15'::date, true, false, 'Приоритетный срок 15 дек 2026 (вторичный источник). Цикл 2026: 16 дек, 27 янв, 24 мар.', 'Dartmouth College, Ганновер, США', '2027: сессия 1 – 27 июн – 9 июл; сессия 2 – 4–16 июл', '15–18 лет.', 'н/д; депозит $1,500', 'Курсы по выбору', 'Помощь только для онлайн-формата.', '$100; для международных дополнительно $239', 'уточнить', 'https://www.summerdiscovery.com', array['humanities']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-rice', 'summer-usa', 'Rice Precollege (онлайн)', 'Rice Precollege', 'Онлайн-курсы Rice University для школьников.', 'Заявка до', '2027-06-01'::date, true, false, 'Набор по мере заполнения; точный срок не опубликован, дата ориентировочная.', 'Онлайн (Rice University, США)', 'Лето, даты курсов на сайте', 'От 13 лет.', '≈$1,795 за курс', 'Курсы по выбору', 'н/д', 'н/д', 'уточнить', 'https://precollege.rice.edu', array['science']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-ndss', 'summer-usa', 'Notre Dame Summer Scholars', 'Notre Dame Summer Scholars', 'Двухнедельная очная программа Notre Dame с университетским курсом.', 'Заявка до', '2027-02-17'::date, false, false, 'Приём открывается 19 окт 2026, срок 17 фев 2027.', 'University of Notre Dame, Индиана, США', '19 июн – 3 июл и 10–24 июл 2027', '10–11 класс; 16 лет к 1 авг 2027.', 'н/д, проверьте на сайте', 'Курсы по выбору', 'Помощь очень ограничена. Иностранные ученики приглашены (admissions.nd.edu).', 'н/д', '2027 подтверждено', 'https://precollege.nd.edu', array['humanities','science']::text[], 'strong', 'paid', 'Летние программы 2027', 'summer'),
  ('s-smith', 'summer-usa', 'Smith College Summer Programs (только для девушек)', 'Smith College Summer Programs', 'Двухнедельные программы Smith для девушек по науке, инженерии и гуманитарным темам.', 'Заявка до', '2027-03-01'::date, false, false, 'Приём открывается 10 дек 2026. Приоритетный срок 1 фев; для помощи и для иностранных учениц 1 мар; для американских 1 мая 2027.', 'Smith College, Нортгемптон, США', 'Summer Science & Engineering: 3–16 июл и 18–31 июл 2027', 'Девушки, 9–12 класс.', 'Sustainable Futures $4,985 (2026); Women, Gender & Representation $5,185 (2027)', 'Наука, инженерия, устойчивое развитие, гендерные исследования', 'Есть помощь по нужде (срок 1 мар).', '$50 / $75', '2027 подтверждено', 'https://www.smith.edu/academics/summer-programs', array['aid','science','humanities']::text[], 'strong', 'aid', 'Летние программы 2027', 'summer'),
  ('s-tass', 'summer-usa', 'Telluride Association Summer Seminar (TASS)', 'Telluride Association Summer Seminar', 'Бесплатный пятинедельный гуманитарный семинар для школьников; расходы покрывает ассоциация.', 'Заявка до', '2026-12-03'::date, true, false, 'Цикл 2026: срок 3 дек 2025. На сайте ассоциации сейчас баннер «An Important Message About TASS 2027», а в графике указано, что заявки 2027 открываются осенью 2026. Дата 3 дек условная: сверьте статус на сайте.', 'США (в 2025–2026 Cornell и University of Maryland)', 'Пять недель, июнь – июль 2027 (по графику ассоциации)', '10–11 класс; от 15 лет на старт и не старше 17 на конец; иностранные ученики допускаются.', 'Бесплатно; ассоциация покрывает обучение, проживание и питание', 'Гуманитарные и социальные науки: TASS-CBS и TASS-AOS', 'Для нуждающихся дополнительная помощь с дорогой и компенсация летнего заработка.', 'н/д', 'уточнить', 'https://www.tellurideassociation.org/our-programs/high-school-students/', array['free','humanities']::text[], 'top', 'free', 'Летние программы 2027', 'summer'),
  ('s-umass', 'summer-usa', 'UMass Amherst Pre-College', 'UMass Amherst Pre-College', 'Летние курсы UMass Amherst, отбор невысокий.', 'Заявка до', '2027-05-01'::date, true, false, 'Программы 2027 публикуются в конце декабря. Цикл 2025: сроки 1, 15 и 31 мая.', 'UMass Amherst, США', 'Лето 2027, даты на сайте', 'Школьники.', 'н/д', 'Курсы по выбору', 'н/д', '$45', 'цикл 2026', 'https://www.umass.edu/precollege', array['science']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-tufts', 'summer-usa', 'Tufts Pre-College (College Experience, Summer Research Experience)', 'Tufts Pre-College', 'Программы Tufts для школьников, включая исследовательскую.', 'Заявка до', '2027-05-01'::date, false, false, 'Приём открывается 14 дек 2026. Документы до 1 мая, оплата до 15 мая, формы до 1 июн.', 'Tufts University, Медфорд, США', 'Лето 2027, даты на сайте', 'Для College Experience и Summer Research Experience возможна виза F-1.', 'Цикл 2026: от $1,300 до $11,790 в зависимости от формата', 'Курсы по выбору, исследования', 'н/д', 'н/д', '2027 подтверждено', 'https://summer.tufts.edu', array['science','research']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-neu', 'summer-usa', 'Northeastern Pre-College', 'Northeastern Pre-College', 'Летние программы Northeastern для школьников.', 'Заявка до', '2027-01-15'::date, true, false, 'Цикл 2026: приём с начала декабря; приоритетный срок 15 янв, основной 27 фев, депозит 31 мар.', 'Northeastern University, Бостон, США', 'Лето 2027, даты на сайте', 'Школьники.', 'Цикл 2025: $6,895', 'Курсы по выбору', 'Иностранные ученики рассматриваются на помощь.', 'н/д', 'цикл 2026', 'https://summer.northeastern.edu', array['aid','science']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-bu', 'summer-usa', 'Boston University High School Honors', 'Boston University High School Honors', 'Университетские курсы BU для школьников.', 'Заявка до', '2027-03-14'::date, true, false, 'Заявка на 2027 публикуется 17 дек 2026. Цикл 2026: для международных 14 мар, финальный 29 мая.', 'Boston University, США', '27 июн – 6 авг 2027', 'Школьники; для иностранных нужна виза.', 'н/д; для I-20 в 2026 требовалось подтвердить ≈$12,190', 'Курсы по выбору', 'Иностранные ученики на помощь не допускаются.', '$75', 'уточнить', 'https://www.bu.edu/summer/high-school', array['science','humanities']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-usc', 'summer-usa', 'USC Summer Programs', 'USC Summer Programs', 'Четырёхнедельные программы USC для школьников.', 'Заявка до', '2027-03-12'::date, false, false, 'Для международных 12 мар 2027; для американских 7 мая 2027.', 'University of Southern California, Лос-Анджелес, США', '21 июн – 16 июл 2027', 'Школьники.', 'Для международных около $12,600 по счетам USC; депозит $1,000', 'Курсы по выбору', 'Помощи нет.', '$85', '2027 подтверждено', 'https://summer.usc.edu', array['science','business']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-usccinema', 'summer-usa', 'USC School of Cinematic Arts Summer Programs', 'USC School of Cinematic Arts Summer Programs', 'Кино и медиа, программы школы кинематографии USC.', 'Заявка до', '2027-03-15'::date, false, false, 'Приём с 1 дек 2026; для международных закрывается 15 мар 2027.', 'USC, Лос-Анджелес, США', '25 июн – 6 авг 2027', 'Школьники.', 'н/д', 'Кино, медиа', 'н/д', 'н/д', '2027 подтверждено', 'https://cinema.usc.edu/summer', array['humanities']::text[], 'paid', 'none', 'Летние программы 2027', 'summer'),
  ('s-ucla', 'summer-usa', 'UCLA Summer Institutes (SCIP)', 'UCLA Summer Institutes', 'Летние программы UCLA для школьников.', 'Заявка до', '2027-04-01'::date, true, false, 'Цикл 2026: для иностранных (виза) 1 апр, для американских 1 мая. Даты 2027 не опубликованы.', 'UCLA, Лос-Анджелес, США', 'Лето 2027, даты не опубликованы', '10–11 класс; GPA 3.8 и выше.', 'н/д', 'Курсы по выбору', 'Стипендии только для жителей Калифорнии.', 'н/д', 'цикл 2026', 'https://summer.ucla.edu', array['science']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-wake', 'summer-usa', 'Wake Forest Summer Immersion', 'Wake Forest Summer Immersion', 'Недельные тематические институты (более 25) в Wake Forest.', 'Заявка до', '2027-06-01'::date, true, false, 'Приём открывается 1 ноя; rolling, точный срок не указан, дата ориентировочная.', 'Wake Forest University, Северная Каролина, США', 'Например, Sports Business: старты 14 июн и 12 июл 2027 (вторичный источник)', 'Школьники.', 'Sports Business ≈$3,500 (вторичный источник)', 'Бизнес, спорт, науки, гуманитарные темы', 'Ограниченная помощь по нужде.', '$60', 'уточнить', 'https://summerimmersion.wfu.edu', array['business']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-cornell', 'summer-usa', 'Cornell University Pre-College', 'Cornell University Pre-College', 'Курсы Cornell с кредитами, очно и онлайн.', 'Заявка до', '2027-04-28'::date, true, false, 'Цикл 2026: приём с 12 янв, сроки примерно с 28 апр по 19 мая. Даты 2027 не опубликованы.', 'Cornell University, Итака, США (или онлайн)', 'Лето 2027, даты не опубликованы', 'Онлайн 15–19 лет; очно без проживания 16–19; с проживанием 16–18.', '$2,013 за кредит', 'Курсы по выбору', 'н/д', '$85', 'цикл 2026', 'https://sce.cornell.edu/precollege', array['science','humanities']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-nyuny', 'summer-usa', 'NYU New York: CREATE и Smart AI', 'NYU New York: CREATE и Smart AI', 'Короткие программы NYU: Coding for Game Design и Smart AI.', 'Заявка до', '2027-05-31'::date, false, false, 'Известен только срок заявки на стипендию CREATE: 31 мая 2027. Общий срок не найден.', 'NYU, Нью-Йорк, США', 'CREATE: 21 июн – 2 июл и 12–23 июл 2027; Smart AI: 26 июл – 6 авг 2027', 'Школьники.', 'н/д', 'Геймдизайн и кодинг; ИИ', 'У CREATE есть стипендия; условия для иностранцев уточнить.', 'н/д', 'уточнить', 'https://www.nyu.edu', array['aid','science']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-nyfa', 'summer-usa', 'New York Film Academy: Teens', 'New York Film Academy: Teens', 'Кино, актёрское мастерство и медиа для подростков, от 1 до 6 недель.', 'Заявка до', '2027-06-01'::date, true, false, 'Rolling; единого срока нет, дата ориентировочная. Депозит $500.', 'Нью-Йорк, Лос-Анджелес и другие кампусы NYFA', 'Старты с 27 июн по 1 авг 2027', '14–17 лет.', '1 неделя $1,725; 3 недели $3,725; 6 недель $6,225; скидка 10% за раннюю запись', 'Кино, актёрское мастерство, медиа', 'н/д', '$25', '2027 подтверждено', 'https://www.nyfa.edu/teens', array['humanities']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-parsons', 'summer-usa', 'Parsons Pre-College (New York)', 'Parsons Pre-College', 'Дизайн и искусство: трёхнедельный интенсив Parsons и Summer Academy.', 'Заявка до', '2027-04-01'::date, false, false, 'Приём с 1 нояб 2026. Для иностранных 1 апр, общий 1 мая. Summer Academy: срок 15 июл.', 'Parsons School of Design, Нью-Йорк (также Париж)', 'NY Summer Intensive: 28 июн – 16 июл 2027; Париж: 28 июн – 16 июл 2027', 'Intensive: 16–18 лет.', 'Summer Academy $1,780; Париж 2026: $9,999', 'Дизайн, мода, искусство', 'н/д', '$55', '2027 подтверждено', 'https://www.newschool.edu/parsons/pre-college', array['humanities']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-yspa', 'summer-usa', 'Yale Summer Program in Astrophysics (YSPA)', 'Yale Summer Program in Astrophysics', 'Селективная программа по астрофизике Yale на 32 места.', 'Заявка до', '2027-03-06'::date, true, false, 'Цикл 2026: срок 6 мар, без rolling. Заявки открываются в конце декабря. Даты 2027 не опубликованы.', 'Yale University, Нью-Хейвен, США', 'Цикл 2026: онлайн 22 июн – 3 июл, очно 5 июл – 2 авг', 'Будущий 12 класс; 15,5 лет к 5 июл.', '≈$8,000 (2025)', 'Астрофизика', 'н/д', 'н/д', 'цикл 2026', 'https://yspa.yale.edu', array['science','research']::text[], 'top', 'none', 'Летние программы 2027', 'summer'),
  ('s-spinwip', 'summer-usa', 'Stanford SPINWIP (физика для девушек, онлайн)', 'Stanford SPINWIP', 'Бесплатная трёхнедельная онлайн-программа Stanford по физике для девушек.', 'Заявка до', '2027-03-15'::date, true, false, 'Заявки на 2027 ещё не открыты: можно подписаться на рассылку на сайте. Дата условная, срок не объявлен.', 'Онлайн (Stanford University)', '3 недели, занятия с 9:00 до 13:00 по тихоокеанскому времени', 'Девушки и гендерные меньшинства, 9–11 класс; ученики из других стран приглашены.', 'Бесплатно', 'Физика', 'Программа бесплатная.', 'н/д', 'уточнить', 'https://kipac.stanford.edu/outreach-and-public-engagement-kipac/spinwip', array['free','science']::text[], 'strong', 'free', 'Летние программы 2027', 'summer'),
  ('s-ses', 'summer-usa', 'Santa Clara University Summer Engineering Seminar', 'Santa Clara University Summer Engineering Seminar', 'Пятидневный инженерный семинар; принимают учеников из разных стран.', 'Заявка до', '2027-03-15'::date, true, false, 'Заявки на 2027 открываются в декабре. Срок по вторичному источнику: середина марта.', 'Santa Clara University, Калифорния, США', 'Лето 2027, три сессии', 'Приоритет у 10 класса, ограниченно 11 класс; эссе.', 'н/д (вторичный источник: бесплатно)', 'Инженерия', 'н/д', 'н/д', 'уточнить', 'https://www.scu.edu/engineering/beyond-the-classroom/outreach/summer-engineering-seminar-ses/', array['science']::text[], 'strong', 'none', 'Летние программы 2027', 'summer'),
  ('s-shoals', 'summer-usa', 'Shoals Marine Laboratory: курсы для школьников', 'Shoals Marine Laboratory: курсы для школьников', 'Один–два недели морской биологии на острове Эпплдор, штат Мэн; 3 кредита Cornell.', 'Заявка до', '2027-02-14'::date, true, false, 'Обычно около 14 февраля; точный срок 2027 смотрите на странице High School Admissions.', 'Appledore Island, Мэн, США', 'Лето 2027, 1–2 недели', 'Школьники.', 'н/д', 'Морская биология, экология', 'Грантовые стипендии за заслуги со сроком; помощь по нужде по мере поступления заявок.', 'н/д', 'уточнить', 'https://shoalsmarinelaboratory.org/courses/high-school', array['aid','science']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-horizon', 'summer-res', 'Horizon Academic Research Program (HARP)', 'Horizon Academic Research Program', 'Онлайн-исследование с профессором или PhD, итог: работа на 20–25 страниц.', 'Заявка до', '2026-11-22'::date, false, false, 'Зимний набор закрылся 22 ноя 2026, старт 14 дек. У каждого набора свои приоритетный и финальный сроки, календарь на сайте.', 'Онлайн', 'Наборы: зима, весна, лето, осень', '9–12 класс, любая страна; чаще принимают 10–11 класс; опыт исследований не обязателен.', 'н/д (проверьте на сайте)', 'Исследовательская работа по выбранной теме', 'Лучшая заявка в наборе получает стипендию $3,000.', 'н/д', '2027 подтверждено', 'https://horizoninspires.com/faqs/', array['aid','research']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-lumiere', 'summer-res', 'Lumiere Research Scholar Program', 'Lumiere Research Scholar Program', 'Двенадцать недель онлайн-работы 1 на 1 с PhD-наставником, итог: исследовательская статья.', 'Заявка до', '2027-01-18'::date, true, false, 'На странице программ указан срок 18 янв 2027 (формулировка неоднозначна). Цикл 2026: ранний 8 фев, приоритетный 8 мар.', 'Онлайн', '12 недель, наборы в течение года', 'Школьники; отбор с интервью.', '$2,600–$8,400 в зависимости от трека (вторичный источник)', 'Исследовательский проект по любой теме', 'Помощь по нужде через Lumiere Research Inclusion Foundation.', 'н/д', 'уточнить', 'https://www.lumiere-education.com/programs', array['aid','research']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-gpsi', 'summer-res', 'Pioneer Global Problem-Solving Institute (GPSI)', 'Pioneer Global Problem-Solving Institute', 'Командная онлайн-программа Pioneer по глобальным проблемам с партнёром UNC Chapel Hill.', 'Заявка до', '2027-05-03'::date, true, false, 'Цикл 2026: летний срок 3 мая; осенний 12 июля. Для весеннего набора 2027 есть форма интереса.', 'Онлайн (Pioneer Academics)', 'Один академический семестр: весна, лето, осень', '9–12 класс со всего мира; транскрипт и оценка учителя; уровень английского для университетских курсов.', '$3,100, включая 2 кредита UNC Chapel Hill', 'ИИ, болезни, климат, вода, продовольствие', 'Pioneer обещает стипендии по нужде.', 'н/д', 'уточнить', 'https://pioneeracademics.com/the-global-problem-solving-institute/admission/', array['aid','research']::text[], 'paid', 'aid', 'Летние программы 2027', 'summer'),
  ('s-wss', 'summer-res', 'World Science Scholars', 'World Science Scholars', 'Бесплатная онлайн-программа World Science Festival для сильных в математике школьников.', 'Заявка до', '2027-04-15'::date, true, false, 'Цикл 2026: срок 15 апр. Заявки обычно открываются осенью и закрываются в середине апреля.', 'Онлайн (World Science Festival)', 'Весь учебный год, в среднем 2 часа в неделю', 'Школьники с выдающимися математическими способностями.', 'Бесплатно', 'Математика и современные науки с известными учёными', 'Программа бесплатная.', 'н/д', 'цикл 2026', 'https://www.worldsciencefestival.com/world-science-scholars-application', array['free','math','science','research']::text[], 'strong', 'free', 'Летние программы 2027', 'summer'),
  ('s-igem', 'summer-res', 'iGEM High School Competition', 'iGEM High School Competition', 'Командный проект по синтетической биологии на год, финал в Париже.', 'Заявка до', '2027-03-01'::date, true, false, 'Сроки 2027 официально не объявлены. Дата условная; следите за competition.igem.org.', 'Онлайн и Париж (Grand Jamboree)', 'Январь – ноябрь', 'Команда школьников, нужен школьный или внешний наставник.', 'Регистрационные взносы команды, размер на сайте', 'Синтетическая биология', 'н/д', 'н/д', 'уточнить', 'https://competition.igem.org', array['science','research']::text[], 'strong', 'paid', 'Летние программы 2027', 'summer'),
  ('s-issai', 'summer-res', 'NU ISSAI Summer Research Program', 'NU ISSAI Summer Research Program', 'Шестинедельные исследования по ИИ в институте ISSAI при Nazarbayev University.', 'Заявка до', '2027-03-15'::date, true, false, 'В 2025 заявки открылись 31 янв; в 2026 подано более 1200 заявок. Дата 2027 условная.', 'Nazarbayev University, Астана', 'Цикл 2026: с начала июня, 6 недель, финальные презентации 15 июля', 'Математика; программирование на Python желательно; английский не ниже среднего. В 2026 приняли 77 человек.', 'Для школьников бесплатно (правила NU)', 'ИИ, машинное обучение, робототехника', 'Есть стипендии для лучших участников.', 'н/д', 'цикл 2026', 'https://issai.nu.edu.kz/summer-research-program/', array['free','science','research']::text[], 'kz', 'free', 'Летние программы 2027', 'summer'),
  ('s-constructor', 'summer-eu', 'Constructor University Summer Camp', 'Constructor University Summer Camp', 'Двенадцатидневный лагерь в Бремене для школьников.', 'Заявка до', '2027-05-01'::date, true, false, 'Цикл 2026: срок 1 мая.', 'Constructor University, Бремен, Германия', '9–20 июля 2027', '16–18 лет; английский B2.', 'Цикл 2026: €4,600', 'Курсы по выбору', 'н/д', 'н/д', 'цикл 2026', 'https://constructor.university', array['science']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-bocconi', 'summer-eu', 'Bocconi Summer School (школьники)', 'Bocconi Summer School', 'Двухнедельная программа по экономике и управлению в Милане.', 'Заявка до', '2027-04-09'::date, true, false, 'В 2026 набор закрылся 9 апр, места закончились раньше. Даты 2027 не опубликованы.', 'Università Bocconi, Милан, Италия', 'Цикл 2026: 6–17 июля', 'От 15 лет.', 'Цикл 2025: €2,600 + проживание €1,600', 'Экономика, управление, право', 'н/д', 'н/д', 'цикл 2026', 'https://www.unibocconi.eu', array['business']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-esade', 'summer-eu', 'ESADE International Business Experience', 'ESADE International Business Experience', 'Трёхнедельная программа по бизнесу в Барселоне; есть вариант Global Governance & Law.', 'Заявка до', '2027-05-15'::date, false, false, 'Регистрация с 1 янв по 15 мая. Скидка €200 за раннюю запись до 1 апр.', 'ESADE, Барселона, Испания', '28 июн – 16 июл 2027', '15–17 лет (Global Governance & Law: 15–18).', '€3,300, с активностями €4,798', 'Бизнес; право и глобальное управление', 'н/д', 'н/д', '2027 подтверждено', 'https://www.esade.edu', array['business']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-ie', 'summer-eu', 'IE University Pre-University и Pre-Tracks', 'IE University Pre-University и Pre-Tracks', 'Двухнедельные программы IE в Мадриде и Сеговии.', 'Заявка до', '2027-06-01'::date, true, false, 'Срок в июне, набор по мере заполнения; видеооценка. Дата ориентировочная.', 'IE University, Мадрид / Сеговия, Испания', '27 июн – 9 июл и 11–23 июл 2027', 'Pre-University 14–16 / 15–17 лет; Pre-Tracks 16–17 лет.', 'Pre-Business €6,400 за 2 недели', 'Бизнес, право, технологии', 'Помощи нет.', 'н/д', '2027 подтверждено', 'https://www.ie.edu', array['business']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-eubs', 'summer-eu', 'EU Business School Summer', 'EU Business School Summer', 'Летние программы по бизнесу в Европе.', 'Заявка до', '2027-06-01'::date, true, false, 'Даты 2027 не опубликованы, дата ориентировочная.', 'Кампусы EU Business School, Европа', 'Цикл 2026: старты 5 июл, 19 июл, 2 авг', '15–18 лет; TOEFL 79 или IELTS 6.0.', 'Цикл 2026: €3,850', 'Бизнес', 'н/д', 'н/д', 'цикл 2026', 'https://www.euruni.edu', array['business']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-mpw', 'summer-eu', 'MPW London и Cambridge: летние курсы', 'MPW London и Cambridge: летние курсы', 'Двухнедельные курсы колледжа MPW.', 'Заявка до', '2027-01-08'::date, false, false, 'Записавшимся до 8 янв 2027 действуют прошлые цены. Проверьте на сайте.', 'MPW, Лондон и Кембридж, Великобритания', '27 июн – 10 июл; 11–24 июл; 25 июл – 7 авг 2027', 'Школьники.', 'С проживанием: Лондон £4,700, Кембридж £4,350; без: £2,850 / £2,400', 'Курсы по выбору', 'н/д', 'н/д', 'уточнить', 'https://www.mpw.ac.uk', array['humanities','science']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-dld', 'summer-eu', 'DLD College London Summer School', 'DLD College London Summer School', 'Летняя школа в Лондоне.', 'Заявка до', '2027-06-01'::date, true, false, 'Известны только цены 2026; сроки 2027 не опубликованы.', 'DLD College, Лондон, Великобритания', 'Не опубликованы', 'Школьники.', 'Цикл 2026, 2 недели: $4,020 без проживания, $6,700 с проживанием', 'Курсы по выбору', 'н/д', 'н/д', 'цикл 2026', 'https://www.dldcollege.co.uk', array['humanities']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-toronto', 'summer-eu', 'New College International Summer Academy (Торонто)', 'New College International Summer Academy', 'Трёхнедельная академия в University of Toronto.', 'Заявка до', '2027-07-01'::date, true, false, 'Цикл 2025: срок 1 июля. Брошюра 2027 есть, срок уточнить.', 'New College, University of Toronto, Канада', 'Цикл 2025: 13 июля – 2 августа', '15–18 лет.', 'Цикл 2025: CAD 6,500', 'Курсы по выбору', 'н/д', 'н/д', 'цикл 2026', 'https://newcollege.utoronto.ca', array['humanities']::text[], 'open', 'paid', 'Летние программы 2027', 'summer'),
  ('s-polyu', 'summer-hk', 'PolyU Summer Institute', 'PolyU Summer Institute', 'Пятидневный лагерь с проживанием плюс курс по предмету.', 'Заявка до', '2027-05-15'::date, true, false, 'Набор 2027 не объявлен, дата условная. Контакт: polyu.si@polyu.edu.hk.', 'Hong Kong Polytechnic University, Гонконг', 'Цикл 2026: 27 июля – 7 августа', 'Secondary 4–5 или эквивалент.', 'н/д', 'Курсы по выбору', 'н/д', 'н/д', 'цикл 2026', 'https://www.polyu.edu.hk', array['science']::text[], 'paid', 'paid', 'Летние программы 2027', 'summer'),
  ('s-uwc', 'summer-kz', 'UWC Kazakhstan (двухлетняя IB-программа, не лето)', 'UWC Kazakhstan', 'Отбор на стипендии в школы UWC по всему миру, обучение начинается осенью 2027.', 'Заявка до', '2026-12-20'::date, false, false, 'Заявки с 1 ноя по 20 дек 2026, интервью 5–25 янв. Это двухлетняя школьная программа, а не летняя.', 'Колледжи UWC по всему миру', 'Осень 2027, 2 года', 'Через национальный комитет Казахстана.', 'Определяется финансовой оценкой', 'IB Diploma', 'Стипендия зависит от нужды; от частичной до полной.', 'н/д', '2027 подтверждено', 'https://kz.uwc.org/how-to-apply', array['aid']::text[], 'strong', 'aid', 'Летние программы 2027', 'summer')
on conflict (id) do update set section = excluded.section, name = excluded.name, short_name = excluded.short_name, description = excluded.description, kind = excluded.kind, due_date = excluded.due_date, approx = excluded.approx, next_cycle = excluded.next_cycle, date_note = excluded.date_note, location = excluded.location, stages = excluded.stages, grades = excluded.grades, price = excluded.price, topics = excluded.topics, gives = excluded.gives, how = excluded.how, status = excluded.status, url = excluded.url, tags = excluded.tags, tier = excluded.tier, money = excluded.money, source = excluded.source, program_type = excluded.program_type, updated_at = now();

-- ════════════════════════════════════════════════════════════
-- migration-books.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — отзывы на книги и книжный рейтинг
-- Ученик отмечает книгу «Прочитано» и пишет короткий отзыв → ментор засчитывает или возвращает.
-- В рейтинг идут только засчитанные книги.
-- Файл можно запускать повторно.

create table if not exists public.book_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  -- id книги из списка ученика (students.books[].id)
  book_id text not null,
  title text not null default '',
  author text not null default '',
  review text not null default '',
  status text not null default 'submitted'
    check (status in ('submitted', 'accepted', 'revision')),
  mentor_comment text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, book_id)
);

create index if not exists book_reports_student_idx on public.book_reports (student_id);
create index if not exists book_reports_status_idx on public.book_reports (status);

drop trigger if exists book_reports_set_updated_at on public.book_reports;
create trigger book_reports_set_updated_at
before update on public.book_reports
for each row execute function public.set_updated_at();

alter table public.book_reports enable row level security;

drop policy if exists "book_reports_select" on public.book_reports;
create policy "book_reports_select" on public.book_reports for select to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "book_reports_insert" on public.book_reports;
create policy "book_reports_insert" on public.book_reports for insert to authenticated
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "book_reports_update" on public.book_reports;
create policy "book_reports_update" on public.book_reports for update to authenticated
using (public.is_admin() or student_id = public.current_user_student_id())
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "book_reports_delete" on public.book_reports;
create policy "book_reports_delete" on public.book_reports for delete to authenticated
using (public.is_admin() or (student_id = public.current_user_student_id() and status <> 'accepted'));

grant select, insert, update, delete on public.book_reports to authenticated;

-- Ученик только отправляет отзыв; засчитывает и возвращает — только ментор
create or replace function public.enforce_book_report_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'UPDATE' and new.status in ('accepted', 'revision') and new.status is distinct from old.status then
      new.reviewed_at := now();
    elsif tg_op = 'INSERT' and new.status in ('accepted', 'revision') and new.reviewed_at is null then
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if length(btrim(coalesce(new.review, ''))) < 40 then
    raise exception 'Напиши отзыв подробнее: о чём книга и что ты из неё взял' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'submitted' or coalesce(new.mentor_comment, '') <> '' or new.reviewed_at is not null then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    new.submitted_at := now();
  else
    if old.status = 'accepted' then
      raise exception 'Книга уже засчитана' using errcode = '42501';
    end if;
    if new.status <> 'submitted'
       or new.student_id is distinct from old.student_id
       or new.book_id is distinct from old.book_id then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    -- комментарий и дату проверки ментора ученик не трогает
    new.mentor_comment := old.mentor_comment;
    new.reviewed_at := old.reviewed_at;
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists book_reports_rights on public.book_reports;
create trigger book_reports_rights
before insert or update on public.book_reports
for each row execute function public.enforce_book_report_rights();

-- Место ученика в книжном рейтинге (без чужих имён)
create or replace function public.my_book_rank()
returns table (accepted integer, place integer, total_students integer)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select s.id as student_id,
           count(b.id) filter (where b.status = 'accepted') as accepted
    from public.students s
    left join public.book_reports b on b.student_id = s.id
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

grant execute on function public.my_book_rank() to authenticated;

-- Для родителя по ссылке: какие книги засчитаны и отзывы
create or replace function public.get_book_reports_by_parent_token(p_token text)
returns setof public.book_reports
language sql
stable
security definer
set search_path = public
as $$
  select b.*
  from public.book_reports b
  join public.students s on s.id = b.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token;
$$;

grant execute on function public.get_book_reports_by_parent_token(text) to anon, authenticated;

-- Журнал действий (если подключена история)
do $$
begin
  if to_regprocedure('public.log_change()') is not null then
    drop trigger if exists book_reports_activity on public.book_reports;
    create trigger book_reports_activity
    after insert or update or delete on public.book_reports
    for each row execute function public.log_change();
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- migration-sat-1.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — SAT, этап 1: роли, права, курсы, группы
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно. Менторские таблицы не меняются.
-- Откат: rollback-sat-1.sql
--
-- Что добавляет:
--   1. Сотрудники и роли: руководитель, ментор, куратор SAT, учитель SAT, старший учитель SAT.
--      Нынешний админ становится «руководитель + ментор».
--   2. Функции прав: is_head(), has_staff_role(), can_view_student(), can_edit_group(), can_manage_sat().
--      is_admin() по-прежнему = «видит менторскую часть» (руководитель или ментор), но отключённый сотрудник — уже нет.
--   3. Курсы, потоки, группы, учителя/кураторы групп с датами, зачисления учеников (цель, дата SAT).
--   4. Журнал изменений сотрудников.

-- 0) profiles: новая роль staff (сотрудник без менторского доступа) -------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'admin', 'staff'));

-- 1) Сотрудники -----------------------------------------------------------------
create table if not exists public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  city text not null default '',
  active boolean not null default true,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_roles (
  user_id uuid not null references public.staff_members (user_id) on delete cascade,
  role text not null check (role in ('head', 'mentor', 'sat_curator', 'sat_teacher', 'sat_senior_teacher')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.staff_audit (
  id bigserial primary key,
  actor_id uuid,
  actor_name text not null default '',
  target_id uuid,
  target_name text not null default '',
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists staff_audit_created_idx on public.staff_audit (created_at desc);

drop trigger if exists staff_members_set_updated_at on public.staff_members;
create trigger staff_members_set_updated_at
before update on public.staff_members
for each row execute function public.set_updated_at();

-- Нынешние админы → руководитель + ментор
insert into public.staff_members (user_id, full_name)
select p.id, p.full_name from public.profiles p
where p.role = 'admin'
on conflict (user_id) do nothing;

insert into public.staff_roles (user_id, role)
select p.id, r.role
from public.profiles p
cross join (values ('head'), ('mentor')) as r(role)
where p.role = 'admin'
  and not exists (select 1 from public.staff_roles s where s.user_id = p.id)
on conflict do nothing;

-- 2) Функции прав ---------------------------------------------------------------
create or replace function public.is_active_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff_members
    where user_id = auth.uid() and active
  );
$$;

create or replace function public.has_staff_role(p_role text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.staff_roles r
    join public.staff_members m on m.user_id = r.user_id
    where r.user_id = auth.uid() and m.active and r.role = p_role
  );
$$;

create or replace function public.is_head()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_staff_role('head');
$$;

-- Менторский доступ (как раньше), но отключённый сотрудник его теряет сразу.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
      and not exists (
        select 1 from public.staff_members m
        where m.user_id = p.id and not m.active
      )
  );
$$;

create or replace function public.is_sat_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_staff_role('sat_teacher')
      or public.has_staff_role('sat_senior_teacher')
      or public.has_staff_role('sat_curator');
$$;

-- Создавать группы и потоки, назначать учителей, править любую SAT-группу
create or replace function public.can_manage_sat()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_head() or public.has_staff_role('sat_senior_teacher');
$$;

-- 3) Курсы, потоки, группы --------------------------------------------------------
create table if not exists public.courses (
  id text primary key,
  name text not null,
  sort integer not null default 0,
  active boolean not null default true
);

insert into public.courses (id, name, sort) values
  ('mentoring', 'Менторство', 1),
  ('sat', 'SAT', 2)
on conflict (id) do nothing;

create table if not exists public.streams (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses (id),
  name text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses (id),
  stream_id uuid references public.streams (id) on delete set null,
  name text not null,
  city text not null default '',
  note text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists groups_stream_idx on public.groups (stream_id);

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

-- Учитель / куратор группы с датами. Замена учителя = закрыть строку датой + новая строка.
create table if not exists public.group_staff (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.staff_members (user_id) on delete cascade,
  role text not null check (role in ('teacher', 'curator')),
  starts_on date not null default current_date,
  ends_on date,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists group_staff_group_idx on public.group_staff (group_id);
create index if not exists group_staff_user_idx on public.group_staff (user_id);

-- Зачисление ученика на курс. Перевод в другую группу = закрыть зачисление датой + новое.
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  course_id text not null references public.courses (id),
  group_id uuid references public.groups (id) on delete restrict,
  starts_on date not null default current_date,
  ends_on date,
  end_reason text check (end_reason in ('transfer', 'left', 'finished')),
  target_score integer check (target_score between 400 and 1600),
  sat_date date,
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists enrollments_student_idx on public.enrollments (student_id);
create index if not exists enrollments_group_idx on public.enrollments (group_id);
-- Одно действующее зачисление на курс у ученика
create unique index if not exists enrollments_one_active_idx
  on public.enrollments (student_id, course_id) where ends_on is null;

drop trigger if exists enrollments_set_updated_at on public.enrollments;
create trigger enrollments_set_updated_at
before update on public.enrollments
for each row execute function public.set_updated_at();

-- Курс зачисления всегда берётся из группы
create or replace function public.enrollment_course_from_group()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.group_id is not null then
    select course_id into new.course_id from public.groups where id = new.group_id;
  end if;
  return new;
end;
$$;

drop trigger if exists enrollments_course_from_group on public.enrollments;
create trigger enrollments_course_from_group
before insert or update of group_id, course_id on public.enrollments
for each row execute function public.enrollment_course_from_group();

-- Все нынешние ученики — менторские. Делается один раз (пока нет ни одного зачисления на менторство),
-- чтобы при повторном запуске не зачислить на менторство учеников, созданных только для SAT.
do $$
begin
  if not exists (select 1 from public.enrollments where course_id = 'mentoring') then
    insert into public.enrollments (student_id, course_id, starts_on)
    select s.id, 'mentoring', s.created_at::date
    from public.students s
    where not exists (select 1 from public.enrollments e where e.student_id = s.id);
  end if;
end $$;

-- 4) Функции прав на учеников и группы -------------------------------------------
create or replace function public.can_view_student(p_student uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or public.is_head()
      or p_student = public.current_user_student_id()
      or (
        public.is_sat_staff()
        and exists (
          select 1 from public.enrollments e
          where e.student_id = p_student and e.course_id = 'sat'
        )
      );
$$;

create or replace function public.can_edit_group(p_group uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_head()
      or (
        public.has_staff_role('sat_senior_teacher')
        and exists (select 1 from public.groups g where g.id = p_group and g.course_id = 'sat')
      )
      or (
        public.is_active_staff()
        and exists (
          select 1 from public.group_staff gs
          where gs.group_id = p_group
            and gs.user_id = auth.uid()
            and gs.starts_on <= current_date
            and (gs.ends_on is null or gs.ends_on >= current_date)
        )
      );
$$;

-- 5) Защита ролей ------------------------------------------------------------------
-- Нельзя оставить сайт без руководителя
create or replace function public.ensure_head_remains()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_was_head boolean;
begin
  -- Проверяем только когда изменение касается действующего руководителя
  if tg_table_name = 'staff_roles' then
    v_was_head := old.role = 'head';
  else
    v_was_head := old.active and exists (
      select 1 from public.staff_roles r where r.user_id = old.user_id and r.role = 'head'
    );
  end if;
  if not v_was_head then
    return null;
  end if;
  if not exists (
    select 1 from public.staff_roles r
    join public.staff_members m on m.user_id = r.user_id
    where r.role = 'head' and m.active
  ) then
    raise exception 'Нельзя убрать последнего руководителя' using errcode = '42501';
  end if;
  return null;
end;
$$;

drop trigger if exists staff_roles_keep_head on public.staff_roles;
create trigger staff_roles_keep_head
after delete on public.staff_roles
for each row execute function public.ensure_head_remains();

drop trigger if exists staff_members_keep_head on public.staff_members;
create trigger staff_members_keep_head
after update of active on public.staff_members
for each row execute function public.ensure_head_remains();

-- profiles.role сотрудника следует за ролями: руководитель/ментор → admin, иначе staff
create or replace function public.sync_staff_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  perform set_config('sp.sync_role', 'on', true);
  update public.profiles p
  set role = case
    when exists (
      select 1 from public.staff_roles r
      where r.user_id = v_user and r.role in ('head', 'mentor')
    ) then 'admin'
    else 'staff'
  end
  where p.id = v_user and p.role in ('admin', 'staff');
  perform set_config('sp.sync_role', 'off', true);
  return null;
end;
$$;

drop trigger if exists staff_roles_sync_profile on public.staff_roles;
create trigger staff_roles_sync_profile
after insert or delete or update on public.staff_roles
for each row execute function public.sync_staff_profile_role();

-- Роль в profiles меняет только руководитель (или сервер / SQL Editor)
create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_head()
     and current_setting('sp.sync_role', true) is distinct from 'on' then
    raise exception 'Роль меняет только руководитель на странице «Команда»' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_role_change on public.profiles;
create trigger profiles_enforce_role_change
before update of role on public.profiles
for each row execute function public.enforce_profile_role_change();

-- 6) Регистрация: сотрудник (метка от сервера в app_metadata) не получает карточку ученика
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
  -- raw_app_meta_data может задать только сервер с service role, не сам пользователь
  if coalesce(new.raw_app_meta_data->>'account_type', '') = 'staff' then
    insert into public.profiles (id, role, full_name, student_id)
    values (new.id, 'staff', v_full_name, null)
    on conflict (id) do nothing;
    return new;
  end if;

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

-- 7) RLS ------------------------------------------------------------------------------
alter table public.staff_members enable row level security;
alter table public.staff_roles enable row level security;
alter table public.staff_audit enable row level security;
alter table public.courses enable row level security;
alter table public.streams enable row level security;
alter table public.groups enable row level security;
alter table public.group_staff enable row level security;
alter table public.enrollments enable row level security;

-- Сотрудники: список видят все сотрудники (для выбора учителя), меняет только сервер
drop policy if exists "staff_members_select" on public.staff_members;
create policy "staff_members_select" on public.staff_members for select to authenticated
using (user_id = auth.uid() or public.is_admin() or public.is_active_staff());

drop policy if exists "staff_roles_select" on public.staff_roles;
create policy "staff_roles_select" on public.staff_roles for select to authenticated
using (user_id = auth.uid() or public.is_admin() or public.is_active_staff());

drop policy if exists "staff_audit_select" on public.staff_audit;
create policy "staff_audit_select" on public.staff_audit for select to authenticated
using (public.is_head());

-- Курсы
drop policy if exists "courses_select" on public.courses;
create policy "courses_select" on public.courses for select to authenticated using (true);

drop policy if exists "courses_write" on public.courses;
create policy "courses_write" on public.courses for all to authenticated
using (public.is_head()) with check (public.is_head());

-- Потоки и группы: видят сотрудники и зачисленные ученики
drop policy if exists "streams_select" on public.streams;
create policy "streams_select" on public.streams for select to authenticated
using (
  public.is_admin() or public.is_active_staff()
  or exists (
    select 1 from public.enrollments e
    join public.groups g on g.id = e.group_id
    where g.stream_id = streams.id and e.student_id = public.current_user_student_id()
  )
);

drop policy if exists "streams_write" on public.streams;
create policy "streams_write" on public.streams for all to authenticated
using (public.is_head() or (course_id = 'sat' and public.can_manage_sat()))
with check (public.is_head() or (course_id = 'sat' and public.can_manage_sat()));

drop policy if exists "groups_select" on public.groups;
create policy "groups_select" on public.groups for select to authenticated
using (
  public.is_admin() or public.is_active_staff()
  or exists (
    select 1 from public.enrollments e
    where e.group_id = groups.id and e.student_id = public.current_user_student_id()
  )
);

drop policy if exists "groups_write" on public.groups;
create policy "groups_write" on public.groups for all to authenticated
using (public.is_head() or (course_id = 'sat' and public.can_manage_sat()))
with check (public.is_head() or (course_id = 'sat' and public.can_manage_sat()));

-- Учителя групп: видят сотрудники; назначает руководитель / старший учитель
drop policy if exists "group_staff_select" on public.group_staff;
create policy "group_staff_select" on public.group_staff for select to authenticated
using (public.is_admin() or public.is_active_staff());

drop policy if exists "group_staff_write" on public.group_staff;
create policy "group_staff_write" on public.group_staff for all to authenticated
using (
  public.is_head()
  or (public.can_manage_sat() and exists (select 1 from public.groups g where g.id = group_staff.group_id and g.course_id = 'sat'))
)
with check (
  public.is_head()
  or (public.can_manage_sat() and exists (select 1 from public.groups g where g.id = group_staff.group_id and g.course_id = 'sat'))
);

-- Зачисления: видит тот, кто видит ученика; меняет тот, кто правит группу
drop policy if exists "enrollments_select" on public.enrollments;
create policy "enrollments_select" on public.enrollments for select to authenticated
using (
  public.is_admin() or public.is_head()
  or student_id = public.current_user_student_id()
  -- сотрудники SAT видят только SAT-зачисления, не менторские
  or (course_id = 'sat' and public.is_sat_staff())
);

drop policy if exists "enrollments_insert" on public.enrollments;
create policy "enrollments_insert" on public.enrollments for insert to authenticated
with check (
  public.is_head()
  or (group_id is not null and public.can_edit_group(group_id))
);

drop policy if exists "enrollments_update" on public.enrollments;
create policy "enrollments_update" on public.enrollments for update to authenticated
using (public.is_head() or (group_id is not null and public.can_edit_group(group_id)))
with check (public.is_head() or (group_id is not null and public.can_edit_group(group_id)));

drop policy if exists "enrollments_delete" on public.enrollments;
create policy "enrollments_delete" on public.enrollments for delete to authenticated
using (public.is_head() or (course_id = 'sat' and public.can_manage_sat()));

grant select on public.staff_members, public.staff_roles, public.staff_audit to authenticated;
grant select, insert, update, delete on public.courses, public.streams, public.groups,
  public.group_staff, public.enrollments to authenticated;

-- 8) Функции для страниц ----------------------------------------------------------------

-- Перевод ученика в другую группу с даты: старое зачисление закрывается, создаётся новое
create or replace function public.transfer_enrollment(p_enrollment uuid, p_group uuid, p_date date)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_old public.enrollments;
  v_new_course text;
  v_id uuid;
begin
  select * into v_old from public.enrollments where id = p_enrollment for update;
  if not found then raise exception 'Зачисление не найдено'; end if;
  if v_old.ends_on is not null then raise exception 'Зачисление уже закрыто'; end if;
  if v_old.group_id is not distinct from p_group then raise exception 'Ученик уже в этой группе'; end if;
  if not (public.is_head() or (
      (v_old.group_id is null or public.can_edit_group(v_old.group_id))
      and public.can_edit_group(p_group))) then
    raise exception 'Недостаточно прав для перевода' using errcode = '42501';
  end if;
  select course_id into v_new_course from public.groups where id = p_group;
  if v_new_course is distinct from v_old.course_id then
    raise exception 'Группа другого курса';
  end if;
  if p_date < v_old.starts_on then
    raise exception 'Дата перевода раньше даты зачисления';
  end if;

  update public.enrollments
  set ends_on = p_date, end_reason = 'transfer'
  where id = p_enrollment;

  insert into public.enrollments (student_id, course_id, group_id, starts_on, target_score, sat_date, note, created_by)
  values (v_old.student_id, v_old.course_id, p_group, p_date, v_old.target_score, v_old.sat_date, v_old.note, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Замена учителя/куратора группы с даты
create or replace function public.replace_group_staff(p_group uuid, p_role text, p_user uuid, p_date date)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.is_head() or (public.can_manage_sat()
      and exists (select 1 from public.groups where id = p_group and course_id = 'sat'))) then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;
  if p_role not in ('teacher', 'curator') then raise exception 'Неизвестная роль'; end if;

  -- Будущие назначения этой роли, начинающиеся с даты замены и позже, отменяются
  delete from public.group_staff
  where group_id = p_group and role = p_role and starts_on >= p_date;

  update public.group_staff
  set ends_on = p_date - 1
  where group_id = p_group and role = p_role
    and (ends_on is null or ends_on >= p_date);

  if p_user is not null then
    insert into public.group_staff (group_id, user_id, role, starts_on, created_by)
    values (p_group, p_user, p_role, p_date, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Поиск учеников для зачисления (имя, класс, школа — без менторских данных)
create or replace function public.search_students_for_enrollment(p_query text)
returns table (id uuid, full_name text, class_name text, school text)
language sql stable security definer set search_path = public
as $$
  select s.id, trim(s.last_name || ' ' || s.first_name), s.class_name, s.school
  from public.students s
  where (public.can_manage_sat() or public.is_head() or exists (
          select 1 from public.group_staff gs
          where gs.user_id = auth.uid() and (gs.ends_on is null or gs.ends_on >= current_date)
        ))
    and public.is_active_staff()
    and length(trim(coalesce(p_query, ''))) >= 2
    and (s.first_name || ' ' || s.last_name || ' ' || s.last_name || ' ' || s.first_name || ' ' || s.email)
        ilike '%' || trim(p_query) || '%'
  order by s.last_name, s.first_name
  limit 20;
$$;

-- Все ученики SAT (действующие зачисления) с именами — для страницы групп
create or replace function public.sat_roster()
returns table (
  enrollment_id uuid, student_id uuid, full_name text, class_name text, school text,
  group_id uuid, starts_on date, target_score integer, sat_date date, note text
)
language sql stable security definer set search_path = public
as $$
  select e.id, s.id, trim(s.last_name || ' ' || s.first_name), s.class_name, s.school,
         e.group_id, e.starts_on, e.target_score, e.sat_date, e.note
  from public.enrollments e
  join public.students s on s.id = e.student_id
  where e.course_id = 'sat' and e.ends_on is null
    and (public.is_head() or public.is_sat_staff())
  order by s.last_name, s.first_name;
$$;

-- Курсы ученика для вкладок кабинета: группа, учитель, куратор, цель, дата SAT
create or replace function public.student_courses(p_student uuid)
returns table (
  enrollment_id uuid, course_id text, course_name text, group_name text, stream_name text,
  teacher_name text, curator_name text, starts_on date, target_score integer, sat_date date
)
language sql stable security definer set search_path = public
as $$
  select e.id, c.id, c.name, g.name, st.name,
    (select string_agg(m.full_name, ', ') from public.group_staff gs
       join public.staff_members m on m.user_id = gs.user_id
       where gs.group_id = e.group_id and gs.role = 'teacher'
         and gs.starts_on <= current_date and (gs.ends_on is null or gs.ends_on >= current_date)),
    (select string_agg(m.full_name, ', ') from public.group_staff gs
       join public.staff_members m on m.user_id = gs.user_id
       where gs.group_id = e.group_id and gs.role = 'curator'
         and gs.starts_on <= current_date and (gs.ends_on is null or gs.ends_on >= current_date)),
    e.starts_on, e.target_score, e.sat_date
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  left join public.groups g on g.id = e.group_id
  left join public.streams st on st.id = g.stream_id
  where e.student_id = p_student and e.ends_on is null
    and public.can_view_student(p_student)
  order by c.sort;
$$;

revoke execute on function public.transfer_enrollment(uuid, uuid, date) from public, anon;
revoke execute on function public.replace_group_staff(uuid, text, uuid, date) from public, anon;
revoke execute on function public.search_students_for_enrollment(text) from public, anon;
revoke execute on function public.sat_roster() from public, anon;
revoke execute on function public.student_courses(uuid) from public, anon;
grant execute on function public.transfer_enrollment(uuid, uuid, date) to authenticated;
grant execute on function public.replace_group_staff(uuid, text, uuid, date) to authenticated;
grant execute on function public.search_students_for_enrollment(text) to authenticated;
grant execute on function public.sat_roster() to authenticated;
grant execute on function public.student_courses(uuid) to authenticated;

-- Проверка: кто руководитель
-- select m.full_name, r.role from public.staff_roles r join public.staff_members m using (user_id) order by 1;

-- ════════════════════════════════════════════════════════════
-- migration-sat-2.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — SAT, этап 2: расписание, занятия, отметки
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Нужен migration-sat-1.sql. Файл можно запускать повторно. Откат: rollback-sat-2.sql
--
-- Что добавляет:
--   1. Длительность потока в неделях («неделя 5 из 12»).
--   2. Расписание группы (день недели, время, длительность, предмет).
--   3. Занятия: создаются из расписания сами, их можно перенести, отменить, дать замену учителя,
--      добавить внеплановое.
--   4. Отметки за занятие: присутствие (был / опоздал / нет), ДЗ (сдал / частично / нет),
--      активность (высокая / средняя / низкая). Править отметки можно 3 дня после занятия
--      (руководитель и старший учитель — без ограничения).
--   5. Посещаемость и ДЗ в процентах для ученика и группы.

-- 0) Сегодня по Астане (сервер базы живёт в UTC)
create or replace function public.local_today()
returns date
language sql stable
as $$
  select (now() at time zone 'Asia/Almaty')::date;
$$;

-- 1) Поток: сколько недель
alter table public.streams add column if not exists weeks_total integer;
alter table public.streams drop constraint if exists streams_weeks_total_check;
alter table public.streams add constraint streams_weeks_total_check
  check (weeks_total is null or weeks_total between 1 and 104);

-- 2) Расписание группы ---------------------------------------------------------------
create table if not exists public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = понедельник
  starts_at time not null,
  duration_min integer not null default 90 check (duration_min between 15 and 300),
  title text not null default '',
  valid_from date not null default public.local_today(),
  valid_to date,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists schedule_slots_group_idx on public.schedule_slots (group_id);

-- 3) Занятия -------------------------------------------------------------------------
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  slot_id uuid references public.schedule_slots (id) on delete set null,
  slot_date date,                       -- дата по расписанию (не меняется при переносе)
  lesson_date date not null,
  starts_at time not null,
  duration_min integer not null default 90 check (duration_min between 15 and 300),
  title text not null default '',
  topic text not null default '',
  status text not null default 'planned' check (status in ('planned', 'cancelled')),
  moved_from text not null default '',  -- «вт 10 нояб. 17:00», если перенесено
  teacher_id uuid references public.staff_members (user_id) on delete set null, -- замена на это занятие
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lessons_slot_date_idx on public.lessons (slot_id, slot_date);
create index if not exists lessons_group_date_idx on public.lessons (group_id, lesson_date);
create index if not exists lessons_date_idx on public.lessons (lesson_date);

drop trigger if exists lessons_set_updated_at on public.lessons;
create trigger lessons_set_updated_at
before update on public.lessons
for each row execute function public.set_updated_at();

-- Занятие нельзя перенести в другую группу или отвязать от расписания
create or replace function public.protect_lesson_identity()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and (
       new.group_id is distinct from old.group_id
       or new.slot_id is distinct from old.slot_id
       or new.slot_date is distinct from old.slot_date) then
    raise exception 'Группу и расписание занятия менять нельзя' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists lessons_protect_identity on public.lessons;
create trigger lessons_protect_identity
before update on public.lessons
for each row execute function public.protect_lesson_identity();

-- 4) Отметки ---------------------------------------------------------------------------
create table if not exists public.lesson_marks (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  attendance text check (attendance in ('present', 'late', 'absent')),
  homework text check (homework in ('done', 'partial', 'none')),
  activity text check (activity in ('high', 'mid', 'low')),
  comment text not null default '',
  marked_by uuid,
  updated_at timestamptz not null default now(),
  primary key (lesson_id, student_id)
);
create index if not exists lesson_marks_student_idx on public.lesson_marks (student_id);

drop trigger if exists lesson_marks_set_updated_at on public.lesson_marks;
create trigger lesson_marks_set_updated_at
before update on public.lesson_marks
for each row execute function public.set_updated_at();

-- 5) Права на занятия ----------------------------------------------------------------------

-- Кто ведёт группу в конкретный день
create or replace function public.is_group_staff_on(p_group uuid, p_date date)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_active_staff() and exists (
    select 1 from public.group_staff gs
    where gs.group_id = p_group and gs.user_id = auth.uid()
      and gs.starts_on <= p_date and (gs.ends_on is null or gs.ends_on >= p_date)
  );
$$;

-- Отмечать и править занятие: руководитель, старший учитель (SAT), учитель/куратор группы
-- на дату занятия, учитель на замене
create or replace function public.can_mark_lesson(p_lesson uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.lessons l
    join public.groups g on g.id = l.group_id
    where l.id = p_lesson
      and (
        public.is_head()
        or (g.course_id = 'sat' and public.has_staff_role('sat_senior_teacher'))
        or public.is_group_staff_on(l.group_id, l.lesson_date)
        or (l.teacher_id = auth.uid() and public.is_active_staff())
      )
  );
$$;

-- Окно правки отметок: 3 дня после занятия; будущие занятия не отмечаются
create or replace function public.enforce_mark_window()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_date date;
begin
  select lesson_date into v_date from public.lessons
  where id = coalesce(new.lesson_id, old.lesson_id);
  if v_date > public.local_today() then
    raise exception 'Занятие ещё не прошло — отметить можно в день занятия' using errcode = '42501';
  end if;
  if auth.uid() is not null
     and not (public.is_head() or public.has_staff_role('sat_senior_teacher'))
     and v_date < public.local_today() - 3 then
    raise exception 'Прошло больше 3 дней — исправить отметки может старший учитель или руководитель'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.marked_by := coalesce(auth.uid(), new.marked_by);
  return new;
end;
$$;

drop trigger if exists lesson_marks_window on public.lesson_marks;
create trigger lesson_marks_window
before insert or update or delete on public.lesson_marks
for each row execute function public.enforce_mark_window();

-- Изменения расписания: будущие неотмеченные занятия этого слота пересоздаются заново
create or replace function public.reset_future_slot_lessons()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_slot uuid := coalesce(new.id, old.id);
begin
  delete from public.lessons l
  where l.slot_id = v_slot
    and l.lesson_date >= public.local_today()
    and l.moved_from = '' and l.status = 'planned' and l.teacher_id is null and l.topic = ''
    and not exists (select 1 from public.lesson_marks m where m.lesson_id = l.id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists schedule_slots_reset_lessons on public.schedule_slots;
create trigger schedule_slots_reset_lessons
before update or delete on public.schedule_slots
for each row execute function public.reset_future_slot_lessons();

-- 6) Создание занятий из расписания на период (не дальше 4 недель вперёд) ------------------
create or replace function public.ensure_lessons(p_from date, p_to date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_from date := greatest(p_from, public.local_today() - 120);
  v_to date := least(p_to, public.local_today() + 28);
  v_count integer;
begin
  if auth.uid() is null or v_from > v_to then
    return 0;
  end if;
  insert into public.lessons (group_id, slot_id, slot_date, lesson_date, starts_at, duration_min, title)
  select s.group_id, s.id, d::date, d::date, s.starts_at, s.duration_min, s.title
  from public.schedule_slots s
  join public.groups g on g.id = s.group_id and not g.archived
  left join public.streams st on st.id = g.stream_id
  cross join lateral generate_series(
    greatest(v_from, s.valid_from, coalesce(st.starts_on, v_from)),
    least(v_to, coalesce(s.valid_to, v_to), coalesce(st.ends_on, v_to)),
    interval '1 day'
  ) as d
  where extract(isodow from d) = s.weekday
  on conflict (slot_id, slot_date) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 7) RLS -------------------------------------------------------------------------------------
alter table public.schedule_slots enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_marks enable row level security;

-- Ученик видит расписание и занятия своей группы (на даты, когда он в ней)
drop policy if exists "schedule_slots_select" on public.schedule_slots;
create policy "schedule_slots_select" on public.schedule_slots for select to authenticated
using (
  public.is_admin() or public.is_head() or public.is_sat_staff()
  or exists (
    select 1 from public.enrollments e
    where e.group_id = schedule_slots.group_id and e.ends_on is null
      and e.student_id = public.current_user_student_id()
  )
);

drop policy if exists "schedule_slots_write" on public.schedule_slots;
create policy "schedule_slots_write" on public.schedule_slots for all to authenticated
using (public.can_edit_group(group_id))
with check (public.can_edit_group(group_id));

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

-- Внеплановое занятие добавляет тот, кто правит группу
drop policy if exists "lessons_insert" on public.lessons;
create policy "lessons_insert" on public.lessons for insert to authenticated
with check (public.can_edit_group(group_id) and slot_id is null);

drop policy if exists "lessons_update" on public.lessons;
create policy "lessons_update" on public.lessons for update to authenticated
using (public.can_mark_lesson(id))
with check (public.can_mark_lesson(id));

-- Удалить можно только внеплановое занятие (плановое — отменить)
drop policy if exists "lessons_delete" on public.lessons;
create policy "lessons_delete" on public.lessons for delete to authenticated
using (slot_id is null and public.can_edit_group(group_id));

-- Отметки: сотрудники SAT видят все, ученик — свои
drop policy if exists "lesson_marks_select" on public.lesson_marks;
create policy "lesson_marks_select" on public.lesson_marks for select to authenticated
using (
  public.is_admin() or public.is_head() or public.is_sat_staff()
  or student_id = public.current_user_student_id()
);

drop policy if exists "lesson_marks_write" on public.lesson_marks;
create policy "lesson_marks_write" on public.lesson_marks for all to authenticated
using (public.can_mark_lesson(lesson_id))
with check (public.can_mark_lesson(lesson_id));

grant select, insert, update, delete on public.schedule_slots, public.lessons, public.lesson_marks to authenticated;

-- 8) Функции для страниц -----------------------------------------------------------------

-- Ученики занятия (кто был в группе на дату) + их отметки
create or replace function public.lesson_roster(p_lesson uuid)
returns table (
  student_id uuid, full_name text, class_name text,
  attendance text, homework text, activity text, comment text
)
language sql stable security definer set search_path = public
as $$
  select s.id, trim(s.last_name || ' ' || s.first_name), s.class_name,
         m.attendance, m.homework, m.activity, coalesce(m.comment, '')
  from public.lessons l
  join public.enrollments e on e.group_id = l.group_id
    and e.starts_on <= l.lesson_date and (e.ends_on is null or e.ends_on > l.lesson_date
      or (e.ends_on = l.lesson_date and e.end_reason is distinct from 'transfer'))
  join public.students s on s.id = e.student_id
  left join public.lesson_marks m on m.lesson_id = l.id and m.student_id = s.id
  where l.id = p_lesson
    and (public.is_head() or public.is_sat_staff() or public.is_admin())
  order by s.last_name, s.first_name;
$$;

-- Посещаемость и ДЗ ученика по SAT (опоздал = был; ДЗ «частично» = половина)
create or replace function public.sat_student_info(p_student uuid)
returns table (
  lessons_marked integer, attendance_pct integer, homework_pct integer,
  stream_starts_on date, weeks_total integer
)
language sql stable security definer set search_path = public
as $$
  with marks as (
    select m.* from public.lesson_marks m
    join public.lessons l on l.id = m.lesson_id
    join public.groups g on g.id = l.group_id and g.course_id = 'sat'
    where m.student_id = p_student and l.status = 'planned'
  ),
  cur as (
    select st.starts_on, st.weeks_total
    from public.enrollments e
    join public.groups g on g.id = e.group_id
    left join public.streams st on st.id = g.stream_id
    where e.student_id = p_student and e.course_id = 'sat' and e.ends_on is null
    limit 1
  )
  select
    (select count(*) from marks where attendance is not null)::integer,
    (select round(100.0 * count(*) filter (where attendance in ('present', 'late'))
            / nullif(count(*) filter (where attendance is not null), 0))::integer from marks),
    (select round(100.0 * sum(case homework when 'done' then 1 when 'partial' then 0.5 else 0 end)
            / nullif(count(*) filter (where homework is not null), 0))::integer from marks),
    (select starts_on from cur),
    (select weeks_total from cur)
  where public.can_view_student(p_student);
$$;

-- То же для всех SAT-учеников — для таблиц групп
create or replace function public.sat_roster_stats()
returns table (student_id uuid, lessons_marked integer, attendance_pct integer, homework_pct integer)
language sql stable security definer set search_path = public
as $$
  select m.student_id,
    count(*) filter (where m.attendance is not null)::integer,
    round(100.0 * count(*) filter (where m.attendance in ('present', 'late'))
          / nullif(count(*) filter (where m.attendance is not null), 0))::integer,
    round(100.0 * sum(case m.homework when 'done' then 1 when 'partial' then 0.5 else 0 end)
          / nullif(count(*) filter (where m.homework is not null), 0))::integer
  from public.lesson_marks m
  join public.lessons l on l.id = m.lesson_id and l.status = 'planned'
  join public.groups g on g.id = l.group_id and g.course_id = 'sat'
  where public.is_head() or public.is_sat_staff()
  group by m.student_id;
$$;

-- Какие занятия уже отмечены (хотя бы одна отметка присутствия)
create or replace function public.marked_lessons(p_from date, p_to date)
returns table (lesson_id uuid, marked integer)
language sql stable security definer set search_path = public
as $$
  select m.lesson_id, count(*) filter (where m.attendance is not null)::integer
  from public.lesson_marks m
  join public.lessons l on l.id = m.lesson_id
  where l.lesson_date between p_from and p_to
    and (public.is_admin() or public.is_head() or public.is_sat_staff())
  group by m.lesson_id;
$$;

revoke execute on function public.ensure_lessons(date, date) from public, anon;
revoke execute on function public.lesson_roster(uuid) from public, anon;
revoke execute on function public.sat_student_info(uuid) from public, anon;
revoke execute on function public.sat_roster_stats() from public, anon;
revoke execute on function public.marked_lessons(date, date) from public, anon;
grant execute on function public.ensure_lessons(date, date) to authenticated;
grant execute on function public.lesson_roster(uuid) to authenticated;
grant execute on function public.sat_student_info(uuid) to authenticated;
grant execute on function public.sat_roster_stats() to authenticated;
grant execute on function public.marked_lessons(date, date) to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-sat-3.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — SAT, этап 3: результаты
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Нужны migration-sat-1.sql и migration-sat-2.sql. Можно запускать повторно. Откат: rollback-sat-3.sql
--
-- Что добавляет:
--   1. Темы SAT (стандартный список Digital SAT, правится в таблице sat_topics).
--   2. Пробные экзамены (моки) по потоку: Verbal и Math (200–800), итог считается сам.
--   3. Практисы группы: тема, число задач, результат ученика; до 3 попыток (перерешивание).
--   4. Комментарии к ученику: «только команде» или «видят ученик и родитель».

-- 0) Кто может вносить результаты ученика: руководитель, старший учитель,
--    учитель/куратор его текущей SAT-группы
create or replace function public.can_edit_sat_student(p_student uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_head()
      or public.has_staff_role('sat_senior_teacher')
      or exists (
        select 1 from public.enrollments e
        where e.student_id = p_student and e.course_id = 'sat' and e.ends_on is null
          and e.group_id is not null and public.can_edit_group(e.group_id)
      );
$$;

-- 1) Темы -------------------------------------------------------------------------------
create table if not exists public.sat_topics (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('math', 'verbal')),
  name text not null,
  sort integer not null default 0,
  active boolean not null default true,
  unique (section, name)
);

insert into public.sat_topics (section, name, sort) values
  ('math', 'Linear equations in one variable', 10),
  ('math', 'Linear equations in two variables', 20),
  ('math', 'Linear functions', 30),
  ('math', 'Systems of linear equations', 40),
  ('math', 'Linear inequalities', 50),
  ('math', 'Equivalent expressions', 60),
  ('math', 'Nonlinear equations and systems', 70),
  ('math', 'Nonlinear functions', 80),
  ('math', 'Ratios, rates, proportions', 90),
  ('math', 'Percentages', 100),
  ('math', 'One-variable data', 110),
  ('math', 'Two-variable data', 120),
  ('math', 'Probability', 130),
  ('math', 'Inference from samples', 140),
  ('math', 'Evaluating statistical claims', 150),
  ('math', 'Area and volume', 160),
  ('math', 'Lines, angles, triangles', 170),
  ('math', 'Right triangles and trigonometry', 180),
  ('math', 'Circles', 190),
  ('verbal', 'Words in context', 10),
  ('verbal', 'Text structure and purpose', 20),
  ('verbal', 'Cross-text connections', 30),
  ('verbal', 'Central ideas and details', 40),
  ('verbal', 'Command of evidence: textual', 50),
  ('verbal', 'Command of evidence: quantitative', 60),
  ('verbal', 'Inferences', 70),
  ('verbal', 'Boundaries', 80),
  ('verbal', 'Form, structure, and sense', 90),
  ('verbal', 'Transitions', 100),
  ('verbal', 'Rhetorical synthesis', 110)
on conflict (section, name) do nothing;

-- 2) Моки ------------------------------------------------------------------------------
create table if not exists public.mocks (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid references public.streams (id) on delete set null,
  title text not null,
  mock_date date not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists mocks_stream_idx on public.mocks (stream_id, mock_date);

create table if not exists public.mock_results (
  mock_id uuid not null references public.mocks (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  verbal integer check (verbal between 200 and 800),
  math integer check (math between 200 and 800),
  total integer generated always as (verbal + math) stored,
  entered_by uuid,
  updated_at timestamptz not null default now(),
  primary key (mock_id, student_id)
);
create index if not exists mock_results_student_idx on public.mock_results (student_id);

-- 3) Практисы ----------------------------------------------------------------------------
create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  practice_date date not null,
  topic_id uuid references public.sat_topics (id) on delete set null,
  title text not null default '',
  max_score integer not null default 15 check (max_score between 1 and 200),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists practices_group_idx on public.practices (group_id, practice_date);

create table if not exists public.practice_results (
  practice_id uuid not null references public.practices (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  attempt smallint not null default 1 check (attempt between 1 and 3),
  correct integer not null check (correct >= 0),
  entered_by uuid,
  created_at timestamptz not null default now(),
  primary key (practice_id, student_id, attempt)
);
create index if not exists practice_results_student_idx on public.practice_results (student_id);

-- Результат не больше числа задач
create or replace function public.check_practice_result()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_max integer;
begin
  select max_score into v_max from public.practices where id = new.practice_id;
  if new.correct > v_max then
    raise exception 'Верных ответов больше, чем задач (%)', v_max;
  end if;
  new.entered_by := coalesce(auth.uid(), new.entered_by);
  return new;
end;
$$;

drop trigger if exists practice_results_check on public.practice_results;
create trigger practice_results_check
before insert or update on public.practice_results
for each row execute function public.check_practice_result();

create or replace function public.stamp_mock_result()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.entered_by := coalesce(auth.uid(), new.entered_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mock_results_stamp on public.mock_results;
create trigger mock_results_stamp
before insert or update on public.mock_results
for each row execute function public.stamp_mock_result();

-- 4) Комментарии к ученику -----------------------------------------------------------------
create table if not exists public.sat_comments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  author_id uuid references public.staff_members (user_id) on delete set null,
  author_name text not null default '',
  visibility text not null default 'team' check (visibility in ('team', 'family')),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists sat_comments_student_idx on public.sat_comments (student_id, created_at desc);

create or replace function public.stamp_sat_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
    new.author_name := coalesce((select full_name from public.staff_members where user_id = auth.uid()), '');
  end if;
  return new;
end;
$$;

drop trigger if exists sat_comments_stamp on public.sat_comments;
create trigger sat_comments_stamp
before insert on public.sat_comments
for each row execute function public.stamp_sat_comment();

-- Без рекурсии в правилах: проверки через функции
create or replace function public.can_edit_practice(p_practice uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.practices p where p.id = p_practice and public.can_edit_group(p.group_id));
$$;

create or replace function public.has_own_practice_result(p_practice uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.practice_results r
    where r.practice_id = p_practice and r.student_id = public.current_user_student_id()
  );
$$;

create or replace function public.has_own_mock_result(p_mock uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.mock_results r
    where r.mock_id = p_mock and r.student_id = public.current_user_student_id()
  );
$$;

-- 5) RLS ------------------------------------------------------------------------------------
alter table public.sat_topics enable row level security;
alter table public.mocks enable row level security;
alter table public.mock_results enable row level security;
alter table public.practices enable row level security;
alter table public.practice_results enable row level security;
alter table public.sat_comments enable row level security;

drop policy if exists "sat_topics_select" on public.sat_topics;
create policy "sat_topics_select" on public.sat_topics for select to authenticated using (true);
drop policy if exists "sat_topics_write" on public.sat_topics;
create policy "sat_topics_write" on public.sat_topics for all to authenticated
using (public.can_manage_sat()) with check (public.can_manage_sat());

-- Моки: создаёт руководитель / старший учитель; видят сотрудники и ученики с результатом
drop policy if exists "mocks_select" on public.mocks;
create policy "mocks_select" on public.mocks for select to authenticated
using (
  public.is_admin() or public.is_head() or public.is_sat_staff()
  or public.has_own_mock_result(id)
);
drop policy if exists "mocks_write" on public.mocks;
create policy "mocks_write" on public.mocks for all to authenticated
using (public.can_manage_sat()) with check (public.can_manage_sat());

drop policy if exists "mock_results_select" on public.mock_results;
create policy "mock_results_select" on public.mock_results for select to authenticated
using (public.is_admin() or public.is_head() or public.is_sat_staff() or student_id = public.current_user_student_id());
drop policy if exists "mock_results_write" on public.mock_results;
create policy "mock_results_write" on public.mock_results for all to authenticated
using (public.can_edit_sat_student(student_id)) with check (public.can_edit_sat_student(student_id));

-- Практисы: создаёт и заполняет тот, кто правит группу
drop policy if exists "practices_select" on public.practices;
create policy "practices_select" on public.practices for select to authenticated
using (
  public.is_admin() or public.is_head() or public.is_sat_staff()
  or public.has_own_practice_result(id)
);
drop policy if exists "practices_write" on public.practices;
create policy "practices_write" on public.practices for all to authenticated
using (public.can_edit_group(group_id)) with check (public.can_edit_group(group_id));

drop policy if exists "practice_results_select" on public.practice_results;
create policy "practice_results_select" on public.practice_results for select to authenticated
using (public.is_admin() or public.is_head() or public.is_sat_staff() or student_id = public.current_user_student_id());
drop policy if exists "practice_results_write" on public.practice_results;
create policy "practice_results_write" on public.practice_results for all to authenticated
using (public.can_edit_practice(practice_id))
with check (public.can_edit_practice(practice_id));

-- Комментарии: «команда» — только сотрудники; «семья» — ещё ученик сам
drop policy if exists "sat_comments_select" on public.sat_comments;
create policy "sat_comments_select" on public.sat_comments for select to authenticated
using (
  public.is_admin() or public.is_head() or public.is_sat_staff()
  or (visibility = 'family' and student_id = public.current_user_student_id())
);
drop policy if exists "sat_comments_insert" on public.sat_comments;
create policy "sat_comments_insert" on public.sat_comments for insert to authenticated
with check (public.is_head() or (public.is_sat_staff() and public.can_view_student(student_id)));
drop policy if exists "sat_comments_delete" on public.sat_comments;
create policy "sat_comments_delete" on public.sat_comments for delete to authenticated
using (author_id = auth.uid() or public.is_head());

grant select, insert, update, delete on public.sat_topics, public.mocks, public.mock_results,
  public.practices, public.practice_results, public.sat_comments to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-sat-4.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — SAT этап 4А: office hours, домашка, официальные результаты, место по мокам, практис по темам
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Откат: rollback-sat-4.sql

-- 1) Office hours: тот же слот расписания, но другого вида. Не отмечаются и не идут в посещаемость.
alter table public.schedule_slots add column if not exists kind text not null default 'lesson';
alter table public.lessons add column if not exists kind text not null default 'lesson';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_slots_kind_check') then
    alter table public.schedule_slots add constraint schedule_slots_kind_check check (kind in ('lesson', 'office_hours'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lessons_kind_check') then
    alter table public.lessons add constraint lessons_kind_check check (kind in ('lesson', 'office_hours'));
  end if;
end;
$$;

-- 2) Домашнее задание, которое учитель задаёт на занятии (ученик видит «что сделать к следующему»)
alter table public.lessons add column if not exists homework text not null default '';

create or replace function public.ensure_lessons(p_from date, p_to date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_from date := greatest(p_from, public.local_today() - 120);
  v_to date := least(p_to, public.local_today() + 28);
  v_count integer;
begin
  if auth.uid() is null or v_from > v_to then
    return 0;
  end if;
  insert into public.lessons (group_id, slot_id, slot_date, lesson_date, starts_at, duration_min, title, kind)
  select s.group_id, s.id, d::date, d::date, s.starts_at, s.duration_min, s.title, s.kind
  from public.schedule_slots s
  join public.groups g on g.id = s.group_id and not g.archived
  left join public.streams st on st.id = g.stream_id
  cross join lateral generate_series(
    greatest(v_from, s.valid_from, coalesce(st.starts_on, v_from)),
    least(v_to, coalesce(s.valid_to, v_to), coalesce(st.ends_on, v_to)),
    interval '1 day'
  ) as d
  where extract(isodow from d) = s.weekday
  on conflict (slot_id, slot_date) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Посещаемость и ДЗ — только по занятиям, без office hours
create or replace function public.sat_student_info(p_student uuid)
returns table (
  lessons_marked integer, attendance_pct integer, homework_pct integer,
  stream_starts_on date, weeks_total integer
)
language sql stable security definer set search_path = public
as $$
  with marks as (
    select m.* from public.lesson_marks m
    join public.lessons l on l.id = m.lesson_id
    join public.groups g on g.id = l.group_id and g.course_id = 'sat'
    where m.student_id = p_student and l.status = 'planned' and l.kind = 'lesson'
  ),
  cur as (
    select st.starts_on, st.weeks_total
    from public.enrollments e
    join public.groups g on g.id = e.group_id
    left join public.streams st on st.id = g.stream_id
    where e.student_id = p_student and e.course_id = 'sat' and e.ends_on is null
    limit 1
  )
  select
    (select count(*) from marks where attendance is not null)::integer,
    (select round(100.0 * count(*) filter (where attendance in ('present', 'late'))
            / nullif(count(*) filter (where attendance is not null), 0))::integer from marks),
    (select round(100.0 * sum(case homework when 'done' then 1 when 'partial' then 0.5 else 0 end)
            / nullif(count(*) filter (where homework is not null), 0))::integer from marks),
    (select starts_on from cur),
    (select weeks_total from cur)
  where public.can_view_student(p_student);
$$;

create or replace function public.sat_roster_stats()
returns table (student_id uuid, lessons_marked integer, attendance_pct integer, homework_pct integer)
language sql stable security definer set search_path = public
as $$
  select m.student_id,
    count(*) filter (where m.attendance is not null)::integer,
    round(100.0 * count(*) filter (where m.attendance in ('present', 'late'))
          / nullif(count(*) filter (where m.attendance is not null), 0))::integer,
    round(100.0 * sum(case m.homework when 'done' then 1 when 'partial' then 0.5 else 0 end)
          / nullif(count(*) filter (where m.homework is not null), 0))::integer
  from public.lesson_marks m
  join public.lessons l on l.id = m.lesson_id and l.status = 'planned' and l.kind = 'lesson'
  join public.groups g on g.id = l.group_id and g.course_id = 'sat'
  where public.is_head() or public.is_sat_staff()
  group by m.student_id;
$$;

-- 3) Практис по теме: ссылка на материалы (Google Drive и т.п.), задаёт руководитель SAT
alter table public.sat_topics add column if not exists practice_url text not null default '';

-- 4) Официальные результаты SAT: вносит сам ученик или сотрудник
create table if not exists public.sat_official_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  exam_date date not null,
  verbal integer not null check (verbal between 200 and 800 and verbal % 10 = 0),
  math integer not null check (math between 200 and 800 and math % 10 = 0),
  total integer generated always as (verbal + math) stored,
  entered_by uuid,
  created_at timestamptz not null default now(),
  unique (student_id, exam_date)
);
create index if not exists sat_official_student_idx on public.sat_official_results (student_id, exam_date);

alter table public.sat_official_results enable row level security;

drop policy if exists "sat_official_select" on public.sat_official_results;
create policy "sat_official_select" on public.sat_official_results for select to authenticated
using (student_id = public.current_user_student_id() or public.can_view_student(student_id));

drop policy if exists "sat_official_write" on public.sat_official_results;
create policy "sat_official_write" on public.sat_official_results for all to authenticated
using (student_id = public.current_user_student_id() or public.can_edit_sat_student(student_id))
with check (student_id = public.current_user_student_id() or public.can_edit_sat_student(student_id));

grant select, insert, update, delete on public.sat_official_results to authenticated;

-- 5) Место по последнему моку среди учеников своей группы. Только число и место — без чужих имён и баллов.
create or replace function public.my_mock_rank(p_student uuid)
returns table (mock_title text, mock_date date, place integer, total_students integer, score integer)
language sql stable security definer set search_path = public
as $$
  with me as (
    select e.group_id from public.enrollments e
    where e.student_id = p_student and e.course_id = 'sat' and e.ends_on is null
    limit 1
  ),
  mates as (
    select e.student_id from public.enrollments e, me
    where e.group_id = me.group_id and e.course_id = 'sat' and e.ends_on is null
  ),
  last_mock as (
    select m.id, m.title, m.mock_date from public.mocks m
    join public.mock_results r on r.mock_id = m.id and r.student_id = p_student and r.total is not null
    order by m.mock_date desc, m.created_at desc
    limit 1
  ),
  scores as (
    select r.student_id, r.total from public.mock_results r, last_mock lm
    where r.mock_id = lm.id and r.total is not null and r.student_id in (select student_id from mates)
  )
  select lm.title, lm.mock_date,
    (select count(*) + 1 from scores s where s.total > (select total from scores where student_id = p_student))::integer,
    (select count(*) from scores)::integer,
    (select total from scores where student_id = p_student)
  from last_mock lm
  where p_student = public.current_user_student_id() or public.can_view_student(p_student);
$$;

revoke execute on function public.my_mock_rank(uuid) from public, anon;
grant execute on function public.my_mock_rank(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-sat-4b.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — SAT: обратная связь по office hours (только для сотрудников)
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Откат: drop table if exists public.office_hours_notes;
--
-- После office hours учитель отмечает, кто пришёл, и пишет короткую обратную связь по каждому.
-- Ученики эту таблицу не видят (в отличие от lesson_marks, где ученик читает свои отметки).

create table if not exists public.office_hours_notes (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  attended boolean not null default true,
  comment text not null default '',
  author_id uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, student_id)
);
create index if not exists office_hours_notes_student_idx on public.office_hours_notes (student_id);

drop trigger if exists office_hours_notes_set_updated_at on public.office_hours_notes;
create trigger office_hours_notes_set_updated_at
before update on public.office_hours_notes
for each row execute function public.set_updated_at();

alter table public.office_hours_notes enable row level security;

drop policy if exists "oh_notes_select" on public.office_hours_notes;
create policy "oh_notes_select" on public.office_hours_notes for select to authenticated
using (public.is_admin() or public.is_head() or public.is_sat_staff());

drop policy if exists "oh_notes_write" on public.office_hours_notes;
create policy "oh_notes_write" on public.office_hours_notes for all to authenticated
using (public.can_mark_lesson(lesson_id))
with check (public.can_mark_lesson(lesson_id));

grant select, insert, update, delete on public.office_hours_notes to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-sat-5.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — SAT этап 4Б: тесты на сайте
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Откат: rollback-sat-5.sql
--
-- Учитель загружает тест (Word по шаблону) или собирает вручную: модули (Verbal/Math, минуты, калькулятор),
-- вопросы (выбор ответа или ввод числа), у каждого вопроса — тема и баллы. Публикует для групп на период.
-- Ученик проходит на сайте: таймер считает сервер, каждый ответ сохраняется сразу.
-- Ключи ответов ученику недоступны: вопросы он получает только через функции, без ответов.

-- 1) Тесты, модули, вопросы -----------------------------------------------------------------
create table if not exists public.online_tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.test_sections (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.online_tests (id) on delete cascade,
  position integer not null,
  title text not null default '',
  section text not null default 'verbal' check (section in ('verbal', 'math')),
  minutes integer not null default 32 check (minutes between 1 and 240),
  calculator boolean not null default false,
  unique (test_id, position)
);

create table if not exists public.test_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.test_sections (id) on delete cascade,
  position integer not null,
  kind text not null default 'choice' check (kind in ('choice', 'input')),
  passage text not null default '',
  stem text not null default '',
  image text not null default '',          -- data:image/webp;base64,… (сжато в браузере)
  options jsonb not null default '[]'::jsonb,
  answer text not null default '',         -- «B» или «12; 12.0; 24/2»
  topic_id uuid references public.sat_topics (id) on delete set null,
  topic_label text not null default '',    -- если темы нет в списке
  points numeric(6, 2) not null default 1 check (points >= 0),
  unique (section_id, position)
);
create index if not exists test_questions_section_idx on public.test_questions (section_id, position);

drop trigger if exists online_tests_set_updated_at on public.online_tests;
create trigger online_tests_set_updated_at before update on public.online_tests
for each row execute function public.set_updated_at();

-- 2) Публикация для групп --------------------------------------------------------------------
create table if not exists public.test_assignments (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.online_tests (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  opens_at timestamptz not null default now(),
  closes_at timestamptz,
  review_open boolean not null default false,   -- ученики видят разбор: правильные ответы
  published_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (test_id, group_id),
  check (closes_at is null or closes_at > opens_at)
);

-- 3) Попытки и ответы --------------------------------------------------------------------------
create table if not exists public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.test_assignments (id) on delete cascade,
  test_id uuid not null references public.online_tests (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  current_position integer not null default 1,
  section_started_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score numeric(8, 2),
  max_score numeric(8, 2),
  tab_switches integer not null default 0,
  unique (test_id, student_id)
);
create index if not exists test_attempts_student_idx on public.test_attempts (student_id);

create table if not exists public.test_answers (
  attempt_id uuid not null references public.test_attempts (id) on delete cascade,
  question_id uuid not null references public.test_questions (id) on delete cascade,
  answer text not null default '',
  flagged boolean not null default false,
  is_correct boolean,
  points_awarded numeric(6, 2),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- 4) Права ----------------------------------------------------------------------------------------
create or replace function public.is_sat_team()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_admin() or public.is_head() or public.is_sat_staff(); $$;

create or replace function public.can_edit_test(p_test uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.can_manage_sat()
      or exists (select 1 from public.online_tests t where t.id = p_test and t.created_by = auth.uid() and public.is_sat_team());
$$;

alter table public.online_tests enable row level security;
alter table public.test_sections enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_assignments enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_answers enable row level security;

drop policy if exists "online_tests_select" on public.online_tests;
create policy "online_tests_select" on public.online_tests for select to authenticated using (public.is_sat_team());
drop policy if exists "online_tests_insert" on public.online_tests;
create policy "online_tests_insert" on public.online_tests for insert to authenticated with check (public.is_sat_team());
drop policy if exists "online_tests_update" on public.online_tests;
create policy "online_tests_update" on public.online_tests for update to authenticated using (public.can_edit_test(id)) with check (public.can_edit_test(id));
drop policy if exists "online_tests_delete" on public.online_tests;
create policy "online_tests_delete" on public.online_tests for delete to authenticated using (public.can_edit_test(id));

drop policy if exists "test_sections_select" on public.test_sections;
create policy "test_sections_select" on public.test_sections for select to authenticated using (public.is_sat_team());
drop policy if exists "test_sections_write" on public.test_sections;
create policy "test_sections_write" on public.test_sections for all to authenticated
using (public.can_edit_test(test_id)) with check (public.can_edit_test(test_id));

drop policy if exists "test_questions_select" on public.test_questions;
create policy "test_questions_select" on public.test_questions for select to authenticated using (public.is_sat_team());
drop policy if exists "test_questions_write" on public.test_questions;
create policy "test_questions_write" on public.test_questions for all to authenticated
using (public.can_edit_test((select s.test_id from public.test_sections s where s.id = section_id)))
with check (public.can_edit_test((select s.test_id from public.test_sections s where s.id = section_id)));

drop policy if exists "test_assignments_select" on public.test_assignments;
create policy "test_assignments_select" on public.test_assignments for select to authenticated using (public.is_sat_team());
drop policy if exists "test_assignments_write" on public.test_assignments;
create policy "test_assignments_write" on public.test_assignments for all to authenticated
using (public.can_edit_group(group_id)) with check (public.can_edit_group(group_id) and public.is_sat_team());

-- Попытки и ответы ученик меняет только через функции ниже; читает свои попытки (без ответов)
drop policy if exists "test_attempts_select" on public.test_attempts;
create policy "test_attempts_select" on public.test_attempts for select to authenticated
using (public.is_sat_team() or student_id = public.current_user_student_id());
drop policy if exists "test_attempts_delete" on public.test_attempts;
create policy "test_attempts_delete" on public.test_attempts for delete to authenticated
using (public.can_edit_group((select a.group_id from public.test_assignments a where a.id = assignment_id)));

drop policy if exists "test_answers_select" on public.test_answers;
create policy "test_answers_select" on public.test_answers for select to authenticated using (public.is_sat_team());

grant select, insert, update, delete on public.online_tests, public.test_sections, public.test_questions, public.test_assignments to authenticated;
grant select, delete on public.test_attempts to authenticated;
grant select on public.test_answers to authenticated;

-- 5) Проверка ответа ---------------------------------------------------------------------------------
-- Ввод числа: «3/4», «0.75», «,75» — одно и то же; несколько верных через «;».
create or replace function public.test_num(p text)
returns numeric language plpgsql immutable as $$
declare v text := replace(replace(lower(trim(p)), ' ', ''), ',', '.');
begin
  if v ~ '^-?\d+/\d+$' then
    if split_part(ltrim(v, '-'), '/', 2)::numeric = 0 then return null; end if;
    return (case when v like '-%' then -1 else 1 end) * split_part(ltrim(v, '-'), '/', 1)::numeric / split_part(ltrim(v, '-'), '/', 2)::numeric;
  elsif v ~ '^-?\d*\.?\d+$' then
    return v::numeric;
  end if;
  return null;
end;
$$;

create or replace function public.test_is_correct(p_kind text, p_key text, p_given text)
returns boolean language plpgsql immutable as $$
declare
  k text;
  g text := replace(replace(lower(trim(coalesce(p_given, ''))), ' ', ''), ',', '.');
begin
  if g = '' then return false; end if;
  if p_kind = 'choice' then
    return upper(g) = upper(trim(p_key));
  end if;
  foreach k in array string_to_array(coalesce(p_key, ''), ';') loop
    k := replace(replace(lower(trim(k)), ' ', ''), ',', '.');
    if k = '' then continue; end if;
    if k = g then return true; end if;
    if public.test_num(k) is not null and public.test_num(g) is not null and abs(public.test_num(k) - public.test_num(g)) < 0.0001 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Подсчитать попытку (и пересчитать, если учитель исправил ключ)
create or replace function public.score_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_test uuid;
begin
  select test_id into v_test from public.test_attempts where id = p_attempt;
  -- пустые строки для неотвеченных вопросов, чтобы отчёт видел и их
  insert into public.test_answers (attempt_id, question_id, answer)
  select p_attempt, q.id, '' from public.test_questions q
  join public.test_sections s on s.id = q.section_id
  where s.test_id = v_test
  on conflict do nothing;

  update public.test_answers a
  set is_correct = public.test_is_correct(q.kind, q.answer, a.answer),
      points_awarded = case when public.test_is_correct(q.kind, q.answer, a.answer) then q.points else 0 end
  from public.test_questions q
  where a.attempt_id = p_attempt and q.id = a.question_id;

  update public.test_attempts t set
    score = (select coalesce(sum(points_awarded), 0) from public.test_answers where attempt_id = p_attempt),
    max_score = (select coalesce(sum(q.points), 0) from public.test_questions q join public.test_sections s on s.id = q.section_id where s.test_id = v_test)
  where t.id = p_attempt;
end;
$$;

-- Сотрудник исправил ключ — пересчитать все завершённые попытки теста
create or replace function public.rescore_test(p_test uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.can_edit_test(p_test) then raise exception 'Нет прав на этот тест'; end if;
  for r in select id from public.test_attempts where test_id = p_test and finished_at is not null loop
    perform public.score_attempt(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 6) Ученик: список, старт, вопросы модуля, ответ, следующий модуль ---------------------------------
-- (sat-6 меняет набор колонок — пересоздаём, чтобы файл можно было запускать повторно)
drop function if exists public.my_tests();
create or replace function public.my_tests()
returns table (
  assignment_id uuid, test_id uuid, title text, description text, opens_at timestamptz, closes_at timestamptz,
  sections integer, questions integer, total_minutes integer,
  attempt_id uuid, started_at timestamptz, finished_at timestamptz, score numeric, max_score numeric, review_open boolean
)
language sql stable security definer set search_path = public as $$
  select a.id, t.id, t.title, t.description, a.opens_at, a.closes_at,
    (select count(*) from public.test_sections s where s.test_id = t.id)::integer,
    (select count(*) from public.test_questions q join public.test_sections s on s.id = q.section_id where s.test_id = t.id)::integer,
    (select coalesce(sum(s.minutes), 0) from public.test_sections s where s.test_id = t.id)::integer,
    at.id, at.started_at, at.finished_at, at.score, at.max_score, a.review_open
  from public.test_assignments a
  join public.online_tests t on t.id = a.test_id
  join public.enrollments e on e.group_id = a.group_id and e.ends_on is null and e.student_id = public.current_user_student_id()
  left join public.test_attempts at on at.test_id = t.id and at.student_id = e.student_id
  where a.opens_at <= now() + interval '14 days'
  order by a.opens_at desc;
$$;

create or replace function public.start_test(p_assignment uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.current_user_student_id();
  a record;
  v_id uuid;
begin
  select * into a from public.test_assignments where id = p_assignment;
  if a is null or v_student is null then raise exception 'Тест не найден'; end if;
  if not exists (select 1 from public.enrollments e where e.group_id = a.group_id and e.student_id = v_student and e.ends_on is null) then
    raise exception 'Этот тест не для вашей группы';
  end if;
  select id into v_id from public.test_attempts where test_id = a.test_id and student_id = v_student;
  if v_id is not null then return v_id; end if;
  if now() < a.opens_at then raise exception 'Тест ещё не открыт'; end if;
  if a.closes_at is not null and now() > a.closes_at then raise exception 'Тест уже закрыт'; end if;
  if not exists (select 1 from public.test_sections where test_id = a.test_id) then raise exception 'В тесте нет модулей'; end if;
  insert into public.test_attempts (assignment_id, test_id, student_id, current_position, section_started_at)
  values (a.id, a.test_id, v_student, (select min(position) from public.test_sections where test_id = a.test_id), now())
  returning id into v_id;
  return v_id;
end;
$$;

-- Перейти к следующему модулю или завершить
create or replace function public.advance_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v_next integer;
begin
  select * into t from public.test_attempts where id = p_attempt for update;
  if t.finished_at is not null then return; end if;
  select min(position) into v_next from public.test_sections where test_id = t.test_id and position > t.current_position;
  if v_next is null then
    update public.test_attempts set finished_at = now() where id = p_attempt;
    perform public.score_attempt(p_attempt);
  else
    update public.test_attempts set current_position = v_next, section_started_at = now() where id = p_attempt;
  end if;
end;
$$;

-- Модули, у которых время вышло (с запасом 20 секунд на сеть), закрываются сами
create or replace function public.expire_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v_minutes integer; i integer := 0;
begin
  loop
    select * into t from public.test_attempts where id = p_attempt;
    exit when t.finished_at is not null or i > 20;
    select minutes into v_minutes from public.test_sections where test_id = t.test_id and position = t.current_position;
    exit when now() < t.section_started_at + make_interval(mins => v_minutes) + interval '20 seconds';
    perform public.advance_attempt(p_attempt);
    i := i + 1;
  end loop;
end;
$$;

create or replace function public.own_attempt(p_attempt uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.test_attempts where id = p_attempt and student_id = public.current_user_student_id());
$$;

-- Текущее состояние: модули, текущий модуль, сколько осталось секунд, вопросы БЕЗ ответов, свои ответы
create or replace function public.attempt_state(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; s record; v_left integer;
begin
  if not public.own_attempt(p_attempt) then raise exception 'Нет доступа'; end if;
  perform public.expire_attempt(p_attempt);
  select * into t from public.test_attempts where id = p_attempt;
  if t.finished_at is not null then
    return jsonb_build_object('finished', true, 'test_title', (select title from public.online_tests where id = t.test_id));
  end if;
  select * into s from public.test_sections where test_id = t.test_id and position = t.current_position;
  v_left := greatest(0, extract(epoch from (t.section_started_at + make_interval(mins => s.minutes) - now()))::integer);
  return jsonb_build_object(
    'finished', false,
    'test_title', (select title from public.online_tests where id = t.test_id),
    'sections', (select jsonb_agg(jsonb_build_object('position', x.position, 'title', x.title, 'section', x.section, 'minutes', x.minutes,
                   'count', (select count(*) from public.test_questions q where q.section_id = x.id)) order by x.position)
                 from public.test_sections x where x.test_id = t.test_id),
    'current', jsonb_build_object('position', s.position, 'title', s.title, 'section', s.section, 'minutes', s.minutes, 'calculator', s.calculator, 'seconds_left', v_left),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'position', q.position, 'kind', q.kind, 'passage', q.passage, 'stem', q.stem,
                   'image', q.image, 'options', q.options, 'points', q.points) order by q.position)
                 from public.test_questions q where q.section_id = s.id), '[]'::jsonb),
    'answers', coalesce((select jsonb_object_agg(a.question_id, jsonb_build_object('answer', a.answer, 'flagged', a.flagged))
                 from public.test_answers a join public.test_questions q on q.id = a.question_id
                 where a.attempt_id = p_attempt and q.section_id = s.id), '{}'::jsonb)
  );
end;
$$;

create or replace function public.save_test_answer(p_attempt uuid, p_question uuid, p_answer text, p_flagged boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare t record; v_minutes integer;
begin
  if not public.own_attempt(p_attempt) then raise exception 'Нет доступа'; end if;
  select * into t from public.test_attempts where id = p_attempt;
  if t.finished_at is not null then return false; end if;
  select minutes into v_minutes from public.test_sections where test_id = t.test_id and position = t.current_position;
  if now() > t.section_started_at + make_interval(mins => v_minutes) + interval '20 seconds' then
    perform public.expire_attempt(p_attempt);
    return false;
  end if;
  if not exists (
    select 1 from public.test_questions q join public.test_sections s on s.id = q.section_id
    where q.id = p_question and s.test_id = t.test_id and s.position = t.current_position
  ) then
    raise exception 'Вопрос не из текущего модуля';
  end if;
  insert into public.test_answers (attempt_id, question_id, answer, flagged, updated_at)
  values (p_attempt, p_question, left(coalesce(p_answer, ''), 50), coalesce(p_flagged, false), now())
  on conflict (attempt_id, question_id) do update set answer = excluded.answer, flagged = excluded.flagged, updated_at = now();
  return true;
end;
$$;

create or replace function public.next_test_section(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.own_attempt(p_attempt) then raise exception 'Нет доступа'; end if;
  perform public.advance_attempt(p_attempt);
end;
$$;

create or replace function public.note_tab_switch(p_attempt uuid)
returns void language sql security definer set search_path = public as $$
  update public.test_attempts set tab_switches = tab_switches + 1
  where id = p_attempt and finished_at is null and student_id = public.current_user_student_id();
$$;

-- Результат для ученика: баллы, по модулям, по темам; разбор — только если учитель открыл
create or replace function public.attempt_result(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; v_review boolean;
begin
  if not (public.own_attempt(p_attempt) or public.is_sat_team()) then raise exception 'Нет доступа'; end if;
  perform public.expire_attempt(p_attempt);
  select * into t from public.test_attempts where id = p_attempt;
  if t.finished_at is null then raise exception 'Тест ещё не завершён'; end if;
  select review_open into v_review from public.test_assignments where id = t.assignment_id;
  v_review := v_review or public.is_sat_team();
  return jsonb_build_object(
    'test_title', (select title from public.online_tests where id = t.test_id),
    'score', t.score, 'max_score', t.max_score, 'finished_at', t.finished_at, 'review_open', v_review,
    'sections', (select jsonb_agg(jsonb_build_object('title', s.title, 'section', s.section,
        'score', (select coalesce(sum(a.points_awarded), 0) from public.test_answers a join public.test_questions q on q.id = a.question_id where a.attempt_id = p_attempt and q.section_id = s.id),
        'max', (select coalesce(sum(q.points), 0) from public.test_questions q where q.section_id = s.id)) order by s.position)
      from public.test_sections s where s.test_id = t.test_id),
    'topics', (select coalesce(jsonb_agg(x order by x->>'pct'), '[]'::jsonb) from (
        select jsonb_build_object('topic', coalesce(tp.name, nullif(q.topic_label, ''), 'Без темы'), 'section', s.section,
          'correct', count(*) filter (where a.is_correct), 'total', count(*),
          'pct', lpad(round(100.0 * count(*) filter (where a.is_correct) / count(*))::text, 3, '0')) as x
        from public.test_answers a
        join public.test_questions q on q.id = a.question_id
        join public.test_sections s on s.id = q.section_id
        left join public.sat_topics tp on tp.id = q.topic_id
        where a.attempt_id = p_attempt
        group by coalesce(tp.name, nullif(q.topic_label, ''), 'Без темы'), s.section) y),
    'questions', (select jsonb_agg(jsonb_build_object('position', q.position, 'section_title', s.title, 'is_correct', a.is_correct,
          'answer', a.answer, 'topic', coalesce(tp.name, nullif(q.topic_label, ''), ''),
          'stem', case when v_review then q.stem else null end,
          'passage', case when v_review then q.passage else null end,
          'options', case when v_review then q.options else null end,
          'image', case when v_review then q.image else null end,
          'kind', q.kind,
          'correct_answer', case when v_review then q.answer else null end) order by s.position, q.position)
      from public.test_answers a
      join public.test_questions q on q.id = a.question_id
      join public.test_sections s on s.id = q.section_id
      left join public.sat_topics tp on tp.id = q.topic_id
      where a.attempt_id = p_attempt)
  );
end;
$$;

revoke execute on function public.score_attempt(uuid) from public, anon, authenticated;
revoke execute on function public.advance_attempt(uuid) from public, anon, authenticated;
revoke execute on function public.expire_attempt(uuid) from public, anon, authenticated;
revoke execute on function public.rescore_test(uuid) from public, anon;
revoke execute on function public.my_tests() from public, anon;
revoke execute on function public.start_test(uuid) from public, anon;
revoke execute on function public.attempt_state(uuid) from public, anon;
revoke execute on function public.save_test_answer(uuid, uuid, text, boolean) from public, anon;
revoke execute on function public.next_test_section(uuid) from public, anon;
revoke execute on function public.note_tab_switch(uuid) from public, anon;
revoke execute on function public.attempt_result(uuid) from public, anon;
grant execute on function public.rescore_test(uuid) to authenticated;
grant execute on function public.my_tests() to authenticated;
grant execute on function public.start_test(uuid) to authenticated;
grant execute on function public.attempt_state(uuid) to authenticated;
grant execute on function public.save_test_answer(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.next_test_section(uuid) to authenticated;
grant execute on function public.note_tab_switch(uuid) to authenticated;
grant execute on function public.attempt_result(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-sat-6.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — SAT, этап 6
-- 1) Office hours для части группы (1–3 ученика) и отметка ученика «Прочитал»
-- 2) Доступ к тесту только присутствующим: учитель отмечает учеников и говорит код
-- 3) Время на каждый вопрос теста
-- 4) «Требует внимания» для учителей SAT
-- Файл можно запускать повторно. Откат — rollback-sat-6.sql.

-- 1) Office hours: кому назначены + «Прочитал» -------------------------------------------------------
-- student_ids = null — вся группа; иначе только перечисленные ученики
alter table public.lessons add column if not exists student_ids uuid[];

drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons for select to authenticated
using (
  public.is_admin() or public.is_head() or public.is_sat_staff()
  or (
    (lessons.student_ids is null or public.current_user_student_id() = any (lessons.student_ids))
    and exists (
      select 1 from public.enrollments e
      where e.group_id = lessons.group_id
        and e.student_id = public.current_user_student_id()
        and e.starts_on <= lessons.lesson_date
        and (e.ends_on is null or e.ends_on >= lessons.lesson_date)
    )
  )
);

create table if not exists public.lesson_acks (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (lesson_id, student_id)
);
create index if not exists lesson_acks_student_idx on public.lesson_acks (student_id);

alter table public.lesson_acks enable row level security;
drop policy if exists "lesson_acks_select" on public.lesson_acks;
create policy "lesson_acks_select" on public.lesson_acks for select to authenticated
using (public.is_admin() or public.is_head() or public.is_sat_staff() or student_id = public.current_user_student_id());
grant select on public.lesson_acks to authenticated;

-- Ученик отмечает «Прочитал» — только для занятий, которые ему видны
create or replace function public.ack_lesson(p_lesson uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.current_user_student_id(); l record;
begin
  select * into l from public.lessons where id = p_lesson;
  if l is null or v_student is null then raise exception 'Занятие не найдено'; end if;
  if l.student_ids is not null and not (v_student = any (l.student_ids)) then raise exception 'Это занятие не для вас'; end if;
  if not exists (
    select 1 from public.enrollments e
    where e.group_id = l.group_id and e.student_id = v_student
      and e.starts_on <= l.lesson_date and (e.ends_on is null or e.ends_on >= l.lesson_date)
  ) then raise exception 'Это занятие не для вашей группы'; end if;
  insert into public.lesson_acks (lesson_id, student_id) values (p_lesson, v_student) on conflict do nothing;
end;
$$;

-- Ученики группы (сейчас) — чтобы выбрать, кому назначить office hours
create or replace function public.sat_group_roster(p_group uuid)
returns table (student_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select s.id, trim(s.last_name || ' ' || s.first_name)
  from public.enrollments e join public.students s on s.id = e.student_id
  where e.group_id = p_group and e.ends_on is null
    and (public.is_admin() or public.is_head() or public.is_sat_staff())
  order by s.last_name, s.first_name;
$$;

-- 2) Доступ к тесту: список присутствующих + код --------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'test_assignments' and column_name = 'gated') then
    alter table public.test_assignments add column gated boolean not null default true;
    -- уже опубликованные тесты остаются открытыми, как были
    update public.test_assignments set gated = false;
  end if;
end $$;
alter table public.test_assignments add column if not exists access_code text;
alter table public.test_assignments add column if not exists code_until timestamptz;

create table if not exists public.test_allowed (
  assignment_id uuid not null references public.test_assignments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  granted_by uuid default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);
alter table public.test_allowed enable row level security;
drop policy if exists "test_allowed_select" on public.test_allowed;
create policy "test_allowed_select" on public.test_allowed for select to authenticated using (public.is_sat_team());
drop policy if exists "test_allowed_write" on public.test_allowed;
create policy "test_allowed_write" on public.test_allowed for all to authenticated
using (public.can_edit_group((select a.group_id from public.test_assignments a where a.id = assignment_id)))
with check (public.can_edit_group((select a.group_id from public.test_assignments a where a.id = assignment_id)));
grant select, insert, delete on public.test_allowed to authenticated;

-- Список тестов ученика: + нужен ли запуск учителем, допущен ли, действует ли код
drop function if exists public.my_tests();
create function public.my_tests()
returns table (
  assignment_id uuid, test_id uuid, title text, description text, opens_at timestamptz, closes_at timestamptz,
  sections integer, questions integer, total_minutes integer,
  attempt_id uuid, started_at timestamptz, finished_at timestamptz, score numeric, max_score numeric, review_open boolean,
  gated boolean, allowed boolean, code_active boolean
)
language sql stable security definer set search_path = public as $$
  select a.id, t.id, t.title, t.description, a.opens_at, a.closes_at,
    (select count(*) from public.test_sections s where s.test_id = t.id)::integer,
    (select count(*) from public.test_questions q join public.test_sections s on s.id = q.section_id where s.test_id = t.id)::integer,
    (select coalesce(sum(s.minutes), 0) from public.test_sections s where s.test_id = t.id)::integer,
    at.id, at.started_at, at.finished_at, at.score, at.max_score, a.review_open,
    a.gated,
    exists (select 1 from public.test_allowed x where x.assignment_id = a.id and x.student_id = e.student_id),
    (a.access_code is not null and a.code_until > now())
  from public.test_assignments a
  join public.online_tests t on t.id = a.test_id
  join public.enrollments e on e.group_id = a.group_id and e.ends_on is null and e.student_id = public.current_user_student_id()
  left join public.test_attempts at on at.test_id = t.id and at.student_id = e.student_id
  where a.opens_at <= now() + interval '14 days'
  order by a.opens_at desc;
$$;

-- Старт: для теста «только в классе» — ученик в списке присутствующих и ввёл действующий код
drop function if exists public.start_test(uuid);
create or replace function public.start_test(p_assignment uuid, p_code text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.current_user_student_id();
  a record;
  v_id uuid;
begin
  select * into a from public.test_assignments where id = p_assignment;
  if a is null or v_student is null then raise exception 'Тест не найден'; end if;
  if not exists (select 1 from public.enrollments e where e.group_id = a.group_id and e.student_id = v_student and e.ends_on is null) then
    raise exception 'Этот тест не для вашей группы';
  end if;
  select id into v_id from public.test_attempts where test_id = a.test_id and student_id = v_student;
  if v_id is not null then return v_id; end if;
  if now() < a.opens_at then raise exception 'Тест ещё не открыт'; end if;
  if a.closes_at is not null and now() > a.closes_at then raise exception 'Тест уже закрыт'; end if;
  if a.gated then
    if not exists (select 1 from public.test_allowed x where x.assignment_id = a.id and x.student_id = v_student) then
      raise exception 'Учитель ещё не открыл вам этот тест — он запускается на занятии';
    end if;
    if a.access_code is null or a.code_until is null or a.code_until < now() then
      raise exception 'Код не действует — попросите учителя открыть тест заново';
    end if;
    if coalesce(trim(p_code), '') <> a.access_code then raise exception 'Неверный код'; end if;
  end if;
  if not exists (select 1 from public.test_sections where test_id = a.test_id) then raise exception 'В тесте нет модулей'; end if;
  insert into public.test_attempts (assignment_id, test_id, student_id, current_position, section_started_at)
  values (a.id, a.test_id, v_student, (select min(position) from public.test_sections where test_id = a.test_id), now())
  returning id into v_id;
  return v_id;
end;
$$;

-- 3) Время на вопрос -------------------------------------------------------------------------------------
alter table public.test_answers add column if not exists time_ms integer not null default 0;

create or replace function public.add_question_time(p_attempt uuid, p_question uuid, p_ms integer)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if not public.own_attempt(p_attempt) then raise exception 'Нет доступа'; end if;
  if p_ms is null or p_ms <= 0 then return; end if;
  select * into t from public.test_attempts where id = p_attempt;
  if t.finished_at is not null then return; end if;
  if not exists (
    select 1 from public.test_questions q join public.test_sections s on s.id = q.section_id
    where q.id = p_question and s.test_id = t.test_id and s.position = t.current_position
  ) then return; end if;
  insert into public.test_answers (attempt_id, question_id, answer, time_ms)
  values (p_attempt, p_question, '', least(p_ms, 600000))
  on conflict (attempt_id, question_id) do update set time_ms = least(public.test_answers.time_ms + least(p_ms, 600000), 10800000);
end;
$$;

-- 4) «Требует внимания» ----------------------------------------------------------------------------------
-- Группы, за которые отвечает сотрудник: свои (учитель/куратор), у руководителя и старшего — все группы SAT
create or replace function public.my_sat_groups()
returns setof uuid language sql stable security definer set search_path = public as $$
  select g.id from public.groups g
  where g.course_id = 'sat' and not g.archived
    and (
      public.can_manage_sat() or public.is_admin()
      or exists (
        select 1 from public.group_staff gs
        where gs.group_id = g.id and gs.user_id = auth.uid()
          and gs.starts_on <= current_date and (gs.ends_on is null or gs.ends_on >= current_date)
      )
    );
$$;

create or replace function public.sat_attention()
returns table (kind text, group_id uuid, group_name text, ref_id uuid, ref_date date, student_id uuid, student_name text, detail text)
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Almaty')::date;
begin
  if not (public.is_admin() or public.is_head() or public.is_sat_staff()) then return; end if;

  -- Прошедшие занятия без посещаемости (за 14 дней)
  return query
  select 'unmarked'::text, l.group_id, g.name, l.id, l.lesson_date, null::uuid, null::text,
         (coalesce(nullif(l.title, ''), 'Занятие') || ', ' || to_char(l.starts_at, 'HH24:MI'))::text
  from public.lessons l join public.groups g on g.id = l.group_id
  where l.group_id in (select public.my_sat_groups())
    and l.kind = 'lesson' and l.status = 'planned'
    and l.lesson_date between v_today - 14 and v_today
    and (l.lesson_date < v_today or l.starts_at + make_interval(mins => l.duration_min) < (now() at time zone 'Asia/Almaty')::time)
    and not exists (select 1 from public.lesson_marks m where m.lesson_id = l.id and m.attendance is not null)
  order by l.lesson_date, l.starts_at;

  -- Предстоящие office hours: кто ещё не отметил «Прочитал»
  return query
  select 'oh_unread'::text, l.group_id, g.name, l.id, l.lesson_date, null::uuid, null::text,
         string_agg(trim(s.last_name || ' ' || s.first_name), ', ' order by s.last_name)::text
  from public.lessons l
  join public.groups g on g.id = l.group_id
  join public.enrollments e on e.group_id = l.group_id and e.ends_on is null
  join public.students s on s.id = e.student_id
  where l.group_id in (select public.my_sat_groups())
    and l.kind = 'office_hours' and l.status = 'planned'
    and l.lesson_date between v_today and v_today + 7
    and (l.student_ids is null or s.id = any (l.student_ids))
    and not exists (select 1 from public.lesson_acks k where k.lesson_id = l.id and k.student_id = s.id)
  group by l.id, l.group_id, g.name, l.lesson_date
  order by l.lesson_date;

  -- Тесты: сдали, а разбор не открыт и в моки не перенесено
  return query
  select 'test_review'::text, a.group_id, g.name, t.id, (min(at.finished_at) at time zone 'Asia/Almaty')::date, null::uuid, null::text,
         (t.title || ' — сдали ' || count(at.id))::text
  from public.test_assignments a
  join public.online_tests t on t.id = a.test_id
  join public.groups g on g.id = a.group_id
  join public.test_attempts at on at.assignment_id = a.id and at.finished_at is not null
  where a.group_id in (select public.my_sat_groups())
    and not a.review_open
    and not exists (select 1 from public.mocks m where m.title = t.title || ' (онлайн)')
  group by a.id, a.group_id, g.name, t.id, t.title;

  -- Ученики в зоне риска
  return query
  with my as (
    select e.student_id, e.group_id, g.name as group_name, e.target_score, e.sat_date,
           trim(s.last_name || ' ' || s.first_name) as full_name
    from public.enrollments e
    join public.groups g on g.id = e.group_id
    join public.students s on s.id = e.student_id
    where e.ends_on is null and e.group_id in (select public.my_sat_groups())
  ),
  last2 as (
    select my.student_id, array_agg(x.attendance order by x.lesson_date desc) as att
    from my
    cross join lateral (
      select m.attendance, l.lesson_date from public.lesson_marks m join public.lessons l on l.id = m.lesson_id
      where m.student_id = my.student_id and l.group_id = my.group_id and m.attendance is not null and l.kind = 'lesson'
      order by l.lesson_date desc, l.starts_at desc limit 2
    ) x
    group by my.student_id
  ),
  mocks2 as (
    select my.student_id, array_agg(x.total order by x.mock_date desc) as totals
    from my
    cross join lateral (
      select r.total, m.mock_date from public.mock_results r join public.mocks m on m.id = r.mock_id
      where r.student_id = my.student_id and r.total is not null
      order by m.mock_date desc limit 2
    ) x
    group by my.student_id
  )
  select 'risk'::text, my.group_id, my.group_name, null::uuid, null::date, my.student_id, my.full_name,
         concat_ws('; ',
           case when l2.att = array['absent', 'absent'] then 'два пропуска подряд' end,
           case when array_length(m2.totals, 1) = 2 and m2.totals[1] <= m2.totals[2] - 30 then 'мок упал: ' || m2.totals[2] || ' → ' || m2.totals[1] end,
           case when my.target_score is null or my.sat_date is null then 'нет ' || concat_ws(' и ', case when my.target_score is null then 'цели' end, case when my.sat_date is null then 'даты SAT' end) end
         )::text
  from my
  left join last2 l2 on l2.student_id = my.student_id
  left join mocks2 m2 on m2.student_id = my.student_id
  where l2.att = array['absent', 'absent']
     or (array_length(m2.totals, 1) = 2 and m2.totals[1] <= m2.totals[2] - 30)
     or my.target_score is null or my.sat_date is null
  order by my.group_name, my.full_name;
end;
$$;

-- Права на функции
revoke execute on function public.ack_lesson(uuid) from public, anon;
revoke execute on function public.sat_group_roster(uuid) from public, anon;
revoke execute on function public.my_tests() from public, anon;
revoke execute on function public.start_test(uuid, text) from public, anon;
revoke execute on function public.add_question_time(uuid, uuid, integer) from public, anon;
revoke execute on function public.my_sat_groups() from public, anon;
revoke execute on function public.sat_attention() from public, anon;
grant execute on function public.ack_lesson(uuid) to authenticated;
grant execute on function public.sat_group_roster(uuid) to authenticated;
grant execute on function public.my_tests() to authenticated;
grant execute on function public.start_test(uuid, text) to authenticated;
grant execute on function public.add_question_time(uuid, uuid, integer) to authenticated;
grant execute on function public.my_sat_groups() to authenticated;
grant execute on function public.sat_attention() to authenticated;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- migration-parent-reports.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — отчёты родителям (менторство)
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Откат: rollback-parent-reports.sql
--
-- 1. После индивидуальной встречи ментор пишет «отчёт о встрече» из трёх пунктов
--    (что получилось / над чем работаем / чем помочь дома). Хранится в заметках ментора —
--    ученик и родитель их не видят, пока ментор не отправит месячный отчёт.
-- 2. Telegram-группа ученика привязывается к карточке кодом (/connect 1234 в группе).
-- 3. Месячный отчёт: общее впечатление и групповые встречи от ментора + собранные встречи и цифры.
--    Отправляется ботом в группу, кнопки «Прочитали» / «Есть вопрос».

-- 1) Отчёт о встрече (только ментор) ------------------------------------------------
alter table public.meeting_mentor_notes add column if not exists parent_win text not null default '';
alter table public.meeting_mentor_notes add column if not exists parent_focus text not null default '';
alter table public.meeting_mentor_notes add column if not exists parent_help text not null default '';

-- 2) Telegram-группа ученика ---------------------------------------------------------------
create table if not exists public.student_telegram (
  student_id uuid primary key references public.students (id) on delete cascade,
  chat_id bigint unique,
  chat_title text not null default '',
  link_code text unique,
  linked_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists student_telegram_set_updated_at on public.student_telegram;
create trigger student_telegram_set_updated_at
before update on public.student_telegram
for each row execute function public.set_updated_at();

-- 3) Месячные отчёты родителям ---------------------------------------------------------------
create table if not exists public.parent_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  overall text not null default '',
  group_note text not null default '',
  help text not null default '',
  message text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  telegram_message_id bigint,
  read_at timestamptz,
  question_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, month)
);
create index if not exists parent_reports_month_idx on public.parent_reports (month);

drop trigger if exists parent_reports_set_updated_at on public.parent_reports;
create trigger parent_reports_set_updated_at
before update on public.parent_reports
for each row execute function public.set_updated_at();

-- 4) Права: только ментор/руководитель (сервер бота работает с service role) ----------------
alter table public.student_telegram enable row level security;
alter table public.parent_reports enable row level security;

drop policy if exists "student_telegram_admin" on public.student_telegram;
create policy "student_telegram_admin" on public.student_telegram for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "parent_reports_admin" on public.parent_reports;
create policy "parent_reports_admin" on public.parent_reports for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.student_telegram, public.parent_reports to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-program-plan.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — план менторской программы на год (фокусы месяцев)
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Откат: rollback-program-plan.sql
--
-- Ментор правит план на странице «План года». Родители видят его в своём кабинете,
-- а месячный отчёт добавляет блок «Что дальше» из следующего месяца.
-- В плане нет личных данных, поэтому читать его можно всем (и по родительской ссылке).

create table if not exists public.program_plan (
  id uuid primary key default gen_random_uuid(),
  start_month text not null check (start_month ~ '^\d{4}-\d{2}$'),
  end_month text not null check (end_month ~ '^\d{4}-\d{2}$'),
  phase text not null default 'act' check (phase in ('act', 'speech', 'team', 'res', 'tech', 'fest')),
  title text not null default '',
  short text not null default '',
  format text not null default 'individual' check (format in ('individual', 'team')),
  focus text not null default '',
  result text not null default '',
  steps text not null default '',      -- по строке на неделю/этап
  diff text not null default '',       -- «Чем отличается»
  grade10 text not null default '',    -- вариант для 10 класса (пусто — одинаково для всех)
  home text not null default '',       -- «Как помочь дома»
  takeaway text not null default '',   -- «Итог» для портфолио
  updated_at timestamptz not null default now(),
  check (end_month >= start_month)
);
create index if not exists program_plan_start_idx on public.program_plan (start_month);

drop trigger if exists program_plan_set_updated_at on public.program_plan;
create trigger program_plan_set_updated_at
before update on public.program_plan
for each row execute function public.set_updated_at();

alter table public.program_plan enable row level security;

drop policy if exists "program_plan_read" on public.program_plan;
create policy "program_plan_read" on public.program_plan for select to anon, authenticated using (true);

drop policy if exists "program_plan_admin" on public.program_plan;
create policy "program_plan_admin" on public.program_plan for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select on public.program_plan to anon, authenticated;
grant insert, update, delete on public.program_plan to authenticated;

-- Первое заполнение — план «Менторская работа до мая» (август 2026 — май 2027). Только если таблица пустая.
insert into public.program_plan (start_month, end_month, phase, title, short, format, focus, result, steps, diff, grade10, home, takeaway)
select * from (values
  ('2026-08', '2026-09', 'act', 'Социальные проекты', 'Свой проект и реальное дело для сообщества', 'individual',
   'Находим проблему в своём сообществе и делаем реальное дело. Параллельно закрепляем планирование времени и академическое письмо.',
   'Каждый ученик делает свой социальный проект и защищает его перед наставниками.',
   E'Выбираем проблему и идею\nПланируем и работаем над проектом\nГотовимся к защите\nЗащита проекта',
   'Свой проект и реальное действие в течение двух месяцев.', '', '',
   'Первый проект в портфолио: идея, реальное действие и защита.'),
  ('2026-10', '2026-10', 'speech', 'Public Speaking & Leadership', 'Выступление в формате TED Talks', 'individual',
   'Учимся выступать перед аудиторией и говорить убедительно. Каждый готовит собственное выступление в формате TED Talks.',
   'Выступление на выбранную тему в формате TED Talks и защита перед наставниками.',
   E'Задание: тема и формат TED Talks\nСценарий и план выступления\nПрезентация и речь\nЗащита',
   '', 'Вместо TED Talks подбираем летние программы и конкурсы под каждого и выбираем, куда подаваться.', '',
   'Первое публичное выступление в формате TED. Навык, на который опираются все следующие защиты.'),
  ('2026-11', '2026-11', 'team', 'Челлендж «Решаем реальную проблему»', 'Командный проект и защита', 'team',
   'Учимся замечать проблему вокруг, искать решение и доводить его до результата в команде. Первый месяц, когда ребята работают над общим проектом.',
   'Командный проект: решение реальной проблемы из жизни школы, района или города. Описание проблемы, решение, прототип или план и защита перед наставниками.',
   E'Разбираем проблему, выбираем задачу\nСобираем команды, распределяем роли\nРаботаем над решением и прототипом\nЗащита проекта',
   'В отличие от осенних соцпроектов работаем командой, по методу и за четыре недели.',
   'Проектная работа по профессиям. Большинство работает соло, команда по желанию. Метод решения проблем тот же.',
   'Не делать проект за ребёнка. Попросить объяснить, что он сделал и почему.', ''),
  ('2026-12', '2026-12', 'res', 'Запуск ресёрча', 'Тема, вопрос и план исследования', 'individual',
   'Превращаем интерес в исследовательский вопрос: ищем и проверяем источники, честно работаем с ИИ, выбираем метод.',
   'У каждого утверждённая тема, сформулированный вопрос и план работы. В конце месяца защита плана за 2 минуты.',
   E'Как искать и проверять информацию, честная работа с ИИ\nОт интереса к вопросу: сужаем тему\nМетод и правила этики исследований\nЗащита плана',
   '', '', 'Не выбирать тему за ребёнка. Спрашивать: «как ты это проверишь?»', ''),
  ('2027-01', '2027-01', 'res', 'Ресёрч + профессия', 'Проверенный метод и интервью со специалистом', 'individual',
   'Проверяем метод на небольшой пробе и начинаем сбор данных. Параллельно изучаем профессию и берём интервью у специалиста.',
   'Рабочий инструмент исследования (анкета, план наблюдения или таблица данных) и первые данные. Защита «Моя профессия» за 3 минуты.',
   E'Пробный запуск метода, вопросы специалисту\nПравим метод, начинаем сбор, пишем специалисту\nПервая проверка, разбор интервью\nСбор данных, защита «Моя профессия»',
   '', '', 'Помочь найти специалиста для интервью среди знакомых.', ''),
  ('2027-02', '2027-02', 'res', 'Сбор данных + страны для поступления', 'Данные собраны, страна изучена', 'individual',
   'Основной этап исследования: сбор и первичная обработка данных. Параллельно изучаем страны: требования, стоимость, стипендии, сроки.',
   'Собранные данные и контрольная точка в конце месяца. Мини-исследование о стране с таблицей сравнения и короткой защитой.',
   E'Проверка данных, критерии сравнения стран\nОбработка данных, информация о стране\nВторая проверка, защита «Страна»\nКонтрольная точка по исследованию',
   '', '', 'Не давить по срокам: этап самый длинный. Помочь планировать неделю.', ''),
  ('2027-03', '2027-03', 'res', 'Анализ и защита ресёрча', 'Готовая работа и защита', 'individual',
   'Анализируем данные, делаем выводы, оформляем и защищаем работу. Отдельное занятие о стрессе и нагрузке: как готовиться без паники.',
   'Работа с вопросом, методом, результатами и ограничениями, постер или презентация и защита перед наставниками.',
   E'Анализ: таблицы и графики\nВыводы, ограничения, оформление\nЗащита ресёрча\nДоработка по отзывам и рефлексия',
   '', '', 'Слушать репетицию, задавать вопросы как «неожиданный зритель», следить за сном.', ''),
  ('2027-04', '2027-04', 'tech', 'Tech&AI: сайт-портфолио + финансовая грамотность', 'Личный сайт-портфолио', 'individual',
   'Собираем проекты года на личном сайте с помощью ИИ. Приглашённый гость показывает практические техники финансовой грамотности.',
   'Личный сайт-портфолио. Ребёнок объясняет, что сделал сам и где использовал ИИ. Базовые навыки управления деньгами на практике.',
   E'Что показывать в портфолио и как структурировать\nПервая версия сайта с помощью ИИ\nВстреча с гостем: финансовая грамотность\nДоработка и защита сайта',
   '', '', 'Попросить показать сайт и объяснить, как он устроен. Вместе решить, что публиковать: без адреса, телефона и фото без согласия.', ''),
  ('2027-05', '2027-05', 'fest', 'FEST и рефлексия года', 'Ярмарка проектов для гостей и родителей', 'individual',
   'Показываем лучшее на FEST гостям, родителям и другим ученикам. Учимся рассказывать о работе и отвечать на вопросы.',
   'Каждый показывает лучшее (проект, ресёрч или оба) на своём стенде и рассказывает за 3 минуты. Итог года и цели на лето.',
   E'Выбираем работу, готовим стенд\nРепетируем рассказ на 3 минуты\nFEST\nРефлексия года, цели на лето',
   '', '', 'Прийти на FEST, послушать рассказ ребёнка и задать вопросы из интереса.', '')
) as v(start_month, end_month, phase, title, short, format, focus, result, steps, diff, grade10, home, takeaway)
where not exists (select 1 from public.program_plan);

-- ════════════════════════════════════════════════════════════
-- migration-pinned.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — закреплённые ученики (например, демо-ученик для показа родителям)
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Закреплённые стоят первыми в реестре и на странице «Родителям». Откат: alter table public.students drop column if exists pinned;
alter table public.students add column if not exists pinned boolean not null default false;

-- ════════════════════════════════════════════════════════════
-- migration-mentor-reminders.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — напоминания ментору в Telegram об отчётах родителям
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Откат: drop table if exists public.mentor_telegram;
--
-- Ментор нажимает «Подключить напоминания» на странице «Родителям», открывает бота по ссылке —
-- бот запоминает его личный чат. В последние дни месяца и первые дни следующего бот пишет,
-- сколько отчётов ещё не отправлено.

create table if not exists public.mentor_telegram (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chat_id bigint unique,
  link_code text unique,
  linked_at timestamptz,
  last_reminded_on date,
  updated_at timestamptz not null default now()
);

drop trigger if exists mentor_telegram_set_updated_at on public.mentor_telegram;
create trigger mentor_telegram_set_updated_at
before update on public.mentor_telegram
for each row execute function public.set_updated_at();

alter table public.mentor_telegram enable row level security;

-- ментор видит только свою запись; создаёт и меняет её сервер (service role)
drop policy if exists "mentor_telegram_own" on public.mentor_telegram;
create policy "mentor_telegram_own" on public.mentor_telegram for select to authenticated
using (user_id = auth.uid() and public.is_admin());

grant select on public.mentor_telegram to authenticated;

-- ════════════════════════════════════════════════════════════
-- migration-parent-essays.sql
-- ════════════════════════════════════════════════════════════

-- Digital Passport TODAY Scholars — родители видят проверенные эссе: текст, оценки и комментарий ментора
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Черновики и работы на проверке по-прежнему без текста и комментария.
-- Откат: снова выполнить блок get_essays_by_parent_token из migration-workflow.sql и
--        drop policy if exists "essay_topics_read_anon" on public.essay_topics; revoke select on public.essay_topics from anon;

create or replace function public.get_essays_by_parent_token(p_token text)
returns setof public.essay_submissions
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.student_id, e.topic_id, e.version,
         case when e.status in ('accepted', 'revision') and e.reviewed_at is not null then e.body else ''::text end,
         e.word_count, e.status, e.submitted_at,
         e.score_structure, e.score_content, e.score_language, e.score_topic,
         case when e.status in ('accepted', 'revision') and e.reviewed_at is not null then e.mentor_comment else ''::text end,
         e.reviewed_at, e.created_at, e.updated_at
  from public.essay_submissions e
  join public.students s on s.id = e.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token;
$$;

grant execute on function public.get_essays_by_parent_token(text) to anon, authenticated;

-- Темы эссе — не личные данные, нужны родителю для названий
drop policy if exists "essay_topics_read_anon" on public.essay_topics;
create policy "essay_topics_read_anon" on public.essay_topics for select to anon using (true);
grant select on public.essay_topics to anon;
