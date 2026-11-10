\set ON_ERROR_STOP 1
set client_min_messages = warning;
-- SAT этап 2: расписание, занятия, отметки. Запускается после sat-1-rights.sql (использует его хелперы).
reset role;
insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000c1','p@x','{"full_name":"Учитель П"}','{"account_type":"staff"}'),
 ('00000000-0000-0000-0000-0000000000c2','q@x','{"full_name":"Учитель Ку"}','{"account_type":"staff"}'),
 ('00000000-0000-0000-0000-0000000000c3','r@x','{"full_name":"Куратор Эр"}','{"account_type":"staff"}'),
 ('00000000-0000-0000-0000-000000000061','x@x','{"full_name":"Ученик Икс","first_name":"Икс","last_name":"Ученик"}','{}'),
 ('00000000-0000-0000-0000-000000000062','y@x','{"full_name":"Ученик Игрек","first_name":"Игрек","last_name":"Ученик"}','{}');
insert into staff_members (user_id, full_name) values
 ('00000000-0000-0000-0000-0000000000c1','Учитель П'),('00000000-0000-0000-0000-0000000000c2','Учитель Ку'),('00000000-0000-0000-0000-0000000000c3','Куратор Эр');
insert into staff_roles values ('00000000-0000-0000-0000-0000000000c1','sat_teacher'),('00000000-0000-0000-0000-0000000000c2','sat_teacher'),('00000000-0000-0000-0000-0000000000c3','sat_curator');
insert into streams (id, course_id, name, starts_on, weeks_total) values ('11000000-0000-0000-0000-000000000001','sat','Поток 9', local_today() - 30, 12);
insert into groups (id, course_id, stream_id, name) values
 ('21000000-0000-0000-0000-000000000001','sat','11000000-0000-0000-0000-000000000001','H1'),
 ('21000000-0000-0000-0000-000000000002','sat','11000000-0000-0000-0000-000000000001','H2');
insert into group_staff (group_id,user_id,role,starts_on) values
 ('21000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','teacher', local_today() - 60),
 ('21000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c2','teacher', local_today() - 60),
 ('21000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c3','curator', local_today() - 60);
insert into enrollments (student_id, group_id, starts_on)
 select student_id, '21000000-0000-0000-0000-000000000001', local_today() - 30 from profiles where id='00000000-0000-0000-0000-000000000061';
insert into enrollments (student_id, group_id, starts_on)
 select student_id, '21000000-0000-0000-0000-000000000002', local_today() - 30 from profiles where id='00000000-0000-0000-0000-000000000062';

set role authenticated;

-- Учитель П: расписание своей группы
select t_as('00000000-0000-0000-0000-0000000000c1');
insert into schedule_slots (group_id, weekday, starts_at, duration_min, title, valid_from)
  values ('21000000-0000-0000-0000-000000000001', extract(isodow from local_today()), '17:00', 90, 'Math', local_today() - 14);
select t_ok(true, 'teacher adds a slot to own group');
select t_fails($$insert into schedule_slots (group_id, weekday, starts_at, title) values ('21000000-0000-0000-0000-000000000002', 1, '10:00', 'X')$$, 'teacher cannot add slot to other group');
select t_ok(ensure_lessons(local_today() - 14, local_today() + 14) = 5, 'lessons generated from schedule (2 past, today, 2 future)');
select t_ok(ensure_lessons(local_today() - 14, local_today() + 14) = 0, 'generation is idempotent');
select t_ok(ensure_lessons(local_today() + 60, local_today() + 90) = 0, 'no generation beyond 4 weeks ahead');

reset role;
create temp table ids as select
  (select id from lessons where group_id='21000000-0000-0000-0000-000000000001' and lesson_date = local_today()) as today_l,
  (select id from lessons where group_id='21000000-0000-0000-0000-000000000001' and lesson_date = local_today() + 7) as future_l,
  (select id from lessons where group_id='21000000-0000-0000-0000-000000000001' and lesson_date = local_today() - 7) as week_ago_l,
  (select student_id from profiles where id='00000000-0000-0000-0000-000000000061') as sx,
  (select student_id from profiles where id='00000000-0000-0000-0000-000000000062') as sy;
grant select on ids to authenticated;
set role authenticated;

select t_ok(t_count('select * from lesson_roster((select today_l from ids))') = 1, 'roster of the lesson = students of the group');
insert into lesson_marks (lesson_id, student_id, attendance, homework, activity)
  select today_l, sx, 'late', 'partial', 'high' from ids;
select t_ok((select marked_by from lesson_marks limit 1) = '00000000-0000-0000-0000-0000000000c1', 'teacher marks today''s lesson, marked_by set');
select t_fails($$insert into lesson_marks (lesson_id, student_id, attendance) select future_l, sx, 'present' from ids$$, 'future lesson cannot be marked');
select t_fails($$insert into lesson_marks (lesson_id, student_id, attendance) select week_ago_l, sx, 'present' from ids$$, 'teacher cannot mark after 3 days');
insert into lessons (group_id, lesson_date, starts_at, title) values ('21000000-0000-0000-0000-000000000001', local_today() - 2, '19:00', 'Office hours');
insert into lesson_marks (lesson_id, student_id, attendance, homework)
  select (select id from lessons where title='Office hours'), sx, 'absent', 'none' from ids;
