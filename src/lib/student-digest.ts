"use client";

import { createClient } from "@/lib/supabase/client";
import { addDays, isoDate } from "@/lib/lessons";
import { loadResults, studentMocks, studentPractices, weakTopics, type ResultsData, type TopicScore } from "@/lib/results";
import { loadOfficial, type OfficialResult } from "@/lib/sat-student";

/**
 * Сводка по ученику SAT для обратной связи: всё, что было с прошлой обратной связи
 * (или за последний месяц). Только для сотрудников — данные читаются по их правам.
 */
export interface Digest {
  since: string;
  /** true — с даты прошлой обратной связи, false — за месяц */
  sinceFeedback: boolean;
  lessons: { total: number; present: number; late: number; absent: number; hwDone: number; hwPartial: number; hwNone: number; activeHigh: number; activeLow: number };
  mocks: { title: string; date: string; verbal: number; math: number; total: number }[];
  official: OfficialResult[];
  target: number | null;
  satDate: string | null;
  /** практисы за период (лучшая попытка) */
  practices: TopicScore[];
  /** слабые темы сейчас (по последним практисам), меньше 80% */
  weak: TopicScore[];
  tests: { title: string; date: string; score: number; max: number; wrongTopics: string[] }[];
  oh: { date: string; title: string; attended: boolean; comment: string }[];
}

/** Дата прошлой обратной связи в карточке (комментарий для ученика и родителя). */
export async function lastFamilyFeedback(studentId: string): Promise<string | null> {
  const { data } = await createClient()
    .from("sat_comments")
    .select("created_at")
    .eq("student_id", studentId)
    .eq("visibility", "family")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data as { created_at: string }[] | null)?.[0];
  return row ? isoDate(new Date(row.created_at)) : null;
}

/** Дата прошлой обратной связи по office hours (кроме текущих). */
export async function lastOhFeedback(studentId: string, exceptLesson: string): Promise<string | null> {
  const { data } = await createClient()
    .from("office_hours_notes")
    .select("lesson_id, comment, lessons!inner(lesson_date)")
    .eq("student_id", studentId)
    .neq("lesson_id", exceptLesson)
    .neq("comment", "");
  const dates = ((data as unknown as { lessons: { lesson_date: string } }[] | null) ?? []).map((r) => r.lessons.lesson_date).sort();
  return dates.at(-1) ?? null;
}

let resultsCache: Promise<ResultsData> | null = null;

export async function loadStudentDigest(studentId: string, lastFeedback: string | null, results?: ResultsData): Promise<Digest> {
  const today = isoDate(new Date());
  const since = lastFeedback ?? addDays(today, -30);
  const supabase = createClient();
  if (!results) {
    resultsCache ??= loadResults().catch((err) => {
      resultsCache = null;
      throw err;
    });
  }
  const [res, marks, enr, attempts, oh, official] = await Promise.all([
    results ? Promise.resolve(results) : (resultsCache as Promise<ResultsData>),
    supabase
      .from("lesson_marks")
      .select("attendance, homework, activity, lessons!inner(lesson_date, kind, status)")
      .eq("student_id", studentId)
      .gte("lessons.lesson_date", since)
      .lte("lessons.lesson_date", today),
    supabase.from("enrollments").select("target_score, sat_date").eq("student_id", studentId).eq("course_id", "sat").is("ends_on", null).limit(1),
    supabase
      .from("test_attempts")
      .select("id, finished_at, score, max_score, online_tests(title)")
      .eq("student_id", studentId)
      .not("finished_at", "is", null)
      .gte("finished_at", `${since}T00:00:00`),
    supabase
      .from("office_hours_notes")
      .select("attended, comment, lessons!inner(lesson_date, title)")
      .eq("student_id", studentId)
      .gte("lessons.lesson_date", since),
    loadOfficial(studentId).catch(() => [] as OfficialResult[]),
  ]);

  type Mark = { attendance: string | null; homework: string | null; activity: string | null; lessons: { kind: string; status: string } };
  const ms = ((marks.data as unknown as Mark[]) ?? []).filter((m) => m.lessons.kind !== "office_hours" && m.lessons.status !== "cancelled");
  const withAtt = ms.filter((m) => m.attendance);
  const lessons = {
    total: withAtt.length,
    present: withAtt.filter((m) => m.attendance === "present").length,
    late: withAtt.filter((m) => m.attendance === "late").length,
    absent: withAtt.filter((m) => m.attendance === "absent").length,
    hwDone: ms.filter((m) => m.homework === "done").length,
    hwPartial: ms.filter((m) => m.homework === "partial").length,
    hwNone: ms.filter((m) => m.homework === "none").length,
    activeHigh: ms.filter((m) => m.activity === "high").length,
    activeLow: ms.filter((m) => m.activity === "low").length,
  };

  // Тесты на сайте: в каких темах ошибки
  type Att = { id: string; finished_at: string; score: number | null; max_score: number | null; online_tests: { title: string } | null };
  const atts = (attempts.data as unknown as Att[]) ?? [];
  const wrongByAttempt = new Map<string, string[]>();
  if (atts.length) {
    const { data } = await supabase
      .from("test_answers")
      .select("attempt_id, is_correct, test_questions(topic_label, topic_id)")
      .in("attempt_id", atts.map((a) => a.id))
      .eq("is_correct", false);
    const topicName = new Map(res.topics.map((t) => [t.id, t.name]));
    for (const r of (data as unknown as { attempt_id: string; test_questions: { topic_label: string; topic_id: string | null } | null }[]) ?? []) {
      const q = r.test_questions;
      const name = q ? (q.topic_id ? topicName.get(q.topic_id) : null) || q.topic_label || "" : "";
      if (!name) continue;
      const list = wrongByAttempt.get(r.attempt_id) ?? [];
      if (!list.includes(name)) list.push(name);
      wrongByAttempt.set(r.attempt_id, list);
    }
  }

  const practicesAll = studentPractices(studentId, res);
  const e = (enr.data as { target_score: number | null; sat_date: string | null }[] | null)?.[0];
  return {
    since,
    sinceFeedback: Boolean(lastFeedback),
    lessons,
    mocks: studentMocks(studentId, res).map((m) => ({
      title: m.mock.title,
      date: m.mock.mock_date,
      verbal: m.result.verbal ?? 0,
      math: m.result.math ?? 0,
      total: m.result.total ?? 0,
    })),
    official,
    target: e?.target_score ?? null,
    satDate: e?.sat_date ?? null,
    practices: practicesAll.filter((p) => p.date >= since),
    weak: weakTopics(practicesAll).filter((t) => t.pct < 80).slice(0, 3),
    tests: atts
      .map((a) => ({
        title: a.online_tests?.title ?? "Тест",
        date: isoDate(new Date(a.finished_at)),
        score: Number(a.score ?? 0),
        max: Number(a.max_score ?? 0),
        wrongTopics: wrongByAttempt.get(a.id) ?? [],
      }))
      .sort((x, y) => x.date.localeCompare(y.date)),
    oh: ((oh.data as unknown as { attended: boolean; comment: string; lessons: { lesson_date: string; title: string } }[]) ?? [])
      .map((n) => ({ date: n.lessons.lesson_date, title: n.lessons.title, attended: n.attended, comment: n.comment }))
      .sort((x, y) => x.date.localeCompare(y.date)),
  };
}

