-- Откат migration-sat-6b.sql: снова разрешить ученику вносить свой официальный SAT.
drop policy if exists "sat_official_write" on public.sat_official_results;
create policy "sat_official_write" on public.sat_official_results for all to authenticated
using (student_id = public.current_user_student_id() or public.can_edit_sat_student(student_id))
with check (student_id = public.current_user_student_id() or public.can_edit_sat_student(student_id));
notify pgrst, 'reload schema';
