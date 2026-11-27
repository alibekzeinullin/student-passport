"use client";

import { createClient } from "@/lib/supabase/client";
import { friendly } from "@/lib/groups";
import type { ImportResult } from "@/lib/test-import";
import type { TopicRow } from "@/lib/results";

/** Тесты на сайте (SAT): сотрудники собирают и публикуют, ученики проходят через функции базы. */

export interface TestRow {
  id: string;
  title: string;
  description: string;
  created_by: string | null;
  created_at: string;
}

export interface SectionRow {
  id: string;
  test_id: string;
  position: number;
  title: string;
  section: "verbal" | "math";
  minutes: number;
  calculator: boolean;
}

export interface QuestionRow {
  id: string;
  section_id: string;
  position: number;
  kind: "choice" | "input";
  passage: string;
  stem: string;
  image: string;
  options: string[];
  answer: string;
  topic_id: string | null;
  topic_label: string;
  points: number;
}

export interface AssignmentRow {
  id: string;
  test_id: string;
  group_id: string;
  opens_at: string;
  closes_at: string | null;
  review_open: boolean;
  created_at: string;
  /** только присутствующие на занятии и по коду учителя */
  gated: boolean;
  access_code: string | null;
  code_until: string | null;
}

export interface AttemptRow {
  id: string;
  assignment_id: string;
  test_id: string;
  student_id: string;
  current_position: number;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
  tab_switches: number;
}

export interface AnswerRow {
  attempt_id: string;
  question_id: string;
  answer: string;
  is_correct: boolean | null;
  points_awarded: number | null;
  /** сколько ученик провёл на вопросе, мс */
  time_ms: number;
}

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const msg = error.message ?? "";
  if (error.code === "42P01" || error.code === "PGRST205" || msg.includes("Could not find")) {
    throw new Error("В базе нет таблиц тестов — нужно применить supabase/migration-sat-5.sql");
  }
  throw new Error(friendly(msg));
}

// ---------- Сотрудники ----------

export async function loadTests(): Promise<{ tests: TestRow[]; sections: SectionRow[]; counts: Map<string, number>; assignments: AssignmentRow[] }> {
  const supabase = createClient();
  const [t, s, q, a] = await Promise.all([
    supabase.from("online_tests").select("id, title, description, created_by, created_at").order("created_at", { ascending: false }),
    supabase.from("test_sections").select("id, test_id, position, title, section, minutes, calculator").order("position"),
    supabase.from("test_questions").select("section_id"),
    supabase.from("test_assignments").select("id, test_id, group_id, opens_at, closes_at, review_open, created_at, gated, access_code, code_until"),
  ]);
  fail(t.error);
  fail(s.error);
  fail(q.error);
  fail(a.error);
  const sections = (s.data as SectionRow[]) ?? [];
  const bySection = new Map<string, number>();
  ((q.data as { section_id: string }[]) ?? []).forEach((r) => bySection.set(r.section_id, (bySection.get(r.section_id) ?? 0) + 1));
  const counts = new Map<string, number>();
  sections.forEach((x) => counts.set(x.test_id, (counts.get(x.test_id) ?? 0) + (bySection.get(x.id) ?? 0)));
  return { tests: (t.data as TestRow[]) ?? [], sections, counts, assignments: (a.data as AssignmentRow[]) ?? [] };
}

export interface TestFull {
  test: TestRow;
  sections: SectionRow[];
  questions: QuestionRow[];
  assignments: AssignmentRow[];
}

export async function loadTest(id: string): Promise<TestFull> {
  const supabase = createClient();
  const [t, s, a] = await Promise.all([
    supabase.from("online_tests").select("id, title, description, created_by, created_at").eq("id", id).single(),
    supabase.from("test_sections").select("id, test_id, position, title, section, minutes, calculator").eq("test_id", id).order("position"),
    supabase.from("test_assignments").select("id, test_id, group_id, opens_at, closes_at, review_open, created_at, gated, access_code, code_until").eq("test_id", id),
  ]);
  fail(t.error);
  fail(s.error);
  fail(a.error);
  const sections = (s.data as SectionRow[]) ?? [];
  let questions: QuestionRow[] = [];
  if (sections.length) {
    const q = await supabase
      .from("test_questions")
      .select("id, section_id, position, kind, passage, stem, image, options, answer, topic_id, topic_label, points")
      .in("section_id", sections.map((x) => x.id))
      .order("position");
    fail(q.error);
    questions = ((q.data as QuestionRow[]) ?? []).map((x) => ({ ...x, points: Number(x.points) }));
  }
  return { test: t.data as TestRow, sections, questions, assignments: (a.data as AssignmentRow[]) ?? [] };
}

