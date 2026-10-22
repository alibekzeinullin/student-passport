-- Digital Passport TODAY Scholars — достижения: результат олимпиады / конкурса
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- (или просто запустите заново supabase/setup-all.sql). Файл можно запускать повторно.

-- Результат отмечает только ментор: прошёл на следующий этап / призёр
alter table public.student_deadlines
  add column if not exists result text;

alter table public.student_deadlines drop constraint if exists student_deadlines_result_check;
alter table public.student_deadlines
  add constraint student_deadlines_result_check
  check (result is null or result in ('advanced', 'prize'));

-- В дедлайнах от ментора ученик меняет только статус; результат — только ментор
create or replace function public.enforce_deadline_update_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.result is not null then
      raise exception 'Результат отмечает ментор' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.student_id is distinct from old.student_id
     or new.created_by_admin is distinct from old.created_by_admin
     or new.group_key is distinct from old.group_key
     or new.opportunity_id is distinct from old.opportunity_id
     or new.result is distinct from old.result then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  if old.created_by_admin
     and (to_jsonb(new) - array['status', 'updated_at'])
         is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
    raise exception 'Этот дедлайн добавил ментор: можно менять только статус'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists student_deadlines_enforce_rights on public.student_deadlines;
create trigger student_deadlines_enforce_rights
before insert or update on public.student_deadlines
for each row execute function public.enforce_deadline_update_rights();
