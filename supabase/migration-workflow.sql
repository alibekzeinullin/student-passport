-- Digital Passport TODAY Scholars — эссе (100 тем) и шаблоны встреч
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно.

-- 1) Темы эссе -------------------------------------------------------------
create table if not exists public.essay_topics (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique,
  title text not null,
  prompt text not null default '',
  created_at timestamptz not null default now()
);

alter table public.essay_topics enable row level security;

drop policy if exists "essay_topics_read" on public.essay_topics;
create policy "essay_topics_read" on public.essay_topics for select to authenticated using (true);

drop policy if exists "essay_topics_admin" on public.essay_topics;
create policy "essay_topics_admin" on public.essay_topics for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.essay_topics to authenticated;

-- 2) Работы учеников (каждая версия — отдельная строка) --------------------
create table if not exists public.essay_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  topic_id uuid not null references public.essay_topics (id) on delete cascade,
  version integer not null default 1,
  body text not null default '',
  word_count integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'accepted', 'revision')),
  submitted_at timestamptz,
  -- Проверка ментора: 4 критерия по 10 баллов
  score_structure integer check (score_structure between 1 and 10),
  score_content integer check (score_content between 1 and 10),
  score_language integer check (score_language between 1 and 10),
  score_topic integer check (score_topic between 1 and 10),
  mentor_comment text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, topic_id, version)
);

create index if not exists essay_submissions_student_idx on public.essay_submissions (student_id);
create index if not exists essay_submissions_status_idx on public.essay_submissions (status);

drop trigger if exists essay_submissions_set_updated_at on public.essay_submissions;
create trigger essay_submissions_set_updated_at
before update on public.essay_submissions
for each row execute function public.set_updated_at();

alter table public.essay_submissions enable row level security;

drop policy if exists "essays_select" on public.essay_submissions;
create policy "essays_select" on public.essay_submissions for select to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "essays_insert" on public.essay_submissions;
create policy "essays_insert" on public.essay_submissions for insert to authenticated
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "essays_update" on public.essay_submissions;
create policy "essays_update" on public.essay_submissions for update to authenticated
using (public.is_admin() or student_id = public.current_user_student_id())
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "essays_delete" on public.essay_submissions;
create policy "essays_delete" on public.essay_submissions for delete to authenticated
using (public.is_admin() or (student_id = public.current_user_student_id() and status = 'draft'));

grant select, insert, update, delete on public.essay_submissions to authenticated;

-- Ученик: пишет черновик и сдаёт; оценки и статусы проверки ставит только ментор
create or replace function public.enforce_essay_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    if new.status in ('accepted', 'revision') and new.reviewed_at is null then
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
  else
    if old.status <> 'draft' then
      raise exception 'Работа уже сдана — изменить можно только новую версию' using errcode = '42501';
    end if;
    if new.status not in ('draft', 'submitted')
       or new.student_id is distinct from old.student_id
       or new.topic_id is distinct from old.topic_id
       or new.version is distinct from old.version then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
  end if;

  if new.score_structure is not null or new.score_content is not null
     or new.score_language is not null or new.score_topic is not null
     or coalesce(new.mentor_comment, '') <> '' or new.reviewed_at is not null then
    raise exception 'Оценку ставит только ментор' using errcode = '42501';
  end if;

  if new.status = 'submitted' and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists essay_submissions_rights on public.essay_submissions;
create trigger essay_submissions_rights
before insert or update on public.essay_submissions
for each row execute function public.enforce_essay_rights();

-- Место ученика в рейтинге (без чужих имён)
create or replace function public.my_essay_rank()
returns table (accepted integer, place integer, total_students integer)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select s.id as student_id,
           count(distinct e.topic_id) filter (where e.status = 'accepted') as accepted
    from public.students s
    left join public.essay_submissions e on e.student_id = s.id
    where coalesce(s.status, 'active') = 'active' or s.id = public.current_user_student_id()
    group by s.id
  ),
  ranked as (
    select student_id, accepted, rank() over (order by accepted desc) as place from counts
  )
  select r.accepted::int, r.place::int, (select count(*) from counts)::int
  from ranked r
  where r.student_id = public.current_user_student_id();
$$;

grant execute on function public.my_essay_rank() to authenticated;

-- Для родителя по ссылке: статусы и оценки эссе (без текста работ и комментариев)
create or replace function public.get_essays_by_parent_token(p_token text)
returns setof public.essay_submissions
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.student_id, e.topic_id, e.version, ''::text, e.word_count, e.status, e.submitted_at,
         e.score_structure, e.score_content, e.score_language, e.score_topic, ''::text,
         e.reviewed_at, e.created_at, e.updated_at
  from public.essay_submissions e
  join public.students s on s.id = e.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token;
$$;

grant execute on function public.get_essays_by_parent_token(text) to anon, authenticated;

-- Журнал действий (если подключена история)
do $$
begin
  if to_regprocedure('public.log_change()') is not null then
    drop trigger if exists essay_submissions_activity on public.essay_submissions;
    create trigger essay_submissions_activity
    after insert or update or delete on public.essay_submissions
    for each row execute function public.log_change();
  end if;
end;
$$;

-- 3) Шаблоны встреч --------------------------------------------------------
create table if not exists public.meeting_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('plan', 'summary', 'homework')),
  title text not null,
  body text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.meeting_templates enable row level security;

drop policy if exists "meeting_templates_admin" on public.meeting_templates;
create policy "meeting_templates_admin" on public.meeting_templates for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.meeting_templates to authenticated;

insert into public.meeting_templates (kind, title, body, sort)
select * from (values
  ('plan', 'Разбор эссе', E'— Как шла работа над эссе, что было сложно?\n— Разобрать 2–3 сильных и 2 слабых места\n— Договориться о правках и сроке новой версии', 1),
  ('plan', 'Выбор олимпиады / конкурса', E'— Какие предметы и темы интересны?\n— Пройтись по ленте возможностей, выбрать 1–2\n— Поставить дедлайн подачи и первый шаг', 2),
  ('plan', 'Цели на месяц', E'— Что получилось за прошлый месяц?\n— 3 цели на этот месяц (учёба / проект / навык)\n— Что может помешать и как это обойти', 3),
  ('plan', 'Учёба и оценки', E'— Как оценки в этой четверти? Где проседает?\n— План на проблемный предмет\n— Кто может помочь (учитель, репетитор, друг)', 4),
  ('plan', 'Проект', E'— Что сделано по проекту с прошлой встречи?\n— Следующий шаг и измеримый результат\n— Нужна ли помощь / контакт', 5),
  ('summary', 'Хорошая встреча', 'Ученик пришёл подготовленным, обсудили … Договорились о …', 1),
  ('summary', 'Домашка не сделана', 'Домашнее задание не выполнено. Причина: … Договорились: …', 2),
  ('homework', 'Эссе 250–300 слов', 'Написать эссе на тему из списка (250–300 слов) и сдать на сайте в разделе «Эссе»', 1),
  ('homework', 'Выбрать олимпиаду', 'Выбрать в ленте возможностей 1 олимпиаду или конкурс и добавить в дедлайны', 2),
  ('homework', 'Прочитать главу', 'Прочитать … и записать 3 главные мысли', 3)
) as v(kind, title, body, sort)
where not exists (select 1 from public.meeting_templates);