/** «24 ноября» — для текста родителям. */
function dayMonth(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function pct(a: number, b: number): number {
  return b > 0 ? Math.round((100 * a) / b) : 0;
}

/** Последний результат (мок или официальный SAT) и предыдущий — для динамики. */
export function lastScores(d: Digest): { last: { label: string; date: string; total: number; verbal: number; math: number } | null; prev: number | null } {
  const all = [
    ...d.mocks.map((m) => ({ label: `мок «${m.title}»`, date: m.date, total: m.total, verbal: m.verbal, math: m.math })),
    ...d.official.map((o) => ({ label: "официальный SAT", date: o.exam_date, total: o.total, verbal: o.verbal, math: o.math })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return { last: all.at(-1) ?? null, prev: all.length > 1 ? all[all.length - 2].total : null };
}

/** Черновик обратной связи для ученика и родителя — учитель дописывает своими словами. */
export function familyDraft(firstName: string, d: Digest): string {
  const lines: string[] = [];
  const L = d.lessons;
  lines.push(`${firstName}: итоги ${d.sinceFeedback ? `с ${dayMonth(d.since)}` : "за последний месяц"}.`);
  if (L.total) {
    const att = `${L.present + L.late} из ${L.total} занятий`;
    const extra = [L.absent ? `пропусков: ${L.absent}` : "", L.late ? `опозданий: ${L.late}` : ""].filter(Boolean).join(", ");
    lines.push(`— Посещаемость: ${att}${extra ? ` (${extra})` : ""}.`);
  }
  const hwTotal = L.hwDone + L.hwPartial + L.hwNone;
  if (hwTotal) {
    lines.push(
      `— Домашние задания: выполнено полностью ${L.hwDone} из ${hwTotal}${L.hwPartial ? `, частично ${L.hwPartial}` : ""}${L.hwNone ? `, не сделано ${L.hwNone}` : ""}.`,
    );
  }
  const { last, prev } = lastScores(d);
  if (last) {
    const delta = prev !== null ? last.total - prev : null;
    lines.push(
      `— Последний результат: ${last.label} (${dayMonth(last.date)}) — ${last.total} (Verbal ${last.verbal}, Math ${last.math})${delta ? `, ${delta > 0 ? "+" : ""}${delta} к предыдущему` : ""}.`,
    );
    if (d.target) lines.push(last.total >= d.target ? `— Цель ${d.target} достигнута.` : `— До цели ${d.target} осталось ${d.target - last.total} баллов.`);
  }
  for (const t of d.tests) {
    lines.push(`— Тест «${t.title}»: ${t.score}/${t.max} (${pct(t.score, t.max)}%)${t.wrongTopics.length ? `, ошибки в темах: ${t.wrongTopics.slice(0, 3).join(", ")}` : ""}.`);
  }
  if (d.weak.length) lines.push(`— Стоит подтянуть: ${d.weak.map((w) => `${w.name} (${w.pct}%)`).join(", ")}.`);
  const came = d.oh.filter((o) => o.attended).length;
  if (came) lines.push(`— Приходил(а) на office hours: ${came} раз.`);
  lines.push("", "Комментарий учителя: ");
  return lines.join("\n");
}

/** Черновик заметки по office hours (видят только сотрудники). */
export function ohDraft(d: Digest): string {
  const { last } = lastScores(d);
  const parts = [
    "Разобрали: ",
    d.weak.length ? `Слабые темы сейчас: ${d.weak.map((w) => `${w.name} ${w.pct}%`).join(", ")}.` : "",
    last ? `Последний результат: ${last.total} (${last.label}).` : "",
    d.lessons.total ? `Посещаемость с ${dayMonth(d.since)}: ${d.lessons.present + d.lessons.late}/${d.lessons.total}.` : "",
  ];
  return parts.filter(Boolean).join("\n");
}