/** Найти тему SAT по названию из файла (без учёта регистра); иначе оставить подписью. */
export function matchTopic(label: string, section: "verbal" | "math", topics: TopicRow[]): { topic_id: string | null; topic_label: string } {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-zа-я0-9]+/g, " ").trim();
  const l = norm(label);
  if (!l) return { topic_id: null, topic_label: "" };
  const exact = topics.find((t) => norm(t.name) === l);
  const loose = exact ?? topics.find((t) => t.section === section && (norm(t.name).includes(l) || l.includes(norm(t.name))));
  return loose ? { topic_id: loose.id, topic_label: "" } : { topic_id: null, topic_label: label.trim() };
}

/** Создать тест целиком из разобранного файла. */
export async function createTestFromImport(parsed: ImportResult, topics: TopicRow[]): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.from("online_tests").insert({ title: parsed.title.trim() || "Тест" }).select("id").single();
  fail(error);
  const testId = (data as { id: string }).id;
  try {
    for (const [i, s] of parsed.sections.entries()) {
      const { data: sec, error: sErr } = await supabase
        .from("test_sections")
        .insert({ test_id: testId, position: i + 1, title: s.title, section: s.section, minutes: s.minutes, calculator: s.calculator })
        .select("id")
        .single();
      fail(sErr);
      const sectionId = (sec as { id: string }).id;
      const rows = s.questions.map((q, qi) => ({
        section_id: sectionId,
        position: qi + 1,
        kind: q.kind,
        passage: q.passage,
        stem: q.stem,
        image: q.image,
        options: q.options,
        answer: q.answer,
        points: q.points,
        ...matchTopic(q.topic, s.section, topics),
      }));
      for (let k = 0; k < rows.length; k += 25) {
        const { error: qErr } = await supabase.from("test_questions").insert(rows.slice(k, k + 25));
        fail(qErr);
      }
    }
  } catch (err) {
    await supabase.from("online_tests").delete().eq("id", testId);
    throw err;
  }
  return testId;
}

export async function createEmptyTest(title: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.from("online_tests").insert({ title: title.trim() || "Новый тест" }).select("id").single();
  fail(error);
  const id = (data as { id: string }).id;
  const { error: sErr } = await supabase.from("test_sections").insert([
    // при вставке нескольких строк все поля должны быть у каждой строки — иначе база получает null вместо значения по умолчанию
    { test_id: id, position: 1, title: "Reading and Writing — Модуль 1", section: "verbal", minutes: 32, calculator: false },
    { test_id: id, position: 2, title: "Math — Модуль 1", section: "math", minutes: 35, calculator: true },
  ]);
  fail(sErr);
  return id;
}

export async function updateTest(id: string, patch: Partial<Pick<TestRow, "title" | "description">>) {
  const { error } = await createClient().from("online_tests").update(patch).eq("id", id);
  fail(error);
}

export async function deleteTest(id: string) {
  const { error } = await createClient().from("online_tests").delete().eq("id", id);
  fail(error);
}

export async function saveSection(s: Partial<SectionRow> & { test_id: string }) {
  const supabase = createClient();
  const { id, ...rest } = s;
  const { error } = id ? await supabase.from("test_sections").update(rest).eq("id", id) : await supabase.from("test_sections").insert(rest);
  fail(error);
}

export async function deleteSection(id: string) {
  const { error } = await createClient().from("test_sections").delete().eq("id", id);
  fail(error);
}

export async function saveQuestion(q: Partial<QuestionRow> & { section_id: string }) {
  const supabase = createClient();
  const { id, ...rest } = q;
  const { error } = id ? await supabase.from("test_questions").update(rest).eq("id", id) : await supabase.from("test_questions").insert(rest);
  fail(error);
}

export async function deleteQuestion(id: string) {
  const { error } = await createClient().from("test_questions").delete().eq("id", id);
  fail(error);
}

/** Поменять местами два вопроса (уникальная пара section+position — через временный номер). */
export async function swapQuestions(a: QuestionRow, b: QuestionRow) {
  const supabase = createClient();
  let r = await supabase.from("test_questions").update({ position: -1 }).eq("id", a.id);
  fail(r.error);
  r = await supabase.from("test_questions").update({ position: a.position }).eq("id", b.id);
  fail(r.error);
  r = await supabase.from("test_questions").update({ position: b.position }).eq("id", a.id);
  fail(r.error);
}

