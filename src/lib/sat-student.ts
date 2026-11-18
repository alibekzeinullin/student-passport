"use client";

import { createClient } from "@/lib/supabase/client";
import { LESSON_COLUMNS, type LessonRow } from "@/lib/lessons";
import type { MockRow, MockResultRow, ResultsData } from "@/lib/results";

/** Данные кабинета SAT ученика сверх занятий и результатов: офиц. экзамены, место по моку, отметки, домашка. */

export interface OfficialResult {
  id: string;
  student_id: string;
  exam_date: string;
  verbal: number;
  math: number;
  total: number;
}

export interface MockRank {
  mock_title: string;
  mock_date: string;
  place: number;
  total_students: number;
  score: number | null;
}

export interface MyMark {
  lesson_id: string;
  attendance: "present" | "late" | "absent" | null;
  homework: "done" | "partial" | "none" | null;
  lesson_date: string;
}

function missing(msg: string): boolean {
  return /does not exist|schema cache|could not find|PGRST20/i.test(msg);
}

export async function loadOfficial(studentId: string): Promise<OfficialResult[]> {
  const { data, error } = await createClient()
    .from("sat_official_results")
    .select("id, student_id, exam_date, verbal, math, total")
    .eq("student_id", studentId)
    .order("exam_date");
  if (error) {
    if (missing(error.message)) return [];
    throw error;
  }
  return (data as OfficialResult[]) ?? [];
}

export async function addOfficial(studentId: string, input: { date: string; verbal: number; math: number }) {
  const bad = (v: number) => !Number.isFinite(v) || v < 200 || v > 800 || v % 10 !== 0;
  if (bad(input.verbal) || bad(input.math)) throw new Error("Баллы раздела — от 200 до 800, кратно 10");
  const { error } = await createClient()
    .from("sat_official_results")
    .upsert({ student_id: studentId, exam_date: input.date, verbal: input.verbal, math: input.math }, { onConflict: "student_id,exam_date" });
  if (error) throw new Error(error.message.includes("_check") ? "Баллы раздела — от 200 до 800, кратно 10" : error.message);
}

export async function deleteOfficial(id: string) {
  const { error } = await createClient().from("sat_official_results").delete().eq("id", id);
  if (error) throw error;
}

export async function loadMockRank(studentId: string): Promise<MockRank | null> {
  const { data, error } = await createClient().rpc("my_mock_rank", { p_student: studentId });
  if (error) return null;
  const row = ((data as MockRank[]) ?? [])[0];
  return row && row.total_students > 0 ? row : null;
}

/** Свои отметки по занятиям SAT (не office hours) — для серий и ачивок. */
export async function loadMyMarks(studentId: string): Promise<MyMark[]> {
  const { data, error } = await createClient()
    .from("lesson_marks")
    .select("lesson_id, attendance, homework, lessons!inner(lesson_date, status, kind, groups!inner(course_id))")
    .eq("student_id", studentId);
  if (error) return [];
  type Row = { lesson_id: string; attendance: MyMark["attendance"]; homework: MyMark["homework"]; lessons: { lesson_date: string; status: string; kind?: string; groups: { course_id: string } } };
  return ((data as unknown as Row[]) ?? [])
    .filter((r) => r.lessons && r.lessons.status === "planned" && (r.lessons.kind ?? "lesson") === "lesson" && r.lessons.groups?.course_id === "sat")
    .map((r) => ({ lesson_id: r.lesson_id, attendance: r.attendance, homework: r.homework, lesson_date: r.lessons.lesson_date }))
    .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
}

/** Занятия с домашкой: последние заданные (до сегодня включительно). */
export async function loadHomeworkLessons(today: string, limit = 6): Promise<LessonRow[]> {
  const { data, error } = await createClient()
    .from("lessons")
    .select(LESSON_COLUMNS)
    .neq("homework", "")
    .lte("lesson_date", today)
    .eq("status", "planned")
    .order("lesson_date", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data as unknown as LessonRow[]) ?? []).filter((l) => l.groups?.course_id === "sat");
}

// ---------- Ачивки ----------

export interface Achievement {
  id: string;
  group: "streak" | "mocks" | "practice" | "month";
  title: string;
  hint: string;
  icon: string;
  earned: boolean;
  /** прогресс к следующему уровню, если ещё не получена */
  progress?: { value: number; goal: number };
}

