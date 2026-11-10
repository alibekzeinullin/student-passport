# E2E-проверка SAT (локально, без настоящего Supabase)

Поднимает на одной машине Postgres + GoTrue (вход Supabase) + PostgREST (API Supabase) за HTTPS-прокси
с адресом `e2e.supabase.co`, собирает сайт и проходит сценарии в Chrome через Playwright.
Секреты здесь тестовые и нигде больше не используются.

Нужно: Linux, Postgres 15+ (`su postgres` без пароля), Node 22, Python 3 + `pip install playwright`, Google Chrome.

```bash
cd tests/e2e
# 1. Бинарники (один раз)
curl -sSL https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz | tar -xJ
curl -sSL https://github.com/supabase/auth/releases/download/v2.164.0/auth-v2.164.0-x86.tar.gz | tar -xz
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 \
  -subj "/CN=e2e.supabase.co" -addext "subjectAltName=DNS:e2e.supabase.co"
echo "127.0.0.1 e2e.supabase.co" | sudo tee -a /etc/hosts
node keys.mjs > keys.env
su postgres -c "psql -c \"alter user postgres password 'pg'\""
# 2. Прокси на 443 (нужен root)
export E2E_DIR=$PWD; nohup node proxy.mjs > proxy.log 2>&1 &
# 3. Чистая база «как до этапа 1» + 3 пользователя + миграция
bash reset.sh
# 4. Сайт против локального стека
. ./env.sh
cat > next.env <<ENV
NEXT_PUBLIC_SUPABASE_URL=https://e2e.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
NODE_EXTRA_CA_CERTS=$E2E_DIR/cert.pem
ENV
(cd ../.. && set -a && . tests/e2e/next.env && set +a && npx next build && npx next start -p 3000 &)
# 5. Сценарии (перед каждым повтором — bash reset.sh); этап 2 идёт после этапа 1 на той же базе
mkdir -p shots && python3 e2e_sat1.py && python3 e2e_sat2.py
```

Что проверяется (35 шагов): руководитель создаёт поток и группы, сотрудника и сотрудников списком
(ошибочные строки пропускаются), у сотрудников нет карточек учеников, нельзя снять руководителя с себя,
зачисление с целью и датой SAT, ученик «только SAT» скрыт из менторского реестра, учитель правит
только свои группы и не открывает «Команду» и менторскую часть (ни на сайте, ни через API), вкладки
«Менторство | SAT» у ученика, перевод с переносом цели, замена учителя с даты, отключённый сотрудник
не может войти, старший учитель создаёт группы.

Этап 2 (`e2e_sat2.py`, 15 шагов): длительность потока, расписание по примеру и своё, отметки занятия
(«всем — был», ДЗ частично, активность, тема), внеплановое занятие и «Не отмечено», учитель видит только свои занятия,
будущее занятие не отмечается, замена учителя и перенос, у ученика — «неделя 5 из 12», посещаемость, ДЗ и ближайшие занятия,
посещаемость и ДЗ в таблице группы.
