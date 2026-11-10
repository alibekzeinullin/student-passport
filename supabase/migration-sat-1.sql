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
