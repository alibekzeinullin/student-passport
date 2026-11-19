-- Digital Passport TODAY Scholars — SAT этап 4Б: тесты на сайте
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Откат: rollback-sat-5.sql
--
-- Учитель загружает тест (Word по шаблону) или собирает вручную: модули (Verbal/Math, минуты, калькулятор),
-- вопросы (выбор ответа или ввод числа), у каждого вопроса — тема и баллы. Публикует для групп на период.
-- Ученик проходит на сайте: таймер считает сервер, каждый ответ сохраняется сразу.
-- Ключи ответов ученику недоступны: вопросы он получает только через функции, без ответов.

-- 1) Тесты, модули, вопросы -----------------------------------------------------------------
create table if not exists public.online_tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.test_sections (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.online_tests (id) on delete cascade,
  position integer not null,
  title text not null default '',
  section text not null default 'verbal' check (section in ('verbal', 'math')),
  minutes integer not null default 32 check (minutes between 1 and 240),
  calculator boolean not null default false,
  unique (test_id, position)
);

create table if not exists public.test_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.test_sections (id) on delete cascade,
  position integer not null,
  kind text not null default 'choice' check (kind in ('choice', 'input')),
  passage text not null default '',
  stem text not null default '',
  image text not null default '',          -- data:image/webp;base64,… (сжато в браузере)
  options jsonb not null default '[]'::jsonb,
  answer text not null default '',         -- «B» или «12; 12.0; 24/2»
  topic_id uuid references public.sat_topics (id) on delete set null,
  topic_label text not null default '',    -- если темы нет в списке
  points numeric(6, 2) not null default 1 check (points >= 0),
  unique (section_id, position)
);
create index if not exists test_questions_section_idx on public.test_questions (section_id, position);

drop trigger if exists online_tests_set_updated_at on public.online_tests;
create trigger online_tests_set_updated_at before update on public.online_tests
for each row execute function public.set_updated_at();

-- 2) Публикация для групп --------------------------------------------------------------------
create table if not exists public.test_assignments (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.online_tests (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  opens_at timestamptz not null default now(),
  closes_at timestamptz,
  review_open boolean not null default false,   -- ученики видят разбор: правильные ответы
  published_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (test_id, group_id),
  check (closes_at is null or closes_at > opens_at)
);

-- 3) Попытки и ответы --------------------------------------------------------------------------
create table if not exists public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.test_assignments (id) on delete cascade,
  test_id uuid not null references public.online_tests (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  current_position integer not null default 1,
  section_started_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score numeric(8, 2),
  max_score numeric(8, 2),
  tab_switches integer not null default 0,
  unique (test_id, student_id)
);
create index if not exists test_attempts_student_idx on public.test_attempts (student_id);

create table if not exists public.test_answers (
  attempt_id uuid not null references public.test_attempts (id) on delete cascade,
  question_id uuid not null references public.test_questions (id) on delete cascade,
  answer text not null default '',
  flagged boolean not null default false,
  is_correct boolean,
  points_awarded numeric(6, 2),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- 4) Права ----------------------------------------------------------------------------------------
create or replace function public.is_sat_team()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_admin() or public.is_head() or public.is_sat_staff(); $$;

