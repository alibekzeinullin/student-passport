"use client";

import { createClient } from "@/lib/supabase/client";
import { friendly } from "@/lib/groups";

export interface TopicRow {
  id: string;
  section: "math" | "verbal";
  name: string;
  sort: number;
}

export interface MockRow {
  id: string;
  stream_id: string | null;
  title: string;
  mock_date: string;
}

export interface MockResultRow {
  mock_id: string;
  student_id: string;
  verbal: number | null;
  math: number | null;
  total: number | null;
}

export interface PracticeRow {
  id: string;
  group_id: string;
  practice_date: string;
  topic_id: string | null;
  title: string;
  max_score: number;
}

export interface PracticeResultRow {
  practice_id: string;
  student_id: string;
  attempt: number;
  correct: number;
}

export interface CommentRow {
  id: string;
  student_id: string;
  author_id: string | null;
  author_name: string;
  visibility: "team" | "family";
  body: string;
  created_at: string;
}

export const SECTION_LABELS = { math: "Math", verbal: "Verbal" } as const;
export const MAX_ATTEMPTS = 3;

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const msg = error.message ?? "";
  if (error.code === "42P01" || error.code === "PGRST205" || msg.includes("Could not find")) {
    throw new Error("В базе нет таблиц результатов — нужно применить supabase/migration-sat-3.sql");
  }
  if (msg.includes("_check")) throw new Error("Балл раздела должен быть от 200 до 800");
  throw new Error(friendly(msg));
}

export interface ResultsData {
  topics: TopicRow[];
  mocks: MockRow[];
  mockResults: MockResultRow[];
  practices: PracticeRow[];
  practiceResults: PracticeResultRow[];
}

export async function loadResults(): Promise<ResultsData> {
  const supabase = createClient();
  const [topics, mocks, mr, practices, pr] = await Promise.all([
    supabase.from("sat_topics").select("id, section, name, sort").eq("active", true).order("section").order("sort"),
    supabase.from("mocks").select("id, stream_id, title, mock_date").order("mock_date"),
    supabase.from("mock_results").select("mock_id, student_id, verbal, math, total"),
    supabase.from("practices").select("id, group_id, practice_date, topic_id, title, max_score").order("practice_date"),
    supabase.from("practice_results").select("practice_id, student_id, attempt, correct"),
  ]);
  fail(topics.error);
  fail(mocks.error);
  fail(mr.error);
  fail(practices.error);
  fail(pr.error);
  return {
    topics: (topics.data as TopicRow[]) ?? [],
    mocks: (mocks.data as MockRow[]) ?? [],
    mockResults: (mr.data as MockResultRow[]) ?? [],
    practices: (practices.data as PracticeRow[]) ?? [],
    practiceResults: (pr.data as PracticeResultRow[]) ?? [],
  };
}

export async function createMock(input: { streamId: string | null; title: string; date: string }) {
  const { error } = await createClient().from("mocks").insert({ stream_id: input.streamId, title: input.title.trim(), mock_date: input.date });
  fail(error);
}

export async function deleteMock(id: string) {
  const { error } = await createClient().from("mocks").delete().eq("id", id);
  fail(error);
}

/** Сохранить баллы мока: заполненные — записать, очищенные — удалить. */
export async function saveMockResults(mockId: string, rows: { studentId: string; verbal: number | null; math: number | null }[]) {
  const supabase = createClient();
  const filled = rows.filter((r) => r.verbal !== null && r.math !== null);
  const cleared = rows.filter((r) => r.verbal === null && r.math === null).map((r) => r.studentId);
  if (filled.length) {
    const { error } = await supabase
      .from("mock_results")
      .upsert(filled.map((r) => ({ mock_id: mockId, student_id: r.studentId, verbal: r.verbal, math: r.math })), { onConflict: "mock_id,student_id" });
    fail(error);
  }
  if (cleared.length) {
    const { error } = await supabase.from("mock_results").delete().eq("mock_id", mockId).in("student_id", cleared);
    fail(error);
  }
}

export async function createPractice(input: { groupId: string; date: string; topicId: string | null; title: string; maxScore: number }) {
  const { error } = await createClient().from("practices").insert({
    group_id: input.groupId,
    practice_date: input.date,
    topic_id: input.topicId,
    title: input.title.trim(),
    max_score: input.maxScore,
  });
  fail(error);
}

export async function deletePractice(id: string) {
  const { error } = await createClient().from("practices").delete().eq("id", id);
  fail(error);
}

export async function savePracticeResults(practiceId: string, rows: { studentId: string; attempt: number; correct: number | null }[]) {
  const supabase = createClient();
  const filled = rows.filter((r) => r.correct !== null);
  const cleared = rows.filter((r) => r.correct === null);
  if (filled.length) {
    const { error } = await supabase
      .from("practice_results")
      .upsert(filled.map((r) => ({ practice_id: practiceId, student_id: r.studentId, attempt: r.attempt, correct: r.correct })), {
        onConflict: "practice_id,student_id,attempt",
      });
    fail(error);
  }
  for (const r of cleared) {
    const { error } = await supabase.from("practice_results").delete().eq("practice_id", practiceId).eq("student_id", r.studentId).eq("attempt", r.attempt);
    fail(error);
  }
}

