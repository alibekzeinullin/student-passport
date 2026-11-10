-- Демо для показа SAT: поток «Демо поток», группа «Демо-SAT», 5 вымышленных учеников с данными за 4 недели.
-- Повторный запуск ничего не дублирует (если демо уже есть — выходит). Убрать: supabase/demo-remove.sql
-- Вход за демо-ученика: логин demo.asel, пароль Demo-Sat-2026
do $$
declare
  v_today date := (now() at time zone 'Asia/Almaty')::date;
  v_start date := (now() at time zone 'Asia/Almaty')::date - 28;
  v_head uuid;
  v_stream uuid;
  v_group uuid;
  v_uid uuid := gen_random_uuid();
  v_students uuid[] := '{}';
  v_sid uuid;
  v_mock1 uuid;
  v_mock2 uuid;
  v_pr uuid;
  v_lesson record;
  i integer;
  -- ученики: имя, фамилия, класс, цель, мок1 V/M, мок2 V/M, посещаемость (из 10), ДЗ (из 10)
  v_first text[] := array['Асель', 'Данияр', 'Томирис', 'Ернар', 'Мадина'];
  v_last text[] := array['Кайратова', 'Муратов', 'Абенова', 'Смагулов', 'Бекова'];
  v_class text[] := array['10A', '11B', '10A', '11A', '10B'];
  v_target int[] := array[1400, 1450, 1300, 1500, 1350];
  v_m1 int[][] := array[[520, 540], [560, 560], [490, 490], [600, 610], [540, 550]];
  v_m2 int[][] := array[[590, 600], [560, 570], [500, 510], [660, 670], [580, 600]];
  v_att int[] := array[10, 9, 7, 10, 9];
  v_hw int[] := array[9, 7, 4, 10, 8];
  -- практисы: тема, задач, верно у каждого из 5
  v_topics text[] := array['Linear equations in one variable', 'Central ideas and details', 'Nonlinear equations and systems', 'Percentages'];
  v_max int[] := array[15, 10, 15, 15];
  v_scores int[][] := array[[12, 11, 8, 14, 10], [7, 6, 5, 9, 8], [6, 7, 4, 13, 9], [10, 9, 5, 14, 9]];
  v_n integer := 0;
