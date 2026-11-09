-- Digital Passport TODAY Scholars — отзывы на книги и книжный рейтинг
-- Ученик отмечает книгу «Прочитано» и пишет короткий отзыв → ментор засчитывает или возвращает.
-- В рейтинг идут только засчитанные книги.
-- Файл можно запускать повторно.

create table if not exists public.book_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  -- id книги из списка ученика (students.books[].id)
  book_id text not null,
  title text not null default '',
  author text not null default '',
  review text not null default '',
  status text not null default 'submitted'
    check (status in ('submitted', 'accepted', 'revision')),
  mentor_comment text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, book_id)
);

create index if not exists book_reports_student_idx on public.book_reports (student_id);
create index if not exists book_reports_status_idx on public.book_reports (status);

drop trigger if exists book_reports_set_updated_at on public.book_reports;
create trigger book_reports_set_updated_at
before update on public.book_reports
for each row execute function public.set_updated_at();

alter table public.book_reports enable row level security;

drop policy if exists "book_reports_select" on public.book_reports;
create policy "book_reports_select" on public.book_reports for select to authenticated
using (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "book_reports_insert" on public.book_reports;
create policy "book_reports_insert" on public.book_reports for insert to authenticated
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "book_reports_update" on public.book_reports;
create policy "book_reports_update" on public.book_reports for update to authenticated
using (public.is_admin() or student_id = public.current_user_student_id())
with check (public.is_admin() or student_id = public.current_user_student_id());

drop policy if exists "book_reports_delete" on public.book_reports;
create policy "book_reports_delete" on public.book_reports for delete to authenticated
using (public.is_admin() or (student_id = public.current_user_student_id() and status <> 'accepted'));

grant select, insert, update, delete on public.book_reports to authenticated;

-- Ученик только отправляет отзыв; засчитывает и возвращает — только ментор
create or replace function public.enforce_book_report_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'UPDATE' and new.status in ('accepted', 'revision') and new.status is distinct from old.status then
      new.reviewed_at := now();
    elsif tg_op = 'INSERT' and new.status in ('accepted', 'revision') and new.reviewed_at is null then
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if length(btrim(coalesce(new.review, ''))) < 40 then
    raise exception 'Напиши отзыв подробнее: о чём книга и что ты из неё взял' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'submitted' or coalesce(new.mentor_comment, '') <> '' or new.reviewed_at is not null then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    new.submitted_at := now();
  else
    if old.status = 'accepted' then
      raise exception 'Книга уже засчитана' using errcode = '42501';
    end if;
    if new.status <> 'submitted'
       or new.student_id is distinct from old.student_id
       or new.book_id is distinct from old.book_id then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    -- комментарий и дату проверки ментора ученик не трогает
    new.mentor_comment := old.mentor_comment;
    new.reviewed_at := old.reviewed_at;
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists book_reports_rights on public.book_reports;
create trigger book_reports_rights
before insert or update on public.book_reports
for each row execute function public.enforce_book_report_rights();

-- Место ученика в книжном рейтинге (без чужих имён)
create or replace function public.my_book_rank()
returns table (accepted integer, place integer, total_students integer)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select s.id as student_id,
           count(b.id) filter (where b.status = 'accepted') as accepted
    from public.students s
    left join public.book_reports b on b.student_id = s.id
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

grant execute on function public.my_book_rank() to authenticated;

-- Для родителя по ссылке: какие книги засчитаны и отзывы
create or replace function public.get_book_reports_by_parent_token(p_token text)
returns setof public.book_reports
language sql
stable
security definer
set search_path = public
as $$
  select b.*
  from public.book_reports b
  join public.students s on s.id = b.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token;
$$;

grant execute on function public.get_book_reports_by_parent_token(text) to anon, authenticated;

-- Журнал действий (если подключена история)
do $$
begin
  if to_regprocedure('public.log_change()') is not null then
    drop trigger if exists book_reports_activity on public.book_reports;
    create trigger book_reports_activity
    after insert or update or delete on public.book_reports
    for each row execute function public.log_change();
  end if;
end;
$$;
