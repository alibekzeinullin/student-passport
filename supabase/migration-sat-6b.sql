-- Digital Passport TODAY Scholars — SAT, этап 6b
-- Результаты официального SAT вносят только учителя SAT (ученик видит, но не пишет и не удаляет).
-- Файл можно запускать повторно. Откат — rollback-sat-6b.sql.
drop policy if exists "sat_official_write" on public.sat_official_results;
create policy "sat_official_write" on public.sat_official_results for all to authenticated
using (public.can_edit_sat_student(student_id))
with check (public.can_edit_sat_student(student_id));

notify pgrst, 'reload schema';
