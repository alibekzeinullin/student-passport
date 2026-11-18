-- Digital Passport TODAY Scholars — родители видят проверенные эссе: текст, оценки и комментарий ментора
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run. Можно запускать повторно.
-- Черновики и работы на проверке по-прежнему без текста и комментария.
-- Откат: снова выполнить блок get_essays_by_parent_token из migration-workflow.sql и
--        drop policy if exists "essay_topics_read_anon" on public.essay_topics; revoke select on public.essay_topics from anon;

create or replace function public.get_essays_by_parent_token(p_token text)
returns setof public.essay_submissions
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.student_id, e.topic_id, e.version,
         case when e.status in ('accepted', 'revision') and e.reviewed_at is not null then e.body else ''::text end,
         e.word_count, e.status, e.submitted_at,
         e.score_structure, e.score_content, e.score_language, e.score_topic,
         case when e.status in ('accepted', 'revision') and e.reviewed_at is not null then e.mentor_comment else ''::text end,
         e.reviewed_at, e.created_at, e.updated_at
  from public.essay_submissions e
  join public.students s on s.id = e.student_id
  where p_token is not null and length(p_token) > 0 and s.parent_access_token = p_token;
$$;

grant execute on function public.get_essays_by_parent_token(text) to anon, authenticated;

-- Темы эссе — не личные данные, нужны родителю для названий
drop policy if exists "essay_topics_read_anon" on public.essay_topics;
create policy "essay_topics_read_anon" on public.essay_topics for select to anon using (true);
grant select on public.essay_topics to anon;
