import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { cached, peek } from "@/lib/cache";

export type EssayStatus = "draft" | "submitted" | "accepted" | "revision";

export const ESSAY_STATUS_LABELS: Record<EssayStatus | "none", string> = {
  none: "Не начато",
  draft: "Черновик",
  submitted: "На проверке",
  revision: "На доработке",
  accepted: "Сдано",
};

/** Цель по объёму. */
export const WORDS_MIN = 250;
export const WORDS_MAX = 300;
export const TOPICS_GOAL = 100;

export const CRITERIA = [
  { key: "scoreStructure", label: "Структура", hint: "Вступление, основная часть, вывод; логика абзацев" },
  { key: "scoreContent", label: "Содержание", hint: "Аргументы, примеры, глубина мысли" },
  { key: "scoreLanguage", label: "Язык", hint: "Грамматика, словарный запас, стиль" },
  { key: "scoreTopic", label: "Раскрытие темы", hint: "Ответил ли на вопрос темы" },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export interface EssayTopic {
  id: string;
  number: number;
  title: string;
  prompt: string;
}

export interface EssaySubmission {
  id: string;
  studentId: string;
  topicId: string;
  version: number;
  body: string;
  wordCount: number;
  status: EssayStatus;
  submittedAt: string | null;
  scoreStructure: number | null;
  scoreContent: number | null;
  scoreLanguage: number | null;
  scoreTopic: number | null;
  mentorComment: string;
  reviewedAt: string | null;
  updatedAt: string;
}

interface DbSubmission {
  id: string;
  student_id: string;
  topic_id: string;
  version: number;
  body: string;
  word_count: number;
  status: EssayStatus;
  submitted_at: string | null;
  score_structure: number | null;
  score_content: number | null;
  score_language: number | null;
  score_topic: number | null;
  mentor_comment: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

function mapSubmission(r: DbSubmission): EssaySubmission {
  return {
    id: r.id,
    studentId: r.student_id,
    topicId: r.topic_id,
    version: r.version,
    body: r.body ?? "",
    wordCount: r.word_count ?? 0,
    status: r.status,
    submittedAt: r.submitted_at,
    scoreStructure: r.score_structure,
    scoreContent: r.score_content,
    scoreLanguage: r.score_language,
    scoreTopic: r.score_topic,
    mentorComment: r.mentor_comment ?? "",
    reviewedAt: r.reviewed_at,
    updatedAt: r.updated_at,
  };
}

export function countWords(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

/** Средняя оценка работы (1–10) по заполненным критериям. */
export function essayScore(s: Pick<EssaySubmission, CriterionKey>): number | null {
  const v = CRITERIA.map((c) => s[c.key]).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function wordsTone(words: number): "short" | "ok" | "long" {
  if (words < WORDS_MIN) return "short";
  if (words > WORDS_MAX) return "long";
  return "ok";
}

// ---------- Загрузка ----------

async function fetchTopicsRaw(): Promise<EssayTopic[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createClient().from("essay_topics").select("id, number, title, prompt").order("number");
  if (error) throw error;
  return (data as EssayTopic[]) ?? [];
}

async function fetchSubmissionsRaw(studentId?: string): Promise<EssaySubmission[]> {
  if (!isSupabaseConfigured()) return [];
  let q = createClient().from("essay_submissions").select("*");
  if (studentId) q = q.eq("student_id", studentId);
  const { data, error } = await q.order("version");
  if (error) throw error;
  return ((data as DbSubmission[]) ?? []).map(mapSubmission);
}

export const fetchTopics = () => cached("essays:topics", fetchTopicsRaw);
export const peekTopics = () => peek<EssayTopic[]>("essays:topics");
export const fetchSubmissions = (studentId?: string) =>
  cached(`essays:subs:${studentId ?? "all"}`, () => fetchSubmissionsRaw(studentId));
export const peekSubmissions = (studentId?: string) => peek<EssaySubmission[]>(`essays:subs:${studentId ?? "all"}`);

async function fetchByParentTokenRaw(token: string): Promise<EssaySubmission[]> {
  if (!isSupabaseConfigured() || !token) return [];
  const { data, error } = await createClient().rpc("get_essays_by_parent_token", { p_token: token });
  if (error) throw error;
  return ((data as DbSubmission[]) ?? []).map(mapSubmission);
}

export const fetchSubmissionsByParentToken = (token: string) =>
  cached(`essays:parent:${token}`, () => fetchByParentTokenRaw(token));

export interface MyRank {
  accepted: number;
  place: number;
  totalStudents: number;
}

export async function fetchMyRank(): Promise<MyRank | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await createClient().rpc("my_essay_rank");
  if (error) throw error;
  const row = (data as { accepted: number; place: number; total_students: number }[] | null)?.[0];
  return row ? { accepted: row.accepted, place: row.place, totalStudents: row.total_students } : null;
}

// ---------- Ученик ----------

/** Сохранить черновик или сдать. Если id нет — создаётся новая версия. */
export async function saveEssay(params: {
  id?: string;
  studentId: string;
  topicId: string;
  version: number;
  body: string;
  submit: boolean;
}): Promise<EssaySubmission> {
  const supabase = createClient();
  const row = {
    body: params.body,
    word_count: countWords(params.body),
    status: params.submit ? "submitted" : "draft",
  };
  const query = params.id
    ? supabase.from("essay_submissions").update(row).eq("id", params.id)
    : supabase
        .from("essay_submissions")
        .insert({ ...row, student_id: params.studentId, topic_id: params.topicId, version: params.version });
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return mapSubmission(data as DbSubmission);
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await createClient().from("essay_submissions").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Ментор ----------

export async function reviewEssay(
  id: string,
  scores: Record<CriterionKey, number | null>,
  comment: string,
  status: "accepted" | "revision",
): Promise<void> {
  const { error } = await createClient()
    .from("essay_submissions")
    .update({
      score_structure: scores.scoreStructure,
      score_content: scores.scoreContent,
      score_language: scores.scoreLanguage,
      score_topic: scores.scoreTopic,
      mentor_comment: comment.trim(),
      status,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Разбор списка тем из текста: по строке на тему.
 * «12. Заголовок — пояснение», «12) Заголовок», «Заголовок | пояснение» или просто «Заголовок».
 * Строки без номера получают следующий свободный номер.
 */
export function parseTopicsText(text: string, existing: EssayTopic[]): { number: number; title: string; prompt: string }[] {
  const used = new Set(existing.map((t) => t.number));
  let next = existing.reduce((m, t) => Math.max(m, t.number), 0) + 1;
  const out: { number: number; title: string; prompt: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\t/g, " ").trim();
    if (!line) continue;
    let number: number | null = null;
    const m = line.match(/^(\d{1,3})\s*[.)\-:]?\s+(.*)$/);
    if (m) {
      number = Number(m[1]);
      line = m[2].trim();
    }
    const split = line.match(/^(.*?)\s+(?:—|–|\|)\s+(.*)$/) ?? line.match(/^(.*?)\s*\|\s*(.*)$/);
    const title = (split ? split[1] : line).trim();
    const prompt = (split ? split[2] : "").trim();
    if (!title) continue;
    if (number === null) {
      while (used.has(next)) next += 1;
      number = next;
    }
    used.add(number);
    out.push({ number, title, prompt });
  }
  return out;
}

/** Добавить / обновить темы по номеру. */
export async function upsertTopics(rows: { number: number; title: string; prompt: string }[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await createClient().from("essay_topics").upsert(rows, { onConflict: "number" });
  if (error) throw error;
}

export async function updateTopic(id: string, patch: { title?: string; prompt?: string }): Promise<void> {
  const { error } = await createClient().from("essay_topics").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTopic(id: string): Promise<void> {
  const { error } = await createClient().from("essay_topics").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Сводка по ученику ----------

export interface TopicState {
  topic: EssayTopic;
  /** Последняя версия (или null — не начато) */
  latest: EssaySubmission | null;
  versions: EssaySubmission[];
  status: EssayStatus | "none";
  /** Лучшая принятая оценка */
  score: number | null;
}

export function topicStates(topics: EssayTopic[], subs: EssaySubmission[]): TopicState[] {
  const byTopic = new Map<string, EssaySubmission[]>();
  for (const s of subs) byTopic.set(s.topicId, [...(byTopic.get(s.topicId) ?? []), s]);
  return topics.map((topic) => {
    const versions = (byTopic.get(topic.id) ?? []).sort((a, b) => a.version - b.version);
    const latest = versions[versions.length - 1] ?? null;
    const accepted = versions.filter((v) => v.status === "accepted");
    const status: TopicState["status"] = accepted.length ? "accepted" : latest ? latest.status : "none";
    const scores = accepted.map(essayScore).filter((x): x is number => x !== null);
    return { topic, latest, versions, status, score: scores.length ? Math.max(...scores) : null };
  });
}

export interface EssaySummary {
  accepted: number;
  submitted: number;
  revision: number;
  drafts: number;
  average: number | null;
  lastActivity: string | null;
}

export function essaySummary(subs: EssaySubmission[]): EssaySummary {
  const byTopic = new Map<string, EssaySubmission[]>();
  for (const s of subs) byTopic.set(s.topicId, [...(byTopic.get(s.topicId) ?? []), s]);
  let accepted = 0;
  let submitted = 0;
  let revision = 0;
  let drafts = 0;
  const scores: number[] = [];
  for (const list of byTopic.values()) {
    const sorted = [...list].sort((a, b) => a.version - b.version);
    const latest = sorted[sorted.length - 1];
    const acc = sorted.filter((v) => v.status === "accepted");
    if (acc.length) {
      accepted += 1;
      const best = Math.max(...acc.map((a) => essayScore(a) ?? 0));
      if (best > 0) scores.push(best);
    } else if (latest.status === "submitted") submitted += 1;
    else if (latest.status === "revision") revision += 1;
    else if (latest.status === "draft") drafts += 1;
  }
  const lastActivity = subs.reduce<string | null>((m, s) => (!m || s.updatedAt > m ? s.updatedAt : m), null);
  return {
    accepted,
    submitted,
    revision,
    drafts,
    average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    lastActivity,
  };
}
