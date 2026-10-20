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
