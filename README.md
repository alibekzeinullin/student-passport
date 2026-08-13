# Digital Passport TODAY Scholars

Веб-приложение на Next.js (App Router) + Tailwind CSS с RBAC для трёх ролей.

## Роли (RBAC)

| Роль | Маршрут | Права |
|------|---------|-------|
| **STUDENT** | `/dashboard` | Свой профиль; спринты; академ активность; внеучебка; книги; навыки |
| **ADMIN / MENTOR** | `/admin`, `/admin/students/[id]` | Реестр; редактирование; Mentor Summary; зоны роста; PDF; ссылка для родителей |
| **PARENT / GUEST** | `/parent/[studentToken]` | Read-only + PDF |

## Демо-вход

```bash
npm run dev
```

На главной (`/`):

- **STUDENT** — `student@today.edu` / `Student123!`
- **ADMIN / MENTOR** — `admin@today.edu` / `Admin123!`

## Структура

```
src/
  app/
    /                    — вход
    /dashboard           — STUDENT
    /admin               — реестр (ADMIN)
    /admin/students/[id] — профиль ученика (ADMIN)
    /parent/[studentToken] — гостевой просмотр (PARENT)
  components/
    StudentDashboard.tsx
    MentorSummaryBlock.tsx
    GrowthZonesBlock.tsx
    ParentAccessLinkButton.tsx
  context/               — Auth, Students
  lib/
    types.ts
    permissions.ts
    mock-data.ts
```
