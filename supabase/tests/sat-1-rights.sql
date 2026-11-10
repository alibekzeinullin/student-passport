\set ON_ERROR_STOP 1
set client_min_messages = warning;
-- helpers (as postgres)
create or replace function public.t_ok(c boolean, m text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', m; end if; raise notice 'ok  %', m; end $$;
create or replace function public.t_fails(q text, m text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok  % (%)', m, sqlerrm; return; end;
  raise exception 'FAIL (no error): %', m;
end $$;
create or replace function public.t_count(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || q || ') x' into n; return n; end $$;
grant execute on function public.t_ok(boolean,text), public.t_fails(text,text), public.t_count(text) to authenticated, anon;

-- users
insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000b1','t1@x','{"full_name":"Учитель Один"}','{"account_type":"staff"}'),
 ('00000000-0000-0000-0000-0000000000b2','t2@x','{"full_name":"Учитель Два"}','{"account_type":"staff"}'),
 ('00000000-0000-0000-0000-0000000000b3','sen@x','{"full_name":"Старший Учитель"}','{"account_type":"staff"}'),
 ('00000000-0000-0000-0000-0000000000b4','cur@x','{"full_name":"Куратор"}','{"account_type":"staff"}'),
 ('00000000-0000-0000-0000-0000000000b5','men@x','{"full_name":"Ментор Второй"}','{"account_type":"staff"}'),
 ('00000000-0000-0000-0000-0000000000b6','dis@x','{"full_name":"Отключённый"}','{"account_type":"staff"}'),
 ('00000000-0000-0000-0000-000000000052','s2@x','{"full_name":"Ученик Ментор","first_name":"Ученик","last_name":"Ментор"}','{}'),
 ('00000000-0000-0000-0000-000000000053','hack@x','{"full_name":"Хакер"}','{}');
select t_ok((select count(*) from profiles where role='staff')=6, 'staff accounts get profile role staff');
select t_ok((select count(*) from students where email like '%@x' and email in ('t1@x','t2@x'))=0, 'staff get no student card');
select t_ok((select role from profiles where id='00000000-0000-0000-0000-000000000053')='student', 'self-signup still student');

insert into staff_members (user_id, full_name, active) select id, raw_user_meta_data->>'full_name', true from auth.users where raw_app_meta_data->>'account_type'='staff';
insert into staff_roles values
 ('00000000-0000-0000-0000-0000000000b1','sat_teacher'),('00000000-0000-0000-0000-0000000000b2','sat_teacher'),
 ('00000000-0000-0000-0000-0000000000b3','sat_senior_teacher'),('00000000-0000-0000-0000-0000000000b4','sat_curator'),
 ('00000000-0000-0000-0000-0000000000b5','mentor'),('00000000-0000-0000-0000-0000000000b6','sat_teacher');
update staff_members set active=false where user_id='00000000-0000-0000-0000-0000000000b6';
select t_ok((select role from profiles where id='00000000-0000-0000-0000-0000000000b5')='admin', 'mentor role → profile admin');
select t_ok((select role from profiles where id='00000000-0000-0000-0000-0000000000b1')='staff', 'teacher stays staff');

insert into streams (id, course_id, name) values ('10000000-0000-0000-0000-000000000001','sat','Поток 3');
insert into groups (id, course_id, stream_id, name) values
 ('20000000-0000-0000-0000-000000000001','sat','10000000-0000-0000-0000-000000000001','G1'),
 ('20000000-0000-0000-0000-000000000002','sat','10000000-0000-0000-0000-000000000001','G2'),
 ('20000000-0000-0000-0000-000000000003','mentoring',null,'M1');
insert into group_staff (group_id,user_id,role,starts_on) values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1','teacher','2026-01-01'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b2','teacher','2026-01-01'),
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b4','curator','2026-01-01'),
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b6','teacher','2026-01-01');
insert into enrollments (id, student_id, group_id, starts_on, target_score) values
 ('30000000-0000-0000-0000-000000000001',(select student_id from profiles where id='00000000-0000-0000-0000-000000000051'),'20000000-0000-0000-0000-000000000001','2026-09-01',1400);
select t_ok((select course_id from enrollments where id='30000000-0000-0000-0000-000000000001')='sat','course from group');
select t_ok(exists (select 1 from enrollments e join profiles p on p.student_id=e.student_id where p.id='00000000-0000-0000-0000-000000000051' and e.course_id='mentoring'), 'existing students backfilled into mentoring');

create or replace function public.t_as(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
grant execute on function public.t_as(text) to authenticated;

set role authenticated;

-- teacher 1
select t_as('00000000-0000-0000-0000-0000000000b1');
select t_ok(not is_admin(), 'T1 not admin');
select t_ok(t_count('select * from students')=0, 'T1 cannot read students table directly');
select t_ok(t_count('select * from sat_roster()')=1, 'T1 sees SAT roster');
select t_ok(t_count('select * from enrollments')=1, 'T1 sees SAT enrollments');
select t_ok(can_edit_group('20000000-0000-0000-0000-000000000001'), 'T1 edits own group');
select t_ok(not can_edit_group('20000000-0000-0000-0000-000000000002'), 'T1 cannot edit G2');
update enrollments set target_score=1450 where id='30000000-0000-0000-0000-000000000001';
select t_ok((select target_score from enrollments where id='30000000-0000-0000-0000-000000000001')=1450, 'T1 updates target in own group');
select t_fails($$insert into groups (course_id,name) values ('sat','X')$$, 'T1 cannot create group');
select t_fails($$select transfer_enrollment('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','2026-11-10')$$, 'T1 cannot transfer to G2');
select t_fails($$select replace_group_staff('20000000-0000-0000-0000-000000000001','teacher','00000000-0000-0000-0000-0000000000b2','2026-11-10')$$, 'T1 cannot replace teacher');
select t_fails($$insert into staff_roles values ('00000000-0000-0000-0000-0000000000b1','head')$$, 'T1 cannot grant self head');
update profiles set role='admin' where id='00000000-0000-0000-0000-0000000000b1';
reset role; select t_ok((select role from profiles where id='00000000-0000-0000-0000-0000000000b1')='staff', 'T1 profile update blocked'); set role authenticated;
select t_ok(t_count('select * from staff_audit')=0, 'T1 cannot read audit');
select t_ok(t_count($$select * from search_students_for_enrollment('Айл')$$)=1, 'T1 can search students to enroll');

-- teacher 2: sees SAT students too, but cannot edit G1
select t_as('00000000-0000-0000-0000-0000000000b2');
select t_ok(t_count('select * from sat_roster()')=1, 'T2 sees all SAT students');
update enrollments set target_score=1000 where id='30000000-0000-0000-0000-000000000001';
select t_ok((select target_score from enrollments where id='30000000-0000-0000-0000-000000000001')=1450, 'T2 update on G1 silently blocked');

-- disabled teacher
select t_as('00000000-0000-0000-0000-0000000000b6');
select t_ok(not is_sat_staff() and not can_edit_group('20000000-0000-0000-0000-000000000001'), 'disabled teacher loses rights');
select t_ok(t_count('select * from sat_roster()')=0, 'disabled teacher sees nobody');
select t_ok(t_count('select * from enrollments')=0, 'disabled teacher sees no enrollments');

-- senior
select t_as('00000000-0000-0000-0000-0000000000b3');
select t_ok(can_edit_group('20000000-0000-0000-0000-000000000002'), 'senior edits any SAT group');
select t_ok(not can_edit_group('20000000-0000-0000-0000-000000000003'), 'senior cannot edit mentoring group');
insert into groups (course_id,name) values ('sat','G3 senior');
select t_fails($$insert into groups (course_id,name) values ('mentoring','MX')$$, 'senior cannot create mentoring group');
select t_ok(transfer_enrollment('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','2026-11-10') is not null, 'senior transfers G1→G2');
select t_ok(t_count($$select * from enrollments where ends_on='2026-11-10' and end_reason='transfer'$$)=1, 'old enrollment closed with date');
select t_ok((select target_score from enrollments where ends_on is null)=1450, 'target carried over');
select t_ok(replace_group_staff('20000000-0000-0000-0000-000000000001','teacher','00000000-0000-0000-0000-0000000000b2','2026-11-15') is not null, 'senior replaces teacher from date');
select t_ok((select ends_on from group_staff where user_id='00000000-0000-0000-0000-0000000000b1' and role='teacher')='2026-11-14', 'previous teacher closed day before');
update profiles set role='admin' where id='00000000-0000-0000-0000-0000000000b3';
reset role; select t_ok((select role from profiles where id='00000000-0000-0000-0000-0000000000b3')='staff', 'senior profile update blocked'); set role authenticated;

-- teacher 1 after transfer: no longer editor of student's group, still sees (SAT history)
select t_as('00000000-0000-0000-0000-0000000000b1');
select t_ok(t_count('select * from enrollments where ends_on is null')=1, 'T1 still sees SAT student after transfer');

-- mentor-only (admin, not head)
select t_as('00000000-0000-0000-0000-0000000000b5');
select t_ok(is_admin() and not is_head(), 'mentor is admin but not head');
select t_ok(t_count('select * from students')>0, 'mentor reads students as before');
select t_fails($$update profiles set role='admin' where id='00000000-0000-0000-0000-0000000000b1'$$, 'mentor cannot promote staff');
select t_fails($$insert into groups (course_id,name) values ('sat','MG')$$, 'mentor cannot create SAT groups');
select t_ok(t_count('select * from staff_audit')=0, 'mentor cannot read audit');

-- student 1
select t_as('00000000-0000-0000-0000-000000000051');
select t_ok(t_count($$select * from student_courses(current_user_student_id())$$)=2, 'student sees own courses (mentoring + SAT)');
select t_ok((select teacher_name from student_courses(current_user_student_id()) where course_id='sat')='Учитель Два', 'student sees current teacher name');
select t_ok(t_count($$select * from student_courses((select student_id from profiles where id='00000000-0000-0000-0000-000000000052'))$$)=0, 'student cannot see other student courses');
select t_ok(t_count('select * from sat_roster()')=0, 'student cannot list roster');
select t_ok(t_count('select * from group_staff')=0, 'student cannot read group_staff');
select t_ok(t_count('select * from groups')=2, 'student sees only own groups (current + past)');
select t_ok(t_count('select * from staff_members')=0, 'student cannot read staff');
select t_ok(t_count($$select * from search_students_for_enrollment('Ученик')$$)=0, 'student cannot search students');
select t_fails($$insert into enrollments (student_id, group_id) values (current_user_student_id(),'20000000-0000-0000-0000-000000000001')$$, 'student cannot enroll self');
update profiles set role='admin' where id=auth.uid();
reset role; select t_ok((select role from profiles where id='00000000-0000-0000-0000-000000000051')='student', 'student cannot become admin'); set role authenticated;

-- head
select t_as('00000000-0000-0000-0000-00000000000a');
select t_ok(is_head() and is_admin(), 'head is head+admin');
select t_ok(t_count('select * from sat_roster()')=1, 'head sees roster');
insert into groups (course_id,name) values ('mentoring','M2');
reset role;

-- last head protection (as service role / sql editor)
select t_fails($$delete from staff_roles where user_id='00000000-0000-0000-0000-00000000000a' and role='head'$$, 'cannot remove last head role');
select t_fails($$update staff_members set active=false where user_id='00000000-0000-0000-0000-00000000000a'$$, 'cannot disable last head');
insert into staff_roles values ('00000000-0000-0000-0000-0000000000b3','head');
select t_ok((select role from profiles where id='00000000-0000-0000-0000-0000000000b3')='admin', 'new head → profile admin');
delete from staff_roles where user_id='00000000-0000-0000-0000-0000000000b3' and role='head';
select t_ok((select role from profiles where id='00000000-0000-0000-0000-0000000000b3')='staff', 'head removed → profile staff');
delete from staff_roles where user_id='00000000-0000-0000-0000-0000000000b1';
select t_ok(true, 'removing non-head roles works');

-- anon
set role anon;
select t_fails($$select * from sat_roster()$$, 'anon cannot call sat_roster');
reset role;
-- SAT-only student created after migration; rerunning migration must not enroll them in mentoring
insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000054','satonly@x','{"full_name":"Только Сат"}');
\ir ../migration-sat-1.sql
set client_min_messages = warning;
select t_ok(not exists (select 1 from enrollments e join profiles p on p.student_id=e.student_id where p.id='00000000-0000-0000-0000-000000000054'), 'rerun does not enroll new students in mentoring');
select 'ALL RLS TESTS PASSED' as result;