export async function publishTest(testId: string, groupIds: string[], opensAt: string, closesAt: string | null, gated = true) {
  const rows = groupIds.map((g) => ({ test_id: testId, group_id: g, opens_at: opensAt, closes_at: closesAt, gated }));
  const { error } = await createClient().from("test_assignments").upsert(rows, { onConflict: "test_id,group_id" });
  fail(error);
}

export async function updateAssignment(id: string, patch: Partial<Pick<AssignmentRow, "opens_at" | "closes_at" | "review_open" | "gated" | "access_code" | "code_until">>) {
  const { error } = await createClient().from("test_assignments").update(patch).eq("id", id);
  fail(error);
}

/** Кто допущен к тесту «в классе» (по публикациям). */
export async function loadAllowed(assignmentIds: string[]): Promise<{ assignment_id: string; student_id: string }[]> {
  if (!assignmentIds.length) return [];
  const { data, error } = await createClient().from("test_allowed").select("assignment_id, student_id").in("assignment_id", assignmentIds);
  if (error) return [];
  return (data as { assignment_id: string; student_id: string }[]) ?? [];
}

/** Код из 6 цифр — учитель говорит его в классе. */
export function newAccessCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}

/**
 * Запустить тест в классе: допустить отмеченных учеников (список заменяется) и выдать код на minutes минут.
 * Тем, кто уже начал, ничего не мешает закончить.
 */
export async function openTestSession(assignmentId: string, studentIds: string[], minutes: number): Promise<string> {
  const supabase = createClient();
  const del = await supabase.from("test_allowed").delete().eq("assignment_id", assignmentId);
  fail(del.error);
  if (studentIds.length) {
    const ins = await supabase.from("test_allowed").insert(studentIds.map((s) => ({ assignment_id: assignmentId, student_id: s })));
    fail(ins.error);
  }
  const code = newAccessCode();
  const up = await supabase
    .from("test_assignments")
    .update({ gated: true, access_code: code, code_until: new Date(Date.now() + minutes * 60000).toISOString() })
    .eq("id", assignmentId);
  fail(up.error);
  return code;
}

export async function closeTestSession(assignmentId: string) {
  const { error } = await createClient().from("test_assignments").update({ access_code: null, code_until: null }).eq("id", assignmentId);
  fail(error);
}

export async function deleteAssignment(id: string) {
  const { error } = await createClient().from("test_assignments").delete().eq("id", id);
  fail(error);
}

export async function loadAttempts(testId: string): Promise<{ attempts: AttemptRow[]; answers: AnswerRow[] }> {
  const supabase = createClient();
  const a = await supabase
    .from("test_attempts")
    .select("id, assignment_id, test_id, student_id, current_position, started_at, finished_at, score, max_score, tab_switches")
    .eq("test_id", testId);
  fail(a.error);
  const attempts = ((a.data as AttemptRow[]) ?? []).map((x) => ({ ...x, score: x.score === null ? null : Number(x.score), max_score: x.max_score === null ? null : Number(x.max_score) }));
  let answers: AnswerRow[] = [];
  const done = attempts.filter((x) => x.finished_at).map((x) => x.id);
  for (let i = 0; i < done.length; i += 50) {
    const r = await supabase.from("test_answers").select("attempt_id, question_id, answer, is_correct, points_awarded, time_ms").in("attempt_id", done.slice(i, i + 50));
    fail(r.error);
    answers = answers.concat((r.data as AnswerRow[]) ?? []);
  }
  return { attempts, answers };
}

export async function deleteAttempt(id: string) {
  const { error } = await createClient().from("test_attempts").delete().eq("id", id);
  fail(error);
}

export async function rescoreTest(testId: string): Promise<number> {
  const { data, error } = await createClient().rpc("rescore_test", { p_test: testId });
  fail(error);
  return (data as number) ?? 0;
}

/** Балл раздела в шкале 200–800 по доле набранных баллов (примерно, официальной шкалы нет). */
export function scaled(pct: number): number {
  return Math.round((200 + 600 * Math.max(0, Math.min(1, pct))) / 10) * 10;
}

// ---------- Ученик ----------

export interface MyTest {
  assignment_id: string;
  test_id: string;
  title: string;
  description: string;
  opens_at: string;
  closes_at: string | null;
  sections: number;
  questions: number;
  total_minutes: number;
  attempt_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
  review_open: boolean;
  /** тест запускается учителем в классе */
  gated: boolean;
  /** учитель отметил ученика как присутствующего */
  allowed: boolean;
  /** код сейчас действует */
  code_active: boolean;
}