create or replace function public.can_edit_test(p_test uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.can_manage_sat()
      or exists (select 1 from public.online_tests t where t.id = p_test and t.created_by = auth.uid() and public.is_sat_team());
$$;

alter table public.online_tests enable row level security;
alter table public.test_sections enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_assignments enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_answers enable row level security;

drop policy if exists "online_tests_select" on public.online_tests;
create policy "online_tests_select" on public.online_tests for select to authenticated using (public.is_sat_team());
drop policy if exists "online_tests_insert" on public.online_tests;
create policy "online_tests_insert" on public.online_tests for insert to authenticated with check (public.is_sat_team());
drop policy if exists "online_tests_update" on public.online_tests;
create policy "online_tests_update" on public.online_tests for update to authenticated using (public.can_edit_test(id)) with check (public.can_edit_test(id));
drop policy if exists "online_tests_delete" on public.online_tests;
create policy "online_tests_delete" on public.online_tests for delete to authenticated using (public.can_edit_test(id));

drop policy if exists "test_sections_select" on public.test_sections;
create policy "test_sections_select" on public.test_sections for select to authenticated using (public.is_sat_team());
drop policy if exists "test_sections_write" on public.test_sections;
create policy "test_sections_write" on public.test_sections for all to authenticated
using (public.can_edit_test(test_id)) with check (public.can_edit_test(test_id));

drop policy if exists "test_questions_select" on public.test_questions;
create policy "test_questions_select" on public.test_questions for select to authenticated using (public.is_sat_team());
drop policy if exists "test_questions_write" on public.test_questions;
create policy "test_questions_write" on public.test_questions for all to authenticated
using (public.can_edit_test((select s.test_id from public.test_sections s where s.id = section_id)))
with check (public.can_edit_test((select s.test_id from public.test_sections s where s.id = section_id)));

drop policy if exists "test_assignments_select" on public.test_assignments;
create policy "test_assignments_select" on public.test_assignments for select to authenticated using (public.is_sat_team());
drop policy if exists "test_assignments_write" on public.test_assignments;
create policy "test_assignments_write" on public.test_assignments for all to authenticated
using (public.can_edit_group(group_id)) with check (public.can_edit_group(group_id) and public.is_sat_team());

-- Попытки и ответы ученик меняет только через функции ниже; читает свои попытки (без ответов)
drop policy if exists "test_attempts_select" on public.test_attempts;
create policy "test_attempts_select" on public.test_attempts for select to authenticated
using (public.is_sat_team() or student_id = public.current_user_student_id());
drop policy if exists "test_attempts_delete" on public.test_attempts;
create policy "test_attempts_delete" on public.test_attempts for delete to authenticated
using (public.can_edit_group((select a.group_id from public.test_assignments a where a.id = assignment_id)));

drop policy if exists "test_answers_select" on public.test_answers;
create policy "test_answers_select" on public.test_answers for select to authenticated using (public.is_sat_team());

grant select, insert, update, delete on public.online_tests, public.test_sections, public.test_questions, public.test_assignments to authenticated;
grant select, delete on public.test_attempts to authenticated;
grant select on public.test_answers to authenticated;

-- 5) Проверка ответа ---------------------------------------------------------------------------------
-- Ввод числа: «3/4», «0.75», «,75» — одно и то же; несколько верных через «;».
create or replace function public.test_num(p text)
returns numeric language plpgsql immutable as $$
declare v text := replace(replace(lower(trim(p)), ' ', ''), ',', '.');
begin
  if v ~ '^-?\d+/\d+$' then
    if split_part(ltrim(v, '-'), '/', 2)::numeric = 0 then return null; end if;
    return (case when v like '-%' then -1 else 1 end) * split_part(ltrim(v, '-'), '/', 1)::numeric / split_part(ltrim(v, '-'), '/', 2)::numeric;
  elsif v ~ '^-?\d*\.?\d+$' then
    return v::numeric;
  end if;
  return null;
end;
$$;

create or replace function public.test_is_correct(p_kind text, p_key text, p_given text)
returns boolean language plpgsql immutable as $$
declare
  k text;
  g text := replace(replace(lower(trim(coalesce(p_given, ''))), ' ', ''), ',', '.');
begin
  if g = '' then return false; end if;
  if p_kind = 'choice' then
    return upper(g) = upper(trim(p_key));
  end if;
  foreach k in array string_to_array(coalesce(p_key, ''), ';') loop
    k := replace(replace(lower(trim(k)), ' ', ''), ',', '.');
    if k = '' then continue; end if;
    if k = g then return true; end if;
    if public.test_num(k) is not null and public.test_num(g) is not null and abs(public.test_num(k) - public.test_num(g)) < 0.0001 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Подсчитать попытку (и пересчитать, если учитель исправил ключ)
