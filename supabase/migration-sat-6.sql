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
