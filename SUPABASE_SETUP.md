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
2. Откройте файл `supabase/schema.sql` из этого репозитория
3. Вставьте весь SQL и нажмите **Run**
4. Должно пройти без ошибок (зелёная галочка)

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
