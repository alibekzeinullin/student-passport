-- Digital Passport TODAY Scholars — история действий
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно.
--
-- activity_log пишется автоматически триггерами базы: входы, изменения
-- карточек, встреч, дедлайнов, оценок, ролей, открытия ссылки родителями.
-- Читать может только ментор (админ); писать напрямую не может никто.

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_role text not null default 'system',
  actor_name text not null default '',
  student_id uuid,
  action text not null check (action in ('login', 'insert', 'update', 'delete', 'parent_view')),
  entity text not null,
  fields text[] not null default '{}',
  changes jsonb not null default '{}'::jsonb
);

create index if not exists activity_log_at_idx on public.activity_log (at desc);
create index if not exists activity_log_student_idx on public.activity_log (student_id, at desc);

alter table public.activity_log enable row level security;

drop policy if exists "activity_admin_read" on public.activity_log;
create policy "activity_admin_read"
on public.activity_log for select
to authenticated
using (public.is_admin());

revoke insert, update, delete on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

-- Кто сейчас действует
create or replace function public.activity_actor(out p_id uuid, out p_role text, out p_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  p_id := auth.uid();
  if p_id is null then
    p_role := 'system';
    p_name := '';
    return;
  end if;
  select coalesce(role, 'student'), coalesce(full_name, '') into p_role, p_name
  from public.profiles where id = p_id;
  p_role := coalesce(p_role, 'student');
  p_name := coalesce(p_name, '');
end;
$$;

-- Короткое значение для истории (длинный текст обрезаем)
create or replace function public.activity_short(v jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when v is null then 'null'::jsonb
    when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 160
      then to_jsonb(left(v #>> '{}', 160) || '…')
    when jsonb_typeof(v) in ('array', 'object') then to_jsonb('…'::text)
    else v
  end;
$$;

-- Общий триггер изменений
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_row jsonb := case when tg_op = 'DELETE' then v_old else v_new end;
  v_ignore text[] := array['updated_at', 'created_at', 'attendance_score', 'assignments_score', 'id'];
  v_fields text[] := '{}';
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_student uuid;
  a record;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key = any(v_ignore) then continue; end if;
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_fields := v_fields || v_key;
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_array(public.activity_short(v_old -> v_key), public.activity_short(v_new -> v_key))
        );
      end if;
    end loop;
    -- Только служебные поля (пересчёт баллов и т.п.) — не пишем
    if array_length(v_fields, 1) is null then
      return null;
    end if;
  end if;

  if tg_table_name = 'students' then
    v_student := (v_row ->> 'id')::uuid;
  elsif tg_table_name = 'profiles' then
    v_student := nullif(v_row ->> 'student_id', '')::uuid;
  elsif tg_table_name = 'meeting_mentor_notes' then
    select m.student_id into v_student from public.meetings m where m.id = (v_row ->> 'meeting_id')::uuid;
  else
    v_student := nullif(v_row ->> 'student_id', '')::uuid;
  end if;

  if tg_op = 'INSERT' then
    v_changes := jsonb_strip_nulls(jsonb_build_object(
      'meeting_date', v_new -> 'meeting_date',
      'format', v_new -> 'format',
      'attendance', v_new -> 'attendance',
      'title', public.activity_short(v_new -> 'title'),
      'due_date', v_new -> 'due_date',
      'gpa', v_new -> 'gpa',
      'term_number', v_new -> 'term_number',
      'academic_year', v_new -> 'academic_year'
    ));
  elsif tg_op = 'DELETE' then
    v_changes := jsonb_strip_nulls(jsonb_build_object(
      'meeting_date', v_old -> 'meeting_date',
      'title', public.activity_short(v_old -> 'title'),
      'due_date', v_old -> 'due_date',
      'first_name', v_old -> 'first_name',
      'last_name', v_old -> 'last_name'
    ));
  end if;

  select * into a from public.activity_actor();
  insert into public.activity_log (actor_id, actor_role, actor_name, student_id, action, entity, fields, changes)
  values (a.p_id, a.p_role, a.p_name, v_student, lower(tg_op), tg_table_name, v_fields, v_changes);

  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['students', 'profiles', 'meetings', 'meeting_mentor_notes', 'student_deadlines', 'term_grades']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_activity', t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()',
        t || '_activity', t
      );
    end if;
  end loop;
end;
$$;

-- Входы на сайт
create or replace function public.log_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_student uuid;
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    select role, full_name, student_id into v_role, v_name, v_student from public.profiles where id = new.id;
    insert into public.activity_log (actor_id, actor_role, actor_name, student_id, action, entity)
    values (new.id, coalesce(v_role, 'student'), coalesce(v_name, new.email, ''), v_student, 'login', 'auth');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_sign_in on auth.users;
create trigger on_auth_user_sign_in
after update of last_sign_in_at on auth.users
for each row execute function public.log_sign_in();

-- Родитель открыл ссылку (не чаще раза в 30 минут на ученика)
create or replace function public.log_parent_visit(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  select id into v_student from public.students where parent_access_token = p_token;
  if v_student is null then return; end if;
  if exists (
    select 1 from public.activity_log
    where student_id = v_student and action = 'parent_view' and at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  insert into public.activity_log (actor_role, actor_name, student_id, action, entity)
  values ('parent', 'Родитель', v_student, 'parent_view', 'parent_link');
end;
$$;

grant execute on function public.log_parent_visit(text) to anon, authenticated;

-- Хранить историю 1 год
create or replace function public.activity_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.activity_log where at < now() - interval '365 days';
$$;