select t_ok(true, 'teacher adds extra lesson and marks it within 3 days');
select t_fails($$update lessons set group_id='21000000-0000-0000-0000-000000000002' where title='Office hours'$$, 'lesson cannot be moved to another group');
-- замена на будущее занятие
update lessons set teacher_id='00000000-0000-0000-0000-0000000000c2', moved_from='' where id=(select future_l from ids);
select t_ok((select teacher_id from lessons where id=(select future_l from ids))='00000000-0000-0000-0000-0000000000c2', 'teacher assigns a substitute for one lesson');
delete from lessons where id=(select today_l from ids);
select t_ok(exists(select 1 from lessons where id=(select today_l from ids)), 'planned lesson cannot be deleted (only cancelled)');
update lessons set status='cancelled' where id=(select week_ago_l from ids);
select t_ok((select status from lessons where id=(select week_ago_l from ids))='cancelled', 'lesson can be cancelled');

-- Учитель Ку: чужая группа, но замена на одно занятие
select t_as('00000000-0000-0000-0000-0000000000c2');
select t_ok(can_mark_lesson((select future_l from ids)), 'substitute can mark that one lesson');
select t_ok(not can_mark_lesson((select today_l from ids)), 'other teacher cannot mark the group''s lessons');
select t_fails($$insert into lesson_marks (lesson_id, student_id, attendance) select today_l, sx, 'present' from ids$$, 'other teacher cannot insert marks');
update lesson_marks set attendance='absent' where lesson_id=(select today_l from ids);
reset role; select t_ok((select attendance from lesson_marks where lesson_id=(select today_l from ids))='late', 'other teacher update silently blocked'); set role authenticated;

-- Куратор группы
select t_as('00000000-0000-0000-0000-0000000000c3');
update lesson_marks set attendance='present' where lesson_id=(select today_l from ids);
reset role; select t_ok((select attendance from lesson_marks where lesson_id=(select today_l from ids))='present', 'curator of the group can fix marks'); set role authenticated;

-- Старший учитель исправляет старое
select t_as('00000000-0000-0000-0000-0000000000b3');
update lessons set status='planned' where id=(select week_ago_l from ids);
insert into lesson_marks (lesson_id, student_id, attendance, homework) select week_ago_l, sx, 'present', 'done' from ids;
select t_ok(true, 'senior teacher can mark after 3 days');

-- Ученики
select t_as('00000000-0000-0000-0000-000000000061');
select t_ok(t_count('select * from lessons') = 6, 'student sees lessons of own group');
select t_ok(t_count('select * from lesson_marks') = 3, 'student sees own marks');
select t_ok(t_count('select * from lesson_roster((select today_l from ids))') = 0, 'student cannot read roster');
select t_fails($$insert into lesson_marks (lesson_id, student_id, attendance) select today_l, sx, 'present' from ids$$, 'student cannot mark');
-- присутствие: present, absent, present → 67%; ДЗ: partial, none, done → 50%
select t_ok((select attendance_pct from sat_student_info((select sx from ids))) = 67, 'attendance % for student');
select t_ok((select homework_pct from sat_student_info((select sx from ids))) = 50, 'homework % for student (partial = half)');
select t_ok((select weeks_total from sat_student_info((select sx from ids))) = 12, 'student sees course length');
select t_ok(t_count('select * from sat_student_info((select sy from ids))') = 0, 'student cannot read another student info');
select t_as('00000000-0000-0000-0000-000000000062');
select t_ok(t_count('select * from lessons') = 0, 'student of other group sees none of these lessons');
select t_ok(t_count('select * from lesson_marks') = 0, 'student sees no foreign marks');

-- Изменение расписания пересоздаёт будущие неотмеченные занятия
select t_as('00000000-0000-0000-0000-0000000000c1');
update schedule_slots set starts_at='18:00' where group_id='21000000-0000-0000-0000-000000000001';
select ensure_lessons(local_today() - 14, local_today() + 14);
select t_ok((select starts_at from lessons where group_id='21000000-0000-0000-0000-000000000001' and lesson_date=local_today()+14)='18:00', 'future unmarked lesson regenerated with new time');
select t_ok((select starts_at from lessons where id=(select today_l from ids))='17:00', 'marked lesson keeps its time');
select t_ok((select teacher_id from lessons where id=(select future_l from ids)) is not null, 'lesson with substitute is kept');
select t_ok(t_count('select * from sat_roster_stats()') >= 1, 'teacher sees group stats');
reset role;
select 'ALL STAGE 2 TESTS PASSED' as result;
