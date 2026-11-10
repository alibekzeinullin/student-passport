set -e
E2E_DIR="${E2E_DIR:-$(cd "$(dirname "$0")" && pwd)}"; REPO="$(cd "$E2E_DIR/../.." && pwd)"; export E2E_DIR
cd "$E2E_DIR"; . ./env.sh
# база «до этапа 1» = setup-all.sql из коммита перед SAT
git -C "$REPO" show 78e21fb:supabase/setup-all.sql > old-setup.sql
pkill -f "auth serve" || true; pkill -f "postgrest pgrst.conf" || true; sleep 1
su postgres -c "dropdb --if-exists e2e; createdb e2e"
su postgres -c "psql -q -d e2e -f roles.sql" >/dev/null
su postgres -c "psql -q -d e2e -c 'create extension if not exists pgcrypto; create schema auth authorization supabase_auth_admin;'"
sed "s|__E2E_DIR__|$E2E_DIR|g" gotrue.env.template > gotrue.env
set -a; . ./gotrue.env; set +a; ./auth migrate > migrate.log 2>&1
su postgres -c "psql -q -d e2e -f grants.sql -f storage.sql"
su postgres -c "psql -q -d e2e -f $E2E_DIR/old-setup.sql" > /dev/null 2>&1
nohup ./auth serve > gotrue.log 2>&1 &
nohup ./postgrest pgrst.conf > pgrst.log 2>&1 &
sleep 2
mk() { curl -s --cacert cert.pem -X POST https://e2e.supabase.co/auth/v1/admin/users -H "apikey: $SERVICE" -H "authorization: Bearer $SERVICE" -H "content-type: application/json" -d "$1" > /dev/null; }
mk '{"email":"alibek@students.todayscholars.local","password":"Admin-1234","email_confirm":true,"user_metadata":{"full_name":"Алибек Зейнуллин"}}'
mk '{"email":"aylin@students.todayscholars.local","password":"Stud-1234","email_confirm":true,"user_metadata":{"full_name":"Айлин Дуйсенова","first_name":"Айлин","last_name":"Дуйсенова","class_name":"9A"}}'
mk '{"email":"timur@students.todayscholars.local","password":"Stud-1234","email_confirm":true,"user_metadata":{"full_name":"Тимур Ахметов","first_name":"Тимур","last_name":"Ахметов","class_name":"10B"}}'
su postgres -c "psql -q -d e2e -c \"update profiles p set role='admin', student_id=null from auth.users u where u.id=p.id and u.email like 'alibek@%'\""
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d e2e -f $REPO/supabase/setup-all.sql" 2>&1 | grep -i error || true
su postgres -c "psql -q -d e2e -c \"notify pgrst, 'reload schema'\""
sleep 1; echo reset done
