\set ON_ERROR_STOP 1
set client_min_messages = warning;
-- SAT этап 3: моки, практисы, комментарии. После sat-2-rights.sql (группы H1/H2, учителя П/Ку, куратор Эр, ученики Икс/Игрек).
reset role;
create temp table ids3 as select
  (select student_id from profiles where id='00000000-0000-0000-0000-000000000061') as sx,
  (select student_id from profiles where id='00000000-0000-0000-0000-000000000062') as sy,
  (select id from sat_topics where name='Percentages') as topic;
grant select on ids3 to authenticated;
select t_ok((select count(*) from sat_topics) >= 30, 'standard SAT topics seeded');
set role authenticated;

-- Учитель П (H1, где ученик Икс) не создаёт мок, старший учитель — создаёт
select t_as('00000000-0000-0000-0000-0000000000c1');
select t_fails($$insert into mocks (stream_id, title, mock_date) values ('11000000-0000-0000-0000-000000000001','Mock X', local_today())$$, 'teacher cannot create a mock');
select t_as('00000000-0000-0000-0000-0000000000b3');
insert into mocks (id, stream_id, title, mock_date) values ('41000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','Mock 1', local_today() - 21);
insert into mocks (id, stream_id, title, mock_date) values ('41000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','Mock 2', local_today());
select t_ok(true, 'senior teacher creates mocks');

-- Учитель вносит результаты своему ученику, но не чужому
select t_as('00000000-0000-0000-0000-0000000000c1');
insert into mock_results (mock_id, student_id, verbal, math) select '41000000-0000-0000-0000-000000000001', sx, 520, 540 from ids3;
insert into mock_results (mock_id, student_id, verbal, math) select '41000000-0000-0000-0000-000000000002', sx, 590, 600 from ids3;
select t_ok((select total from mock_results where mock_id='41000000-0000-0000-0000-000000000002') = 1190, 'total computed (590+600)');
select t_fails($$insert into mock_results (mock_id, student_id, verbal, math) select '41000000-0000-0000-0000-000000000001', sy, 500, 500 from ids3$$, 'teacher cannot enter mock result for student of another group');
select t_fails($$insert into mock_results (mock_id, student_id, verbal, math) select '41000000-0000-0000-0000-000000000001', sy, 900, 500 from ids3$$, 'section score above 800 rejected');

-- Практис своей группы
insert into practices (id, group_id, practice_date, topic_id, max_score) select '42000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001', local_today(), topic, 15 from ids3;
insert into practice_results (practice_id, student_id, correct) select '42000000-0000-0000-0000-000000000001', sx, 6 from ids3;
insert into practice_results (practice_id, student_id, attempt, correct) select '42000000-0000-0000-0000-000000000001', sx, 2, 11 from ids3;
select t_ok(t_count('select * from practice_results') = 2, 'teacher enters practice result and a retake');
select t_fails($$insert into practice_results (practice_id, student_id, attempt, correct) select '42000000-0000-0000-0000-000000000001', sx, 3, 16 from ids3$$, 'more correct than tasks rejected');
select t_fails($$insert into practice_results (practice_id, student_id, attempt, correct) select '42000000-0000-0000-0000-000000000001', sx, 4, 5 from ids3$$, 'no more than 3 attempts');
select t_fails($$insert into practices (group_id, practice_date, max_score) values ('21000000-0000-0000-0000-000000000002', local_today(), 10)$$, 'teacher cannot create practice in another group');

-- Комментарии
insert into sat_comments (student_id, visibility, body) select sx, 'team', 'Нужен разговор с родителем' from ids3;
insert into sat_comments (student_id, visibility, body) select sx, 'family', 'Давайте снизим объём ДЗ до 6 задач' from ids3;
select t_ok((select author_name from sat_comments limit 1) = 'Учитель П', 'comment author stamped');

-- Учитель Ку видит всё (все SAT-ученики), но не вносит в чужую группу
select t_as('00000000-0000-0000-0000-0000000000c2');
select t_ok(t_count('select * from mock_results') = 2 and t_count('select * from sat_comments') = 2, 'other SAT teacher can read results and comments');
update mock_results set verbal = 700 where student_id = (select sx from ids3);
reset role; select t_ok((select max(verbal) from mock_results) = 590, 'other teacher cannot change results'); set role authenticated;
delete from sat_comments;
reset role; select t_ok((select count(*) from sat_comments) = 2, 'cannot delete others'' comments'); set role authenticated;

-- Ученик Икс: свои результаты и только «семейный» комментарий
select t_as('00000000-0000-0000-0000-000000000061');
select t_ok(t_count('select * from mocks') = 2, 'student sees mocks with own results');
select t_ok(t_count('select * from mock_results') = 2, 'student sees own mock results');
select t_ok(t_count('select * from practices') = 1 and t_count('select * from practice_results') = 2, 'student sees own practices');
select t_ok(t_count('select * from sat_comments') = 1, 'student sees only family comment');
select t_ok((select body from sat_comments) like 'Давайте%', 'the visible comment is the family one');
select t_fails($$insert into mock_results (mock_id, student_id, verbal, math) select '41000000-0000-0000-0000-000000000001', sx, 800, 800 from ids3 on conflict (mock_id, student_id) do update set verbal = 800$$, 'student cannot edit own results');
select t_fails($$insert into sat_comments (student_id, body) select sx, 'хак' from ids3$$, 'student cannot write comments');

-- Ученик Игрек ничего этого не видит
select t_as('00000000-0000-0000-0000-000000000062');
select t_ok(t_count('select * from mock_results') = 0 and t_count('select * from practice_results') = 0 and t_count('select * from sat_comments') = 0 and t_count('select * from mocks') = 0, 'other student sees nothing');
reset role;
select 'ALL STAGE 3 TESTS PASSED' as result;
