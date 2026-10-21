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
