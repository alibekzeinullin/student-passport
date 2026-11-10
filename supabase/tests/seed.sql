insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','alibek@x.kz','{"full_name":"Алибек Зейнуллин"}'),
 ('00000000-0000-0000-0000-000000000051','s1@x','{"full_name":"Айлин Дуйсенова","first_name":"Айлин","last_name":"Дуйсенова"}') on conflict do nothing;