create or replace function public.score_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_test uuid;
begin
  select test_id into v_test from public.test_attempts where id = p_attempt;
  -- пустые строки для неотвеченных вопросов, чтобы отчёт видел и их
  insert into public.test_answers (attempt_id, question_id, answer)
  select p_attempt, q.id, '' from public.test_questions q
  join public.test_sections s on s.id = q.section_id
  where s.test_id = v_test
  on conflict do nothing;

  update public.test_answers a
  set is_correct = public.test_is_correct(q.kind, q.answer, a.answer),
      points_awarded = case when public.test_is_correct(q.kind, q.answer, a.answer) then q.points else 0 end
  from public.test_questions q
  where a.attempt_id = p_attempt and q.id = a.question_id;

  update public.test_attempts t set
    score = (select coalesce(sum(points_awarded), 0) from public.test_answers where attempt_id = p_attempt),
    max_score = (select coalesce(sum(q.points), 0) from public.test_questions q join public.test_sections s on s.id = q.section_id where s.test_id = v_test)
  where t.id = p_attempt;
end;
$$;

-- Сотрудник исправил ключ — пересчитать все завершённые попытки теста
create or replace function public.rescore_test(p_test uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.can_edit_test(p_test) then raise exception 'Нет прав на этот тест'; end if;
  for r in select id from public.test_attempts where test_id = p_test and finished_at is not null loop
    perform public.score_attempt(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 6) Ученик: список, старт, вопросы модуля, ответ, следующий модуль ---------------------------------
create or replace function public.my_tests()
returns table (
  assignment_id uuid, test_id uuid, title text, description text, opens_at timestamptz, closes_at timestamptz,
  sections integer, questions integer, total_minutes integer,
  attempt_id uuid, started_at timestamptz, finished_at timestamptz, score numeric, max_score numeric, review_open boolean
)
language sql stable security definer set search_path = public as $$
  select a.id, t.id, t.title, t.description, a.opens_at, a.closes_at,
    (select count(*) from public.test_sections s where s.test_id = t.id)::integer,
    (select count(*) from public.test_questions q join public.test_sections s on s.id = q.section_id where s.test_id = t.id)::integer,
    (select coalesce(sum(s.minutes), 0) from public.test_sections s where s.test_id = t.id)::integer,
    at.id, at.started_at, at.finished_at, at.score, at.max_score, a.review_open
  from public.test_assignments a
  join public.online_tests t on t.id = a.test_id
  join public.enrollments e on e.group_id = a.group_id and e.ends_on is null and e.student_id = public.current_user_student_id()
  left join public.test_attempts at on at.test_id = t.id and at.student_id = e.student_id
  where a.opens_at <= now() + interval '14 days'
  order by a.opens_at desc;
$$;

create or replace function public.start_test(p_assignment uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.current_user_student_id();
  a record;
  v_id uuid;
begin
  select * into a from public.test_assignments where id = p_assignment;
  if a is null or v_student is null then raise exception 'Тест не найден'; end if;
  if not exists (select 1 from public.enrollments e where e.group_id = a.group_id and e.student_id = v_student and e.ends_on is null) then
    raise exception 'Этот тест не для вашей группы';
  end if;
  select id into v_id from public.test_attempts where test_id = a.test_id and student_id = v_student;
  if v_id is not null then return v_id; end if;
  if now() < a.opens_at then raise exception 'Тест ещё не открыт'; end if;
  if a.closes_at is not null and now() > a.closes_at then raise exception 'Тест уже закрыт'; end if;
  if not exists (select 1 from public.test_sections where test_id = a.test_id) then raise exception 'В тесте нет модулей'; end if;
  insert into public.test_attempts (assignment_id, test_id, student_id, current_position, section_started_at)
  values (a.id, a.test_id, v_student, (select min(position) from public.test_sections where test_id = a.test_id), now())
  returning id into v_id;
  return v_id;
end;
$$;

-- Перейти к следующему модулю или завершить
create or replace function public.advance_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v_next integer;
begin
  select * into t from public.test_attempts where id = p_attempt for update;
  if t.finished_at is not null then return; end if;
  select min(position) into v_next from public.test_sections where test_id = t.test_id and position > t.current_position;
  if v_next is null then
    update public.test_attempts set finished_at = now() where id = p_attempt;
    perform public.score_attempt(p_attempt);
  else
    update public.test_attempts set current_position = v_next, section_started_at = now() where id = p_attempt;
  end if;
end;
$$;

-- Модули, у которых время вышло (с запасом 20 секунд на сеть), закрываются сами
create or replace function public.expire_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v_minutes integer; i integer := 0;
begin
  loop
    select * into t from public.test_attempts where id = p_attempt;
    exit when t.finished_at is not null or i > 20;
    select minutes into v_minutes from public.test_sections where test_id = t.test_id and position = t.current_position;
    exit when now() < t.section_started_at + make_interval(mins => v_minutes) + interval '20 seconds';
    perform public.advance_attempt(p_attempt);
    i := i + 1;
  end loop;
end;
$$;

create or replace function public.own_attempt(p_attempt uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.test_attempts where id = p_attempt and student_id = public.current_user_student_id());
$$;

-- Текущее состояние: модули, текущий модуль, сколько осталось секунд, вопросы БЕЗ ответов, свои ответы
create or replace function public.attempt_state(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; s record; v_left integer;
begin
  if not public.own_attempt(p_attempt) then raise exception 'Нет доступа'; end if;
  perform public.expire_attempt(p_attempt);
  select * into t from public.test_attempts where id = p_attempt;
  if t.finished_at is not null then
    return jsonb_build_object('finished', true, 'test_title', (select title from public.online_tests where id = t.test_id));
  end if;
  select * into s from public.test_sections where test_id = t.test_id and position = t.current_position;
  v_left := greatest(0, extract(epoch from (t.section_started_at + make_interval(mins => s.minutes) - now()))::integer);
  return jsonb_build_object(
    'finished', false,
    'test_title', (select title from public.online_tests where id = t.test_id),
    'sections', (select jsonb_agg(jsonb_build_object('position', x.position, 'title', x.title, 'section', x.section, 'minutes', x.minutes,
                   'count', (select count(*) from public.test_questions q where q.section_id = x.id)) order by x.position)
                 from public.test_sections x where x.test_id = t.test_id),
    'current', jsonb_build_object('position', s.position, 'title', s.title, 'section', s.section, 'minutes', s.minutes, 'calculator', s.calculator, 'seconds_left', v_left),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'position', q.position, 'kind', q.kind, 'passage', q.passage, 'stem', q.stem,
                   'image', q.image, 'options', q.options, 'points', q.points) order by q.position)
                 from public.test_questions q where q.section_id = s.id), '[]'::jsonb),
    'answers', coalesce((select jsonb_object_agg(a.question_id, jsonb_build_object('answer', a.answer, 'flagged', a.flagged))
                 from public.test_answers a join public.test_questions q on q.id = a.question_id
                 where a.attempt_id = p_attempt and q.section_id = s.id), '{}'::jsonb)
  );
