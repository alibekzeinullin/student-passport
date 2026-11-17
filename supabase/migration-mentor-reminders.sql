-- Digital Passport TODAY Scholars — напоминания ментору в Telegram об отчётах родителям
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Откат: drop table if exists public.mentor_telegram;
--
-- Ментор нажимает «Подключить напоминания» на странице «Родителям», открывает бота по ссылке —
-- бот запоминает его личный чат. В последние дни месяца и первые дни следующего бот пишет,
-- сколько отчётов ещё не отправлено.

create table if not exists public.mentor_telegram (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chat_id bigint unique,
  link_code text unique,
  linked_at timestamptz,
  last_reminded_on date,
  updated_at timestamptz not null default now()
);

drop trigger if exists mentor_telegram_set_updated_at on public.mentor_telegram;
create trigger mentor_telegram_set_updated_at
before update on public.mentor_telegram
for each row execute function public.set_updated_at();

alter table public.mentor_telegram enable row level security;

-- ментор видит только свою запись; создаёт и меняет её сервер (service role)
drop policy if exists "mentor_telegram_own" on public.mentor_telegram;
create policy "mentor_telegram_own" on public.mentor_telegram for select to authenticated
using (user_id = auth.uid() and public.is_admin());

grant select on public.mentor_telegram to authenticated;
