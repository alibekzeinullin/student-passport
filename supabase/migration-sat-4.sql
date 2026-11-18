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
