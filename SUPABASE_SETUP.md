# Настройка Supabase для Digital Passport TODAY Scholars

## Шаг 1. Создайте проект

1. Откройте [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project**
3. Имя: `today-scholars` (любое)
4. Задайте пароль БД (сохраните его)
5. Регион: ближайший (например Singapore / Frankfurt)
6. **Create new project** — подождите 1–2 минуты

## Шаг 2. Скопируйте ключи API

1. В проекте: **Project Settings** (шестерёнка) → **API**
2. Скопируйте:
   - **Project URL**
   - **anon public** key

## Шаг 3. Создайте `.env.local` в корне проекта

```bash
cp .env.local.example .env.local
```

Вставьте значения:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

## Шаг 4. Примените схему БД

1. В Supabase: **SQL Editor** → **New query**
2. Откройте файл **`supabase/setup-all.sql`** из этого репозитория — в нём вся база одним файлом
3. Вставьте весь SQL и нажмите **Run**
4. Должно пройти без ошибок (зелёная галочка)

Файл безопасно запускать повторно — и на новом проекте, и на уже работающем: он только добавляет недостающее, данные не трогает. После каждого обновления сайта, где появились новые таблицы, просто запустите его ещё раз.

Проверить, всё ли применено: на сайте под админом → **Ещё → База и копии**.

<details>
<summary>Отдельные файлы (для справки)</summary>

`setup-all.sql` собирается командой `node scripts/build-setup-sql.mjs` из файлов в таком порядке:
schema.sql → migration-monthly-vision.sql → migration-delete-student.sql → migration-security.sql → migration-meetings.sql → migration-platform.sql → migration-pause.sql → migration-attendance.sql → migration-schedule.sql → migration-avatars.sql → migration-student-edit.sql → migration-activity.sql → migration-workflow.sql (эссе и шаблоны встреч).

</details>

## Резервные копии

- На сайте: **Ещё → База и копии → «Скачать всё (.zip)»** — CSV по каждой таблице + полный backup.json. Делайте раз в месяц.
- В Supabase: **Database → Backups** (на бесплатном тарифе может быть недоступно для скачивания).

## Шаг 5. Auth настройки (рекомендуется для локальной разработки)

1. **Authentication** → **Providers** → Email — включён
2. **Authentication** → **URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/**`
3. Для быстрого теста можно отключить подтверждение email:
   - **Authentication** → **Providers** → Email → **Confirm email** = OFF

## Шаг 6. Создайте админа

1. Зарегистрируйте пользователя через приложение (или Auth → Users → Add user)
2. В SQL Editor выполните:

```sql
update public.profiles
set role = 'admin', student_id = null
where id = (
  select id from auth.users where email = 'ВАШ_EMAIL_АДМИНА'
);
```

## Шаг 7. Перезапустите приложение

```bash
npm run dev
```

---

Когда шаги 1–4 готовы — напишите «готово», и я подключу регистрацию/логин и сохранение профилей к Supabase (вместо localStorage).

## Аккаунты учеников (необязательно)

Чтобы ментор мог создавать аккаунты и сбрасывать пароли на странице «Аккаунты»:

1. Supabase → Project Settings → API → скопируйте ключ `service_role` (secret).
2. Vercel → Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` = этот ключ.
3. Redeploy. Ключ используется только на сервере (`src/lib/supabase/admin.ts`) и не попадает в браузер.
