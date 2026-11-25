-- Digital Passport TODAY Scholars — менторство: цели на четверть, портфолио (Activity List), полезные ссылки
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- (или просто запустите заново supabase/setup-all.sql). Файл можно запускать повторно.
-- Откат — rollback-mentoring-goals.sql.

-- 1) Цели на четверть ------------------------------------------------------------------------------
-- Ставит ментор вместе с учеником; у цели есть число (сколько нужно) и сколько уже сделано.
create table if not exists public.student_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  term text not null,                       -- «2026-27:2» — учебный год и четверть
  title text not null,
  target integer not null default 1 check (target between 1 and 1000),
  done integer not null default 0 check (done between 0 and 1000),
  note text not null default '',
  sort integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_goals_student_idx on public.student_goals (student_id, term);

drop trigger if exists student_goals_set_updated_at on public.student_goals;
create trigger student_goals_set_updated_at before update on public.student_goals
for each row execute function public.set_updated_at();

alter table public.student_goals enable row level security;
drop policy if exists "student_goals_select" on public.student_goals;
create policy "student_goals_select" on public.student_goals for select to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());
drop policy if exists "student_goals_write" on public.student_goals;
create policy "student_goals_write" on public.student_goals for all to authenticated
using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.student_goals to authenticated;

create or replace function public.get_goals_by_parent_token(p_token text)
returns setof public.student_goals
language sql stable security definer set search_path = public as $$
  select g.* from public.student_goals g
  join public.students s on s.id = g.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token
  order by g.term desc, g.sort, g.created_at;
$$;
grant execute on function public.get_goals_by_parent_token(text) to anon, authenticated;

-- 2) Портфолио: то, чего нет в олимпиадах и проектах — волонтёрство, клубы, спорт, лидерство, работа, творчество
-- Ученик добавляет сам (запись ждёт подтверждения ментора), ментор подтверждает или правит.
create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  category text not null default 'other'
    check (category in ('volunteer', 'club', 'sport', 'leadership', 'work', 'art', 'research', 'award', 'other')),
  title text not null,
  organization text not null default '',
  role text not null default '',
  description text not null default '',
  start_date date,
  end_date date,
  hours_per_week numeric(4, 1) check (hours_per_week is null or hours_per_week between 0 and 100),
  weeks_per_year integer check (weeks_per_year is null or weeks_per_year between 0 and 52),
  link text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  mentor_comment text not null default '',
  sort integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists portfolio_items_student_idx on public.portfolio_items (student_id);

drop trigger if exists portfolio_items_set_updated_at on public.portfolio_items;
create trigger portfolio_items_set_updated_at before update on public.portfolio_items
for each row execute function public.set_updated_at();

-- Ученик не подтверждает сам себе: любая его правка снова отправляет запись ментору
create or replace function public.portfolio_student_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    raise exception 'Подтверждённую запись меняет ментор' using errcode = '42501';
  end if;
  new.status := 'pending';
  if tg_op = 'UPDATE' then new.mentor_comment := old.mentor_comment; else new.mentor_comment := ''; end if;
  return new;
end;
$$;
drop trigger if exists portfolio_items_guard on public.portfolio_items;
create trigger portfolio_items_guard before insert or update on public.portfolio_items
for each row execute function public.portfolio_student_guard();

alter table public.portfolio_items enable row level security;
drop policy if exists "portfolio_select" on public.portfolio_items;
create policy "portfolio_select" on public.portfolio_items for select to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());
drop policy if exists "portfolio_insert" on public.portfolio_items;
create policy "portfolio_insert" on public.portfolio_items for insert to authenticated
with check (public.is_admin() or student_id = public.current_user_student_id());
drop policy if exists "portfolio_update" on public.portfolio_items;
create policy "portfolio_update" on public.portfolio_items for update to authenticated
using (public.is_admin() or student_id = public.current_user_student_id())
with check (public.is_admin() or student_id = public.current_user_student_id());
drop policy if exists "portfolio_delete" on public.portfolio_items;
create policy "portfolio_delete" on public.portfolio_items for delete to authenticated
using (public.is_admin() or (student_id = public.current_user_student_id() and status <> 'approved'));
grant select, insert, update, delete on public.portfolio_items to authenticated;

-- Родитель видит только подтверждённые записи
create or replace function public.get_portfolio_by_parent_token(p_token text)
returns setof public.portfolio_items
language sql stable security definer set search_path = public as $$
  select i.* from public.portfolio_items i
  join public.students s on s.id = i.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token and i.status = 'approved'
  order by i.start_date desc nulls last, i.created_at;
$$;
grant execute on function public.get_portfolio_by_parent_token(text) to anon, authenticated;

-- 3) Полезные ссылки по курсам -------------------------------------------------------------------------
-- Менторство — добавляет ментор, SAT — учителя SAT. Ученик видит ссылки своих курсов.
create table if not exists public.useful_links (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses (id) on delete cascade,
  folder text not null default 'Разное',
  title text not null,
  url text not null check (url ~* '^https?://'),
  description text not null default '',
  sort integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists useful_links_course_idx on public.useful_links (course_id, folder, sort);

drop trigger if exists useful_links_set_updated_at on public.useful_links;
create trigger useful_links_set_updated_at before update on public.useful_links
for each row execute function public.set_updated_at();

-- Ученик на курсе (без записей о курсах — старый менторский ученик)
create or replace function public.student_has_course(p_course text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_student_id() is not null and (
    exists (
      select 1 from public.enrollments e
      where e.student_id = public.current_user_student_id() and e.course_id = p_course and e.ends_on is null
    )
    or (
      p_course = 'mentoring'
      and not exists (select 1 from public.enrollments e where e.student_id = public.current_user_student_id() and e.ends_on is null)
    )
  );
$$;

create or replace function public.can_edit_links(p_course text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_course = 'sat' then public.is_admin() or public.is_sat_team() else public.is_admin() end;
$$;

alter table public.useful_links enable row level security;
drop policy if exists "useful_links_select" on public.useful_links;
create policy "useful_links_select" on public.useful_links for select to authenticated
using (public.is_admin() or public.is_head() or public.is_sat_staff() or public.student_has_course(course_id));
drop policy if exists "useful_links_write" on public.useful_links;
create policy "useful_links_write" on public.useful_links for all to authenticated
using (public.can_edit_links(course_id)) with check (public.can_edit_links(course_id));
grant select, insert, update, delete on public.useful_links to authenticated;

revoke execute on function public.student_has_course(text) from public, anon;
revoke execute on function public.can_edit_links(text) from public, anon;
grant execute on function public.student_has_course(text) to authenticated;
grant execute on function public.can_edit_links(text) to authenticated;

notify pgrst, 'reload schema';
