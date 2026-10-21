import type { Attendance, MeetingFormat } from "@/lib/meetings";

/** Разбор CSV (Google Sheets: запятая; Excel RU: точка с запятой). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const MONTH_PREFIXES: [string, number][] = [
  ["янв", 0], ["фев", 1], ["мар", 2], ["апр", 3], ["мая", 4], ["май", 4], ["июн", 5],
  ["июл", 6], ["авг", 7], ["сен", 8], ["окт", 9], ["ноя", 10], ["дек", 11],
];

function monthOf(word: string): number | null {
  const w = word.toLowerCase();
  for (const [p, m] of MONTH_PREFIXES) if (w.startsWith(p)) return m;
  return null;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Год начала учебного года: июль–декабрь — этот год, январь–июнь — прошлый. */
export function academicStartYear(today = new Date()): number {
  return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
}

export interface WeekColumn {
  index: number;
  header: string;
  monday: string;
  format: MeetingFormat;
}

/**
 * «14-20 сен инд», «28-04 окт групп», «31-6 авг личн», «6-10 июля гр».
 * Месяц в подписи бывает и у начала, и у конца недели — берём тот вариант,
 * где первый день оказывается понедельником.
 */
export function parseWeekHeader(header: string, startYear: number): Omit<WeekColumn, "index" | "header"> | null {
  const h = header.trim().toLowerCase().replace(/ё/g, "е");
  const m = h.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*([а-я]+)/);
  if (!m) return null;
  let format: MeetingFormat | null = null;
  if (/инд|личн/.test(h)) format = "individual";
  else if (/гр/.test(h)) format = "group";
  if (!format) return null;
  const startDay = Number(m[1]);
  const month = monthOf(m[3]);
  if (month === null) return null;
  const yearFor = (mon: number) => (mon >= 6 ? startYear : startYear + 1);
  const candidates = [month, (month + 11) % 12].map((mon) => new Date(yearFor(mon), mon, startDay));
  const monday =
    candidates.find((d) => d.getDate() === startDay && d.getDay() === 1) ??
    (() => {
      const d = candidates[0];
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d;
    })();
  return { monday: iso(monday), format };
}

export function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

export interface SheetStudent {
  row: number;
  name: string;
  marks: { monday: string; format: MeetingFormat; attendance: Attendance }[];
  notes: number;
}

export interface ParsedSheet {
  weeks: WeekColumn[];
  students: SheetStudent[];
}

export function parseAttendanceSheet(text: string, startYear = academicStartYear()): ParsedSheet {
  const rows = parseCsv(text);
  let headerIdx = -1;
  let weeks: WeekColumn[] = [];
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const found: WeekColumn[] = [];
    rows[r].forEach((cell, index) => {
      const w = parseWeekHeader(cell, startYear);
      if (w) found.push({ index, header: cell.trim(), ...w });
    });
    if (found.length >= 2) {
      headerIdx = r;
      weeks = found;
      break;
    }
  }
  if (headerIdx < 0) return { weeks: [], students: [] };

  const header = rows[headerIdx];
  let nameCol = header.findIndex((c) => /^(имя|ученик|фио)/i.test(c.trim()));
  if (nameCol < 0) nameCol = 0;

  const students: SheetStudent[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const name = (rows[r][nameCol] ?? "").replace(/​/g, "").trim();
    if (!name || normalizeName(name).length === 0) continue;
    const marks: SheetStudent["marks"] = [];
    let notes = 0;
    for (const w of weeks) {
      const raw = (rows[r][w.index] ?? "").replace(/​/g, "").trim();
      if (raw === "1") marks.push({ monday: w.monday, format: w.format, attendance: "present" });
      else if (raw === "0") marks.push({ monday: w.monday, format: w.format, attendance: "absent" });
      else if (raw) notes += 1;
    }
    students.push({ row: r + 1, name, marks, notes });
  }
  return { weeks, students };
}

/** Найти ученика сайта по имени из таблицы (порядок слов не важен). */
export function matchStudent<T extends { id: string; firstName: string; lastName: string }>(
  name: string,
  students: T[],
): T | undefined {
  const tokens = normalizeName(name);
  const key = tokens.join(" ");
  const exact = students.find(
    (s) => normalizeName(`${s.firstName} ${s.lastName}`).join(" ") === key,
  );
  if (exact) return exact;
  const candidates = students.filter((s) => {
    const st = normalizeName(`${s.firstName} ${s.lastName}`);
    return st.length > 0 && st.every((t) => tokens.includes(t));
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}