end;
$$;

create or replace function public.save_test_answer(p_attempt uuid, p_question uuid, p_answer text, p_flagged boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare t record; v_minutes integer;
begin
  if not public.own_attempt(p_attempt) then raise exception 'Нет доступа'; end if;
  select * into t from public.test_attempts where id = p_attempt;
  if t.finished_at is not null then return false; end if;
  select minutes into v_minutes from public.test_sections where test_id = t.test_id and position = t.current_position;
  if now() > t.section_started_at + make_interval(mins => v_minutes) + interval '20 seconds' then
    perform public.expire_attempt(p_attempt);
    return false;
  end if;
  if not exists (
    select 1 from public.test_questions q join public.test_sections s on s.id = q.section_id
    where q.id = p_question and s.test_id = t.test_id and s.position = t.current_position
  ) then
    raise exception 'Вопрос не из текущего модуля';
  end if;
  insert into public.test_answers (attempt_id, question_id, answer, flagged, updated_at)
  values (p_attempt, p_question, left(coalesce(p_answer, ''), 50), coalesce(p_flagged, false), now())
  on conflict (attempt_id, question_id) do update set answer = excluded.answer, flagged = excluded.flagged, updated_at = now();
  return true;
end;
$$;

create or replace function public.next_test_section(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.own_attempt(p_attempt) then raise exception 'Нет доступа'; end if;
  perform public.advance_attempt(p_attempt);
end;
$$;

create or replace function public.note_tab_switch(p_attempt uuid)
returns void language sql security definer set search_path = public as $$
  update public.test_attempts set tab_switches = tab_switches + 1
  where id = p_attempt and finished_at is null and student_id = public.current_user_student_id();
$$;

-- Результат для ученика: баллы, по модулям, по темам; разбор — только если учитель открыл
create or replace function public.attempt_result(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; v_review boolean;
begin
  if not (public.own_attempt(p_attempt) or public.is_sat_team()) then raise exception 'Нет доступа'; end if;
  perform public.expire_attempt(p_attempt);
  select * into t from public.test_attempts where id = p_attempt;
  if t.finished_at is null then raise exception 'Тест ещё не завершён'; end if;
  select review_open into v_review from public.test_assignments where id = t.assignment_id;
  v_review := v_review or public.is_sat_team();
  return jsonb_build_object(
    'test_title', (select title from public.online_tests where id = t.test_id),
    'score', t.score, 'max_score', t.max_score, 'finished_at', t.finished_at, 'review_open', v_review,
    'sections', (select jsonb_agg(jsonb_build_object('title', s.title, 'section', s.section,
        'score', (select coalesce(sum(a.points_awarded), 0) from public.test_answers a join public.test_questions q on q.id = a.question_id where a.attempt_id = p_attempt and q.section_id = s.id),
        'max', (select coalesce(sum(q.points), 0) from public.test_questions q where q.section_id = s.id)) order by s.position)
      from public.test_sections s where s.test_id = t.test_id),
    'topics', (select coalesce(jsonb_agg(x order by x->>'pct'), '[]'::jsonb) from (
        select jsonb_build_object('topic', coalesce(tp.name, nullif(q.topic_label, ''), 'Без темы'), 'section', s.section,
          'correct', count(*) filter (where a.is_correct), 'total', count(*),
          'pct', lpad(round(100.0 * count(*) filter (where a.is_correct) / count(*))::text, 3, '0')) as x
        from public.test_answers a
        join public.test_questions q on q.id = a.question_id
        join public.test_sections s on s.id = q.section_id
        left join public.sat_topics tp on tp.id = q.topic_id
        where a.attempt_id = p_attempt
        group by coalesce(tp.name, nullif(q.topic_label, ''), 'Без темы'), s.section) y),
    'questions', (select jsonb_agg(jsonb_build_object('position', q.position, 'section_title', s.title, 'is_correct', a.is_correct,
          'answer', a.answer, 'topic', coalesce(tp.name, nullif(q.topic_label, ''), ''),
          'stem', case when v_review then q.stem else null end,
          'passage', case when v_review then q.passage else null end,
          'options', case when v_review then q.options else null end,
          'image', case when v_review then q.image else null end,
          'kind', q.kind,
          'correct_answer', case when v_review then q.answer else null end) order by s.position, q.position)
      from public.test_answers a
      join public.test_questions q on q.id = a.question_id
      join public.test_sections s on s.id = q.section_id
      left join public.sat_topics tp on tp.id = q.topic_id
      where a.attempt_id = p_attempt)
  );
end;
$$;

revoke execute on function public.score_attempt(uuid) from public, anon, authenticated;
revoke execute on function public.advance_attempt(uuid) from public, anon, authenticated;
revoke execute on function public.expire_attempt(uuid) from public, anon, authenticated;
revoke execute on function public.rescore_test(uuid) from public, anon;
revoke execute on function public.my_tests() from public, anon;
revoke execute on function public.start_test(uuid) from public, anon;
revoke execute on function public.attempt_state(uuid) from public, anon;
revoke execute on function public.save_test_answer(uuid, uuid, text, boolean) from public, anon;
revoke execute on function public.next_test_section(uuid) from public, anon;
revoke execute on function public.note_tab_switch(uuid) from public, anon;
revoke execute on function public.attempt_result(uuid) from public, anon;
grant execute on function public.rescore_test(uuid) to authenticated;
grant execute on function public.my_tests() to authenticated;
grant execute on function public.start_test(uuid) to authenticated;
grant execute on function public.attempt_state(uuid) to authenticated;
grant execute on function public.save_test_answer(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.next_test_section(uuid) to authenticated;
grant execute on function public.note_tab_switch(uuid) to authenticated;
grant execute on function public.attempt_result(uuid) to authenticated;
