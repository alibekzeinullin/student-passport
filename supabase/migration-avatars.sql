-- Digital Passport TODAY Scholars — фото учеников и логотипы конкурсов
-- Выполните в Supabase: SQL Editor → New query → вставьте весь файл → Run
-- Файл можно запускать повторно.
--
-- 1) Хранилище avatars (публичное чтение; загружать — ментор или сам ученик
--    в свою папку <student_id>/…)
-- 2) Ученик может менять своё фото (avatar_url)
-- 3) opportunities.logo_url — свой логотип конкурса (по желанию)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_user_student_id()::text)
);

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_user_student_id()::text)
);

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (public.is_admin() or (storage.foldername(name))[1] = public.current_user_student_id()::text)
);

-- Ученик может менять: свои разделы + фото
create or replace function public.enforce_student_update_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Колонки, которые ученик может менять в своей карточке целиком
  v_allowed text[] := array[
    'academic_activities', 'projects', 'books', 'skills', 'sprint_tasks',
    'avatar_url', 'test_scores', 'updated_at'
  ];
  v_old_sprints jsonb;
  v_new_sprints jsonb;
begin
  -- Админ — без ограничений.
  -- auth.uid() пустой — это SQL Editor / service role, тоже без ограничений.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - v_allowed - 'vision_map') is distinct from (to_jsonb(old) - v_allowed - 'vision_map') then
    raise exception 'Недостаточно прав: это поле может менять только ментор'
      using errcode = '42501';
  end if;

  -- Vision Map: ученик меняет только свои цели года (Future Review)
  if (coalesce(new.vision_map, '{}'::jsonb) - 'futureAcademicGoals' - 'futureOtherGoals')
     is distinct from (coalesce(old.vision_map, '{}'::jsonb) - 'futureAcademicGoals' - 'futureOtherGoals') then
    raise exception 'В Vision Map ученик может менять только свои цели года'
      using errcode = '42501';
  end if;

  -- Спринты: ученик не может добавлять/удалять спринты и менять их название.
  select coalesce(jsonb_agg(jsonb_build_array(e->'id', e->'sprintLabel', e->'title') order by ord), '[]'::jsonb)
    into v_old_sprints
    from jsonb_array_elements(coalesce(old.sprint_tasks, '[]'::jsonb)) with ordinality as t(e, ord);

  select coalesce(jsonb_agg(jsonb_build_array(e->'id', e->'sprintLabel', e->'title') order by ord), '[]'::jsonb)
    into v_new_sprints
    from jsonb_array_elements(coalesce(new.sprint_tasks, '[]'::jsonb)) with ordinality as t(e, ord);

  if v_old_sprints is distinct from v_new_sprints then
    raise exception 'Недостаточно прав: список и названия спринтов меняет только ментор'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

alter table public.opportunities add column if not exists logo_url text;