begin
  if exists (select 1 from public.streams where name = 'Демо поток') then
    raise notice 'Демо уже есть';
    return;
  end if;

  select r.user_id into v_head
  from public.staff_roles r join public.staff_members m using (user_id)
  where r.role = 'head' and m.active
  order by m.created_at limit 1;

  insert into public.streams (course_id, name, starts_on, weeks_total) values ('sat', 'Демо поток', v_start, 12) returning id into v_stream;
  insert into public.groups (course_id, stream_id, name, city, note) values ('sat', v_stream, 'Демо-SAT', 'Астана', 'Демо для показа — удалить supabase/demo-remove.sql') returning id into v_group;
  if v_head is not null then
    insert into public.group_staff (group_id, user_id, role, starts_on) values (v_group, v_head, 'teacher', v_start);
  end if;

  insert into public.schedule_slots (group_id, weekday, starts_at, duration_min, title, valid_from) values
    (v_group, 2, '17:00', 90, 'Math', v_start),
    (v_group, 4, '18:30', 90, 'Verbal', v_start),
    (v_group, 5, '17:00', 90, 'Практис', v_start);

  -- Ученик 1 с входом на сайт (триггер регистрации создаёт карточку и профиль)
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'demo.asel@students.todayscholars.local', crypt('Demo-Sat-2026', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Асель Кайратова', 'first_name', 'Асель', 'last_name', 'Кайратова', 'class_name', '10A', 'school', 'Демо-школа'),
    now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_uid, v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', 'demo.asel@students.todayscholars.local', 'email_verified', true),
    'email', now(), now(), now());
  select student_id into v_sid from public.profiles where id = v_uid;
  update public.students set email = 'demo.asel@demo.todayscholars.local', school = 'Демо-школа' where id = v_sid;
  v_students := array_append(v_students, v_sid);

  -- Ученики 2–5 без входа
  for i in 2..5 loop
    insert into public.students (first_name, last_name, class_name, school, email)
    values (v_first[i], v_last[i], v_class[i], 'Демо-школа', 'demo' || i || '@demo.todayscholars.local')
    returning id into v_sid;
    v_students := array_append(v_students, v_sid);
  end loop;

  for i in 1..5 loop
    insert into public.enrollments (student_id, course_id, group_id, starts_on, target_score, sat_date)
    values (v_students[i], 'sat', v_group, v_start, v_target[i], date '2027-03-13');
  end loop;

  -- Занятия из расписания: 4 недели назад и 2 вперёд
  insert into public.lessons (group_id, slot_id, slot_date, lesson_date, starts_at, duration_min, title)
  select s.group_id, s.id, d::date, d::date, s.starts_at, s.duration_min, s.title
  from public.schedule_slots s
  cross join generate_series(v_start, v_today + 14, interval '1 day') d
  where s.group_id = v_group and extract(isodow from d) = s.weekday
  on conflict (slot_id, slot_date) do nothing;

  -- Отметки за прошедшие занятия (сегодняшнее оставляем «не отмеченным»)
  for v_lesson in select id, lesson_date, title from public.lessons where group_id = v_group and lesson_date < v_today order by lesson_date loop
    v_n := v_n + 1;
    update public.lessons set topic = case title when 'Math' then 'Алгебра: уравнения' when 'Verbal' then 'Main idea, transitions' else 'Практис недели' end
    where id = v_lesson.id;
    for i in 1..5 loop
      insert into public.lesson_marks (lesson_id, student_id, attendance, homework, activity)
      values (
        v_lesson.id, v_students[i],
        case when (v_n * 3 + i * 7) % 10 < v_att[i] then (case when (v_n + i) % 6 = 0 then 'late' else 'present' end) else 'absent' end,
        case when (v_n * 7 + i * 3) % 10 < v_hw[i] then 'done' when (v_n + i) % 3 = 0 then 'partial' else 'none' end,
        case when i in (1, 4) then 'high' when i = 3 then 'low' else 'mid' end
      );
    end loop;
  end loop;

  -- Пробные экзамены
  insert into public.mocks (stream_id, title, mock_date) values (v_stream, 'Mock 1', v_today - 21) returning id into v_mock1;
  insert into public.mocks (stream_id, title, mock_date) values (v_stream, 'Mock 2', v_today - 7) returning id into v_mock2;
  for i in 1..5 loop
    insert into public.mock_results (mock_id, student_id, verbal, math) values (v_mock1, v_students[i], v_m1[i][1], v_m1[i][2]);
    insert into public.mock_results (mock_id, student_id, verbal, math) values (v_mock2, v_students[i], v_m2[i][1], v_m2[i][2]);
  end loop;

  -- Практисы по пятницам
  for i in 1..4 loop
    insert into public.practices (group_id, practice_date, topic_id, max_score)
    values (v_group, v_start + 3 + (i - 1) * 7, (select id from public.sat_topics where name = v_topics[i]), v_max[i])
    returning id into v_pr;
    for v_n in 1..5 loop
      insert into public.practice_results (practice_id, student_id, attempt, correct) values (v_pr, v_students[v_n], 1, v_scores[i][v_n]);
    end loop;
  end loop;
  -- Томирис перерешала слабую тему
  insert into public.practice_results (practice_id, student_id, attempt, correct)
  select p.id, v_students[3], 2, 7 from public.practices p
  join public.sat_topics t on t.id = p.topic_id
  where p.group_id = v_group and t.name = 'Nonlinear equations and systems';

  -- Комментарии
  insert into public.sat_comments (student_id, author_id, author_name, visibility, body, created_at) values
    (v_students[1], v_head, 'Учитель SAT', 'family', 'Хороший рост по Math: +60 баллов между первым и вторым пробным экзаменом. Следующий шаг — скорость в Verbal, на этой неделе тайминг-тренировка на коротких текстах.', now() - interval '6 days'),
    (v_students[3], v_head, 'Учитель SAT', 'team', 'ДЗ не сдаёт две недели, по звонку упоминала нагрузку в школе. Нужен разговор с родителем.', now() - interval '4 days'),
    (v_students[3], v_head, 'Учитель SAT', 'family', 'Давайте снизим объём ДЗ до 6 задач и добавим короткие разборы по пятницам.', now() - interval '4 days'),
    (v_students[2], v_head, 'Учитель SAT', 'team', 'Нет роста между моками — попробовать усложнённые задания на office hours.', now() - interval '2 days');

  raise notice 'Демо создано: группа Демо-SAT, 5 учеников, вход demo.asel / Demo-Sat-2026';
end $$;
