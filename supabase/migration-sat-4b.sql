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
