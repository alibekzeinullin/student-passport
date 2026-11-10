# Резервные копии базы

Каждую ночь в 03:00 (Астана) GitHub Actions снимает копию базы Supabase, шифрует её и хранит 90 дней.
Если копия не получилась — GitHub пришлёт письмо на почту владельца репозитория.

## Настроить один раз (5 минут)

1. Supabase → проект → кнопка **Connect** (вверху) → вкладка **Session pooler** → скопируйте строку вида
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:5432/postgres`.
   Вместо `[YOUR-PASSWORD]` вставьте пароль базы (Project Settings → Database → Reset password, если забыли).
   Нужен именно Session pooler: обычный адрес `db.xxxx.supabase.co` из GitHub не открывается.
2. GitHub → репозиторий student-passport → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` — строка из шага 1
   - `BACKUP_PASSWORD` — придумайте длинный пароль. **Сохраните его в надёжном месте** — без него копию не открыть.
3. GitHub → **Actions → «Резервная копия базы» → Run workflow** — первая копия появится через 1–2 минуты.

## Где лежат копии

GitHub → **Actions** → «Резервная копия базы» → любой запуск → внизу **Artifacts** → `db-backup-ГГГГ-ММ-ДД`.
Хранятся 90 дней, потом удаляются сами. Одна копия весит обычно меньше 1–2 МБ.

## Как открыть копию

```bash
unzip db-backup-2026-11-10.zip
gpg -d backup-2026-11-10.tar.gz.gpg > backup.tar.gz   # спросит BACKUP_PASSWORD
tar -xzf backup.tar.gz
# public-*.sql      — все таблицы сайта со схемой и данными
# auth-*.sql        — аккаунты (логины, хэши паролей)
# row-counts-*.txt  — сколько строк было в каждой таблице
```

## Как восстановить

Восстанавливать лучше в **новый** проект Supabase, а не поверх рабочего:

```bash
psql "<строка Session pooler нового проекта>" -c "drop schema public cascade; create schema public;"
psql "<строка нового проекта>" -f public-2026-11-10.sql
psql "<строка нового проекта>" -f auth-2026-11-10.sql
```

Затем в Vercel поменять `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` на ключи нового проекта и сделать Redeploy.
Если нужно вернуть только одну таблицу — откройте `public-*.sql`, найдите `COPY public.<таблица>` и выполните этот блок.

Копия на сайте (**Ещё → База и копии → «Скачать всё»**) по-прежнему работает — это запасной вариант в CSV.
