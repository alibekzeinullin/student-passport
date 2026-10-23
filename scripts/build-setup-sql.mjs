// Собирает supabase/setup-all.sql из всех миграций в правильном порядке.
// Запуск: node scripts/build-setup-sql.mjs
import { readFileSync, writeFileSync } from "node:fs";

const ORDER = [
  "schema.sql",
  "migration-monthly-vision.sql",
  "migration-delete-student.sql",
  "migration-security.sql",
  "migration-meetings.sql",
  "migration-platform.sql",
  "migration-pause.sql",
  "migration-attendance.sql",
  "migration-schedule.sql",
  "migration-avatars.sql",
  "migration-student-edit.sql",
  "migration-activity.sql",
  "migration-workflow.sql",
  "migration-achievements.sql",
  "migration-feed.sql",
  "migration-works.sql",
];

const header = `-- Digital Passport TODAY Scholars — ВСЯ база одним файлом
-- Supabase → SQL Editor → New query → вставьте весь файл → Run.
-- Безопасно запускать повторно: недостающее добавится, данные не удаляются.
-- Файл собирается автоматически (scripts/build-setup-sql.mjs) — не правьте вручную.
`;

const parts = ORDER.map((name) => {
  const sql = readFileSync(new URL(`../supabase/${name}`, import.meta.url), "utf8").trimEnd();
  return `\n-- ════════════════════════════════════════════════════════════\n-- ${name}\n-- ════════════════════════════════════════════════════════════\n\n${sql}\n`;
});

writeFileSync(new URL("../supabase/setup-all.sql", import.meta.url), header + parts.join(""));
console.log(`setup-all.sql: ${ORDER.length} файлов`);