export async function loadComments(studentId: string): Promise<CommentRow[]> {
  const { data, error } = await createClient()
    .from("sat_comments")
    .select("id, student_id, author_id, author_name, visibility, body, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  fail(error);
  return (data as CommentRow[]) ?? [];
}

export async function addComment(studentId: string, visibility: "team" | "family", body: string) {
  const { error } = await createClient().from("sat_comments").insert({ student_id: studentId, visibility, body: body.trim() });
  fail(error);
}

export async function deleteComment(id: string) {
  const { error } = await createClient().from("sat_comments").delete().eq("id", id);
  fail(error);
}

// ---------- Расчёты ----------

export function pctOf(correct: number, max: number): number {
  return max > 0 ? Math.round((100 * correct) / max) : 0;
}

/** Цвет результата практиса: <50 — красный, 50–79 — жёлтый, 80+ — зелёный. */
export function pctTone(pct: number): "low" | "mid" | "high" {
  if (pct < 50) return "low";
  if (pct < 80) return "mid";
  return "high";
}

export interface StudentMock {
  mock: MockRow;
  result: MockResultRow;
}

export function studentMocks(studentId: string, data: Pick<ResultsData, "mocks" | "mockResults">): StudentMock[] {
  const byId = new Map(data.mocks.map((m) => [m.id, m]));
  return data.mockResults
    .filter((r) => r.student_id === studentId && r.total !== null && byId.has(r.mock_id))
    .map((r) => ({ mock: byId.get(r.mock_id) as MockRow, result: r }))
    .sort((a, b) => a.mock.mock_date.localeCompare(b.mock.mock_date));
}

/** Сколько пройдено от первого мока до цели, 0–100. */
export function pathToTarget(first: number | null, last: number | null, target: number | null): number | null {
  if (first === null || last === null || !target) return null;
  if (target <= first) return last >= target ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((100 * (last - first)) / (target - first))));
}

export type Status = "growing" | "flat" | "risk" | "none";
export const STATUS_LABELS: Record<Status, string> = {
  growing: "растёт",
  flat: "стоит на месте",
  risk: "риск",
  none: "—",
};

/**
 * Статус ученика: риск — посещаемость < 75%, ДЗ < 60% или балл упал между последними моками;
 * растёт — +30 и больше между последними моками; иначе стоит на месте. Без двух моков — только риск или «—».
 */
export function studentStatus(totals: number[], attendance: number | null, homework: number | null): Status {
  const growth = totals.length >= 2 ? totals[totals.length - 1] - totals[totals.length - 2] : null;
  if ((attendance !== null && attendance < 75) || (homework !== null && homework < 60) || (growth !== null && growth < 0)) return "risk";
  if (growth === null) return "none";
  return growth >= 30 ? "growing" : "flat";
}

export interface TopicScore {
  topicId: string | null;
  name: string;
  section: "math" | "verbal" | null;
  pct: number;
  attempts: number;
  practiceId: string;
  date: string;
}

/** Лучший результат по каждому практису ученика (с учётом перерешиваний). */
export function studentPractices(
  studentId: string,
  data: Pick<ResultsData, "practices" | "practiceResults" | "topics">,
): TopicScore[] {
  const topics = new Map(data.topics.map((t) => [t.id, t]));
  return data.practices
    .map((p) => {
      const rs = data.practiceResults.filter((r) => r.practice_id === p.id && r.student_id === studentId);
      if (!rs.length) return null;
      const best = Math.max(...rs.map((r) => r.correct));
      const topic = p.topic_id ? topics.get(p.topic_id) : undefined;
      return {
        topicId: p.topic_id,
        name: topic?.name ?? (p.title || "Практис"),
        section: topic?.section ?? null,
        pct: pctOf(best, p.max_score),
        attempts: rs.length,
        practiceId: p.id,
        date: p.practice_date,
      } satisfies TopicScore;
    })
    .filter((x): x is TopicScore => x !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Темы по слабости: по последнему практису каждой темы, от худшей. */
export function weakTopics(scores: TopicScore[]): TopicScore[] {
  const latest = new Map<string, TopicScore>();
  for (const s of scores) {
    const key = s.topicId ?? s.name;
    if (!latest.has(key)) latest.set(key, s); // scores отсортированы от новых к старым
  }
  return [...latest.values()].sort((a, b) => a.pct - b.pct);
}

// ---------- Вставка из таблицы ----------

function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** Ищет ученика по ФИО в любом порядке слов. */
export function matchStudent<T extends { student_id: string; full_name: string }>(name: string, list: T[]): T | null {
  const words = norm(name).split(" ").filter(Boolean).sort().join(" ");
  if (!words) return null;
  return list.find((s) => norm(s.full_name).split(" ").sort().join(" ") === words) ?? null;
}

export interface PasteRow {
  line: number;
  name: string;
  values: number[];
  studentId: string | null;
  problem: string | null;
}

/** Строки «ФИО; число; число…» (разделитель ; , или табуляция — как при копировании из Google Таблиц). */
export function parsePaste<T extends { student_id: string; full_name: string }>(text: string, list: T[], columns: number): PasteRow[] {
  return text
    .split(/\r?\n/)
    .map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter((l) => l.raw)
    .map(({ raw, line }) => {
      const parts = raw.split(/\t|;/).map((p) => p.trim());
      const name = parts[0] ?? "";
      const values = parts.slice(1, 1 + columns).map((v) => Number.parseInt(v.replace(/\s/g, ""), 10));
      const student = matchStudent(name, list);
      let problem: string | null = null;
      if (!student) problem = "ученик не найден";
      else if (values.length < columns || values.some((v) => !Number.isFinite(v))) problem = "нет чисел";
      return { line, name, values, studentId: student?.student_id ?? null, problem };
    });
}
