-- Digital Passport TODAY Scholars — «Проекты и исследования» ученика
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- (или просто запустите заново supabase/setup-all.sql). Файл можно запускать повторно.

create table if not exists public.student_works (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  kind text not null check (kind in ('project', 'research')),
  title text not null default '',
  status text not null default 'idea' check (status in ('idea', 'active', 'paused', 'done')),
  -- Проект
  problem text not null default '',
  goal text not null default '',
  team text not null default '',
  my_role text not null default '',
  results text not null default '',
  links jsonb not null default '[]'::jsonb,
  -- Исследование
  question text not null default '',
  hypothesis text not null default '',
  supervisor text not null default '',
  competition text not null default '',
  -- Этапы: [{id, title, due, done, note, mentorComment, commentAt}]
  stages jsonb not null default '[]'::jsonb,
  mentor_comment text not null default '',
  legacy_id text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_works_student_idx on public.student_works (student_id);
create unique index if not exists student_works_legacy_idx on public.student_works (student_id, legacy_id) where legacy_id is not null;

drop trigger if exists student_works_set_updated_at on public.student_works;
create trigger student_works_set_updated_at
before update on public.student_works
for each row execute function public.set_updated_at();

alter table public.student_works enable row level security;

drop policy if exists "works_select" on public.student_works;
create policy "works_select" on public.student_works for select to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "works_insert" on public.student_works;
create policy "works_insert" on public.student_works for insert to authenticated
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "works_update" on public.student_works;
create policy "works_update" on public.student_works for update to authenticated
using (public.is_admin() or student_id = public.current_user_student_id())
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "works_delete" on public.student_works;
create policy "works_delete" on public.student_works for delete to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

grant select, insert, update, delete on public.student_works to authenticated;

-- Комментарии ментора (общий и к этапам) меняет только ментор
create or replace function public.enforce_work_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st jsonb;
  prev jsonb;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.student_id is distinct from old.student_id
       or new.mentor_comment is distinct from old.mentor_comment then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
  elsif coalesce(new.mentor_comment, '') <> '' then
    raise exception 'Комментарий пишет ментор' using errcode = '42501';
  end if;

  for st in select * from jsonb_array_elements(coalesce(new.stages, '[]'::jsonb)) loop
    prev := null;
    if tg_op = 'UPDATE' then
      select e into prev from jsonb_array_elements(coalesce(old.stages, '[]'::jsonb)) e
      where e->>'id' = st->>'id' limit 1;
    end if;
    if coalesce(st->>'mentorComment', '') is distinct from coalesce(prev->>'mentorComment', '')
       or coalesce(st->>'commentAt', '') is distinct from coalesce(prev->>'commentAt', '') then
      raise exception 'Комментарий к этапу пишет ментор' using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists student_works_rights on public.student_works;
create trigger student_works_rights
before insert or update on public.student_works
for each row execute function public.enforce_work_rights();

-- Краткая сводка в students.projects — на ней держится балл «Академ успехи» и отчёты
create or replace function public.sync_student_projects(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students s
  set projects = coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id::text,
      'title', case when w.kind = 'research' then 'Исследование: ' || w.title else w.title end,
      'role', w.my_role,
      'description', case when w.kind = 'research' then w.question else w.problem end,
      'status', case w.status when 'done' then 'Завершён' when 'active' then 'В работе'
                              when 'paused' then 'На паузе' else 'Идея' end,
      'impactMetrics', w.results
    ) order by w.sort, w.created_at)
    from public.student_works w
    where w.student_id = p_student_id and w.title <> ''
  ), '[]'::jsonb)
  where s.id = p_student_id;
end;
$$;

create or replace function public.student_works_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_student_projects(coalesce(new.student_id, old.student_id));
  if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
    perform public.sync_student_projects(old.student_id);
  end if;
  return null;
end;
$$;

drop trigger if exists student_works_sync on public.student_works;
create trigger student_works_sync
after insert or update or delete on public.student_works
for each row execute function public.student_works_sync();

-- Перенос старой «Внеучебной деятельности» (один раз; повторный запуск не дублирует)
insert into public.student_works (student_id, kind, title, status, problem, my_role, results, legacy_id, sort)
select s.id, 'project',
       coalesce(p->>'title', ''),
       case p->>'status' when 'Завершён' then 'done' when 'В работе' then 'active'
                         when 'На паузе' then 'paused' else 'idea' end,
       coalesce(p->>'description', ''),
       coalesce(p->>'role', ''),
       coalesce(p->>'impactMetrics', ''),
       coalesce(p->>'id', md5(p::text)),
       (ord)::int
from public.students s
cross join lateral jsonb_array_elements(coalesce(s.projects, '[]'::jsonb)) with ordinality as t(p, ord)
where coalesce(p->>'title', '') <> ''
  -- свои же записи (id = uuid работы) не переносим повторно
  and not exists (select 1 from public.student_works w where w.student_id = s.id and w.id::text = p->>'id')
on conflict do nothing;

-- Для родителя по ссылке
create or replace function public.get_works_by_parent_token(p_token text)
returns setof public.student_works
language sql
stable
security definer
set search_path = public
as $$
  select w.* from public.student_works w
  join public.students s on s.id = w.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token
  order by w.sort, w.created_at;
$$;

grant execute on function public.get_works_by_parent_token(text) to anon, authenticated;

-- Журнал действий
do $$
begin
  if to_regprocedure('public.log_change()') is not null then
    drop trigger if exists student_works_activity on public.student_works;
    create trigger student_works_activity
    after insert or update or delete on public.student_works
    for each row execute function public.log_change();
  end if;
end;
$$;
