import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { strToU8, zipSync } from "fflate";

/** Что проверяем: таблица и (необязательно) колонка, и из какой миграции. */
export const CHECKS: { label: string; table: string; column?: string; file: string }[] = [
  { label: "Ученики и профили", table: "students", file: "schema.sql" },
  { label: "Monthly Review и Vision Map", table: "students", column: "vision_map", file: "migration-monthly-vision.sql" },
  { label: "Журнал встреч", table: "meetings", file: "migration-meetings.sql" },
  { label: "План и самооценка ментора", table: "meeting_mentor_notes", file: "migration-meetings.sql" },
  { label: "Дедлайны", table: "student_deadlines", file: "migration-platform.sql" },
  { label: "GPA по четвертям", table: "term_grades", file: "migration-platform.sql" },
  { label: "Лента возможностей", table: "opportunities", file: "migration-platform.sql" },
  { label: "Ученики на паузе", table: "students", column: "status", file: "migration-pause.sql" },
  { label: "Групповые встречи", table: "meetings", column: "session_key", file: "migration-attendance.sql" },
  { label: "График и приглашения", table: "meeting_invites", file: "migration-schedule.sql" },
  { label: "Логотипы конкурсов", table: "opportunities", column: "logo_url", file: "migration-avatars.sql" },
  { label: "Проверка оценок ученика", table: "term_grades", column: "verified", file: "migration-student-edit.sql" },
  { label: "История действий", table: "activity_log", file: "migration-activity.sql" },
  { label: "Эссе", table: "essay_submissions", file: "migration-workflow.sql" },
  { label: "Шаблоны встреч", table: "meeting_templates", file: "migration-workflow.sql" },
];

export interface CheckResult {
  label: string;
  ok: boolean;
  file: string;
}

export async function runChecks(): Promise<CheckResult[]> {
  if (!isSupabaseConfigured()) return CHECKS.map((c) => ({ label: c.label, ok: false, file: c.file }));
  const supabase = createClient();
  return Promise.all(
    CHECKS.map(async (c) => {
      const { error } = await supabase.from(c.table).select(c.column ?? "*", { head: true, count: "exact" }).limit(1);
      return { label: c.label, ok: !error, file: c.file };
    }),
  );
}

/** Таблицы для резервной копии. */
export const BACKUP_TABLES = [
  "students",
  "profiles",
  "meetings",
  "meeting_mentor_notes",
  "student_deadlines",
  "term_grades",
  "meeting_invites",
  "essay_topics",
  "essay_submissions",
  "meeting_templates",
  "opportunities",
  "activity_log",
] as const;

async function fetchAll(table: string): Promise<Record<string, unknown>[] | null> {
  const supabase = createClient();
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) return rows.length ? rows : null;
    rows.push(...((data as Record<string, unknown>[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const text = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\r\n");
}

/** Скачать всё: zip с CSV по каждой таблице (для Excel) и backup.json (полная копия). */
export async function downloadBackup(onProgress?: (table: string) => void): Promise<{ tables: number; rows: number }> {
  const files: Record<string, Uint8Array> = {};
  const json: Record<string, unknown[]> = {};
  let total = 0;
  let tables = 0;
  for (const table of BACKUP_TABLES) {
    onProgress?.(table);
    const rows = await fetchAll(table);
    if (rows === null) continue;
    tables += 1;
    total += rows.length;
    json[table] = rows;
    files[`csv/${table}.csv`] = strToU8(toCsv(rows));
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  files["backup.json"] = strToU8(
    JSON.stringify({ app: "student-passport", createdAt: new Date().toISOString(), tables: json }, null, 1),
  );
  files["README.txt"] = strToU8(
    [
      "Резервная копия Digital Passport TODAY Scholars",
      `Создана: ${new Date().toLocaleString("ru-RU")}`,
      "",
      "csv/ — каждая таблица отдельным файлом, открывается в Excel / Google Sheets.",
      "backup.json — полная копия всех данных (для восстановления).",
      "Храните файл в надёжном месте: в нём личные данные учеников.",
    ].join("\r\n"),
  );
  const zip = zipSync(files, { level: 6 });
  const blob = new Blob([zip.slice().buffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `student-passport-backup-${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { tables, rows: total };
}