/** Самая длинная и текущая серия подряд идущих значений, удовлетворяющих условию. */
function streaks<T>(list: T[], ok: (x: T) => boolean): { best: number; current: number } {
  let best = 0;
  let run = 0;
  for (const x of list) {
    run = ok(x) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { best, current: run };
}

function tiered(
  id: string,
  group: Achievement["group"],
  icon: string,
  value: number,
  tiers: number[],
  title: (n: number) => string,
  hint: (n: number) => string,
): Achievement[] {
  // показываем полученные уровни и один следующий
  const out: Achievement[] = [];
  for (const n of tiers) {
    if (value >= n) out.push({ id: `${id}-${n}`, group, icon, title: title(n), hint: hint(n), earned: true });
    else {
      out.push({ id: `${id}-${n}`, group, icon, title: title(n), hint: hint(n), earned: false, progress: { value, goal: n } });
      break;
    }
  }
  return out;
}

export interface AchievementInput {
  marks: MyMark[];
  mocks: { mock: MockRow; result: MockResultRow }[];
  official: OfficialResult[];
  practiceResults: ResultsData["practiceResults"];
  practices: ResultsData["practices"];
  studentId: string;
}

export function computeAchievements(input: AchievementInput): Achievement[] {
  const out: Achievement[] = [];
  const attended = input.marks.filter((m) => m.attendance !== null);
  const hw = input.marks.filter((m) => m.homework !== null);

  // 1) Серии
  const att = streaks(attended, (m) => m.attendance === "present" || m.attendance === "late");
  out.push(
    ...tiered("att", "streak", "🔥", att.best, [5, 10, 20], (n) => `${n} занятий подряд`, (n) => `Без пропусков ${n} занятий подряд`),
  );
  const hws = streaks(hw, (m) => m.homework === "done");
  out.push(...tiered("hw", "streak", "📚", hws.best, [5, 10, 20], (n) => `ДЗ ×${n} подряд`, (n) => `${n} домашних заданий подряд сделаны полностью`));

  // 2) Рост по мокам (вместе с официальным SAT)
  const totals = [
    ...input.mocks.map((m) => ({ date: m.mock.mock_date, total: m.result.total ?? 0 })),
    ...input.official.map((o) => ({ date: o.exam_date, total: o.total })),
  ]
    .filter((t) => t.total > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  let bestJump = 0;
  for (let i = 1; i < totals.length; i++) bestJump = Math.max(bestJump, totals[i].total - totals[i - 1].total);
  out.push({
    id: "mock-jump",
    group: "mocks",
    icon: "📈",
    title: "+50 к прошлому",
    hint: "Результат выше прошлого мока на 50 баллов и больше",
    earned: bestJump >= 50,
    progress: totals.length >= 2 ? { value: Math.max(0, bestJump), goal: 50 } : undefined,
  });
  const fromFirst = totals.length >= 2 ? Math.max(...totals.slice(1).map((t) => t.total)) - totals[0].total : 0;
  out.push({
    id: "mock-100",
    group: "mocks",
    icon: "🚀",
    title: "+100 от первого",
    hint: "Лучший результат выше первого мока на 100 баллов",
    earned: fromFirst >= 100,
    progress: totals.length >= 2 ? { value: Math.max(0, fromFirst), goal: 100 } : undefined,
  });
  const top = totals.length ? Math.max(...totals.map((t) => t.total)) : 0;
  out.push(...tiered("mock-top", "mocks", "🏅", top, [1200, 1300, 1400, 1500], (n) => `Первые ${n}`, (n) => `Набрать ${n}+ на моке или SAT`));

  // 3) Практисы
  const mine = input.practiceResults.filter((r) => r.student_id === input.studentId);
  const byPractice = new Map<string, number[]>();
  mine
    .slice()
    .sort((a, b) => a.attempt - b.attempt)
    .forEach((r) => byPractice.set(r.practice_id, [...(byPractice.get(r.practice_id) ?? []), r.correct]));
  const maxOf = new Map(input.practices.map((p) => [p.id, p.max_score]));
  const topicOf = new Map(input.practices.map((p) => [p.id, p.topic_id ?? p.id]));
  out.push(...tiered("pr-count", "practice", "✏️", byPractice.size, [10, 25, 50], (n) => `${n} практисов`, (n) => `Сделать ${n} практисов`));
  // тема закрыта: лучший результат по последнему практису темы ≥ 80%
  const latestByTopic = new Map<string, number>();
  input.practices
    .filter((p) => byPractice.has(p.id))
    .slice()
    .sort((a, b) => a.practice_date.localeCompare(b.practice_date))
    .forEach((p) => latestByTopic.set(topicOf.get(p.id) as string, Math.max(...(byPractice.get(p.id) as number[])) / (maxOf.get(p.id) || 1)));
  const closed = [...latestByTopic.values()].filter((v) => v >= 0.8).length;
  out.push(...tiered("pr-closed", "practice", "✅", closed, [1, 5, 10], (n) => (n === 1 ? "Первая тема на 80%+" : `${n} тем на 80%+`), (n) => `Закрыть ${n} ${n === 1 ? "тему" : "тем"} на 80% и выше`));
  let redoGain = 0;
  byPractice.forEach((list, id) => {
    if (list.length > 1) redoGain = Math.max(redoGain, (Math.max(...list.slice(1)) - list[0]) / (maxOf.get(id) || 1));
  });
  out.push({
    id: "pr-redo",
    group: "practice",
    icon: "🔁",
    title: "Перерешал +20%",
    hint: "Перерешать практис и поднять результат на 20% и больше",
    earned: redoGain >= 0.2,
  });

  // 4) Месяц без пропусков / ДЗ 100% (в месяце хотя бы 4 отмеченных занятия)
  const months = new Map<string, MyMark[]>();
  input.marks.forEach((m) => months.set(m.lesson_date.slice(0, 7), [...(months.get(m.lesson_date.slice(0, 7)) ?? []), m]));
  const fullAttendance = [...months.values()].filter((l) => {
    const a = l.filter((m) => m.attendance !== null);
    return a.length >= 4 && a.every((m) => m.attendance === "present" || m.attendance === "late");
  }).length;
  const fullHomework = [...months.values()].filter((l) => {
    const h = l.filter((m) => m.homework !== null);
    return h.length >= 4 && h.every((m) => m.homework === "done");
  }).length;
  out.push({
    id: "month-att",
    group: "month",
    icon: "📅",
    title: fullAttendance > 1 ? `Месяц без пропусков ×${fullAttendance}` : "Месяц без пропусков",
    hint: "Все занятия месяца посещены (от 4 занятий)",
    earned: fullAttendance > 0,
  });
  out.push({
    id: "month-hw",
    group: "month",
    icon: "🏆",
    title: fullHomework > 1 ? `ДЗ 100% ×${fullHomework}` : "ДЗ 100% за месяц",
    hint: "Все домашки месяца сделаны полностью (от 4 заданий)",
    earned: fullHomework > 0,
  });

  return out;
}

/** Делает ссылки в тексте кликабельными (http/https). */
export function linkParts(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  const re = /https?:\/\/[^\s)]+/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], href: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