export async function loadMyTests(): Promise<MyTest[]> {
  const { data, error } = await createClient().rpc("my_tests");
  if (error) return [];
  return (data as MyTest[]) ?? [];
}

export async function startTest(assignmentId: string, code?: string): Promise<string> {
  const { data, error } = await createClient().rpc("start_test", { p_assignment: assignmentId, p_code: code ?? null });
  fail(error);
  return data as string;
}

export interface RunQuestion {
  id: string;
  position: number;
  kind: "choice" | "input";
  passage: string;
  stem: string;
  image: string;
  options: string[];
  points: number;
}

export interface RunState {
  finished: boolean;
  test_title: string;
  sections?: { position: number; title: string; section: "verbal" | "math"; minutes: number; count: number }[];
  current?: { position: number; title: string; section: "verbal" | "math"; minutes: number; calculator: boolean; seconds_left: number };
  questions?: RunQuestion[];
  answers?: Record<string, { answer: string; flagged: boolean }>;
}

export async function loadAttemptState(attemptId: string): Promise<RunState> {
  const { data, error } = await createClient().rpc("attempt_state", { p_attempt: attemptId });
  fail(error);
  return data as RunState;
}

export async function saveTestAnswer(attemptId: string, questionId: string, answer: string, flagged: boolean): Promise<boolean> {
  const { data, error } = await createClient().rpc("save_test_answer", { p_attempt: attemptId, p_question: questionId, p_answer: answer, p_flagged: flagged });
  fail(error);
  return Boolean(data);
}

export async function nextTestSection(attemptId: string) {
  const { error } = await createClient().rpc("next_test_section", { p_attempt: attemptId });
  fail(error);
}

/** Время на вопросе — копится на сервере (не больше 10 минут за раз). */
export async function addQuestionTime(attemptId: string, questionId: string, ms: number) {
  if (ms < 300) return;
  await createClient().rpc("add_question_time", { p_attempt: attemptId, p_question: questionId, p_ms: Math.round(ms) });
}

export async function noteTabSwitch(attemptId: string) {
  await createClient().rpc("note_tab_switch", { p_attempt: attemptId });
}

export interface AttemptResult {
  test_title: string;
  score: number;
  max_score: number;
  finished_at: string;
  review_open: boolean;
  sections: { title: string; section: "verbal" | "math"; score: number; max: number }[];
  topics: { topic: string; section: "verbal" | "math"; correct: number; total: number; pct: string }[];
  questions: {
    position: number;
    section_title: string;
    is_correct: boolean | null;
    answer: string;
    topic: string;
    kind: "choice" | "input";
    stem: string | null;
    passage: string | null;
    options: string[] | null;
    image: string | null;
    correct_answer: string | null;
  }[];
}

export async function loadAttemptResult(attemptId: string): Promise<AttemptResult> {
  const { data, error } = await createClient().rpc("attempt_result", { p_attempt: attemptId });
  fail(error);
  return data as AttemptResult;
}

// ---------- Картинки: сжатие в браузере ----------

/** Уменьшить картинку до 1000 px по ширине и пережать в WebP (обычно 30–80 КБ). */
export async function compressImage(dataUrl: string, maxWidth = 1000, quality = 0.82): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  const img = new Image();
  img.src = dataUrl;
  await img.decode().catch(() => undefined);
  if (!img.naturalWidth) return dataUrl;
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/webp", quality);
  return out.length < dataUrl.length ? out : dataUrl;
}

/**
 * Перенести результаты в «Пробные экзамены» (для динамики и места по моку): Verbal и Math в шкале 200–800
 * по доле набранных баллов в модулях раздела. Создаёт мок на поток группы (нужны права руководителя SAT).
 */
export async function transferToMock(input: {
  title: string;
  date: string;
  streamId: string | null;
  rows: { studentId: string; verbalPct: number | null; mathPct: number | null }[];
}): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.from("mocks").insert({ stream_id: input.streamId, title: input.title, mock_date: input.date }).select("id").single();
  fail(error);
  const mockId = (data as { id: string }).id;
  const rows = input.rows
    .filter((r) => r.verbalPct !== null && r.mathPct !== null)
    .map((r) => ({ mock_id: mockId, student_id: r.studentId, verbal: scaled(r.verbalPct as number), math: scaled(r.mathPct as number) }));
  if (rows.length) {
    const { error: rErr } = await supabase.from("mock_results").upsert(rows, { onConflict: "mock_id,student_id" });
    fail(rErr);
  }
  return rows.length;
}
