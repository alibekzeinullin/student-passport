-- Удаление ученика админом (профиль + auth user)
-- Защита: нельзя удалить аккаунт с ролью admin
-- Выполните в Supabase SQL Editor

create or replace function public.delete_student_as_admin(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can delete students';
  end if;

  select id, role into v_user_id, v_role
  from public.profiles
  where student_id = p_student_id
  limit 1;

  if v_role = 'admin' then
    raise exception 'Cannot delete a student profile linked to an admin account. First unlink: update profiles set student_id = null where id = %', v_user_id;
  end if;

  delete from public.students where id = p_student_id;

  if v_user_id is not null then
    delete from public.profiles where id = v_user_id;
    delete from auth.users where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.delete_student_as_admin(uuid) to authenticated;
