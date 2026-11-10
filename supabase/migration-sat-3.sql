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
