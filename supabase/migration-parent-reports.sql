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
