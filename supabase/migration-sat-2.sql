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
