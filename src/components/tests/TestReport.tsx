"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import type { GroupsData } from "@/lib/groups";
import type { TopicRow } from "@/lib/results";
import { deleteAttempt, rescoreTest, scaled, transferToMock, type AnswerRow, type AttemptRow, type TestFull } from "@/lib/tests";

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

function pct(a: number, b: number): number {
  return b > 0 ? Math.round((100 * a) / b) : 0;
}

function tone(p: number): string {
  return p < 50 ? "bg-burgundy/80" : p < 80 ? "bg-gold" : "bg-emerald-500";
}

function toneText(p: number): string {
  return p < 50 ? "text-burgundy" : p < 80 ? "text-gold" : "text-emerald-300";
}

/** Отчёт по тесту: ученики, темы (у кого проблемы), отдельные вопросы. */
export function TestReport({
  full,
  groups,
  topics,
  attempts,
  answers,
  canEditGroup,
  canEdit,
  run,
}: {
  full: TestFull;
  groups: GroupsData;
  topics: TopicRow[];
  attempts: AttemptRow[];
  answers: AnswerRow[];
  canEditGroup: (groupId: string) => boolean;
  canEdit: boolean;
  run: Run;
}) {
  const [groupId, setGroupId] = useState<string>("all");
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [view, setView] = useState<"students" | "topics" | "questions">("topics");

  const assignmentGroup = useMemo(() => new Map(full.assignments.map((a) => [a.id, a.group_id])), [full.assignments]);
  const groupName = (id: string) => groups.groups.find((g) => g.id === id)?.name ?? "группа";
  const nameOf = useMemo(() => new Map(groups.roster.map((r) => [r.student_id, r.full_name])), [groups.roster]);
  const qById = useMemo(() => new Map(full.questions.map((q) => [q.id, q])), [full.questions]);
  const secById = useMemo(() => new Map(full.sections.map((s) => [s.id, s])), [full.sections]);
  const topicOf = (qid: string) => {
    const q = qById.get(qid);
    if (!q) return "—";
    return q.topic_id ? (topics.find((t) => t.id === q.topic_id)?.name ?? "Без темы") : q.topic_label || "Без темы";
  };

  const groupIds = full.assignments.map((a) => a.group_id);
  const inScope = (gid: string | undefined) => groupId === "all" || gid === groupId;
  const scopeAttempts = attempts.filter((a) => inScope(assignmentGroup.get(a.assignment_id)));
  const finished = scopeAttempts.filter((a) => a.finished_at);
  const finishedIds = new Set(finished.map((a) => a.id));
  const scopeAnswers = answers.filter((x) => finishedIds.has(x.attempt_id));
  const roster = groups.roster.filter((r) => r.group_id && groupIds.includes(r.group_id) && inScope(r.group_id));
  const attemptOf = new Map(scopeAttempts.map((a) => [a.student_id, a]));
  const students = Array.from(new Set([...roster.map((r) => r.student_id), ...scopeAttempts.map((a) => a.student_id)]));

  // По темам
  const byTopic = (() => {
    const m = new Map<string, { correct: number; total: number; perStudent: Map<string, { c: number; t: number }>; section: string }>();
    for (const a of scopeAnswers) {
      const t = topicOf(a.question_id);
      const q = qById.get(a.question_id);
      const sec = q ? (secById.get(q.section_id)?.section ?? "") : "";
      const att = finished.find((x) => x.id === a.attempt_id);
      if (!att) continue;
      const row = m.get(t) ?? { correct: 0, total: 0, perStudent: new Map(), section: sec };
      row.total += 1;
      if (a.is_correct) row.correct += 1;
      const ps = row.perStudent.get(att.student_id) ?? { c: 0, t: 0 };
      ps.t += 1;
      if (a.is_correct) ps.c += 1;
      row.perStudent.set(att.student_id, ps);
      m.set(t, row);
    }
    return Array.from(m.entries())
      .map(([topic, r]) => ({ topic, ...r, pct: pct(r.correct, r.total), weak: Array.from(r.perStudent.entries()).filter(([, v]) => v.c / v.t < 0.5).map(([sid]) => sid) }))
      .sort((a, b) => a.pct - b.pct);
  })();

  // По вопросам
  const byQuestion = full.sections.flatMap((s) =>
    full.questions
      .filter((q) => q.section_id === s.id)
      .sort((a, b) => a.position - b.position)
      .map((q) => {
        const list = scopeAnswers.filter((a) => a.question_id === q.id);
        const right = list.filter((a) => a.is_correct).length;
        const wrong = new Map<string, number>();
        list.filter((a) => !a.is_correct && a.answer).forEach((a) => wrong.set(a.answer.toUpperCase(), (wrong.get(a.answer.toUpperCase()) ?? 0) + 1));
        const top = Array.from(wrong.entries()).sort((a, b) => b[1] - a[1])[0];
        return { q, s, total: list.length, right, empty: list.filter((a) => !a.answer).length, top };
      }),
  );

  // По ученикам: баллы по модулям, слабые темы
  const sectionScore = (attemptId: string, sectionId: string) => {
    const qs = full.questions.filter((q) => q.section_id === sectionId);
    const got = scopeAnswers.filter((a) => a.attempt_id === attemptId && qs.some((q) => q.id === a.question_id)).reduce((s, a) => s + Number(a.points_awarded ?? 0), 0);
    return { got, max: qs.reduce((s, q) => s + q.points, 0) };
  };
  const sectionPct = (attemptId: string, kind: "verbal" | "math"): number | null => {
    const secs = full.sections.filter((s) => s.section === kind);
    if (!secs.length) return null;
    let got = 0;
    let max = 0;
    secs.forEach((s) => {
      const r = sectionScore(attemptId, s.id);
      got += r.got;
      max += r.max;
    });
    return max > 0 ? got / max : null;
  };
  const weakOf = (sid: string) => byTopic.filter((t) => t.weak.includes(sid)).map((t) => t.topic);

  const avg = finished.length ? Math.round(finished.reduce((s, a) => s + pct(a.score ?? 0, a.max_score ?? 0), 0) / finished.length) : null;
  const hasBoth = full.sections.some((s) => s.section === "verbal") && full.sections.some((s) => s.section === "math");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Группа" className="!w-56">
          <option value="all">Все группы</option>
          {groupIds.map((g) => (
            <option key={g} value={g}>
              {groupName(g)}
            </option>
          ))}
        </Select>
        <p className="text-sm text-muted">
          Завершили <span className="text-navy">{finished.length}</span> из {students.length}
          {avg !== null ? (
            <>
              {" "}
              · средний результат <span className="text-navy">{avg}%</span>
            </>
          ) : null}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {canEdit && finished.length ? (
            <Button type="button" variant="ghost" onClick={() => void run(async () => rescoreTest(full.test.id), "Результаты пересчитаны по текущему ключу")}>
              Пересчитать
            </Button>
          ) : null}
          {hasBoth && finished.length && groupId !== "all" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const g = groups.groups.find((x) => x.id === groupId);
                if (!window.confirm(`Создать пробный экзамен «${full.test.title} (онлайн)» и перенести баллы ${finished.length} учеников группы ${g?.name}? Шкала 200–800 примерная — по доле баллов.`)) return;
                void run(
                  () =>
                    transferToMock({
                      title: `${full.test.title} (онлайн)`,
                      date: new Date().toISOString().slice(0, 10),
                      streamId: g?.stream_id ?? null,
                      rows: finished.map((a) => ({ studentId: a.student_id, verbalPct: sectionPct(a.id, "verbal"), mathPct: sectionPct(a.id, "math") })),
                    }),
                  "Баллы перенесены в «Результаты → Пробные экзамены»",
                );
              }}
            >
              Перенести в моки
            </Button>
          ) : null}
        </div>
      </div>

      <div role="tablist" className="flex w-fit rounded-full border border-white/10 p-1 text-sm">
        {(
          [
            ["topics", "По темам"],
            ["students", "По ученикам"],
            ["questions", "По вопросам"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-full px-4 py-1.5 ${view === k ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"}`}>
            {label}
          </button>
        ))}
      </div>

      {!finished.length ? (
        <p className="rounded-3xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted">Пока никто не завершил тест.</p>
      ) : view === "topics" ? (
        <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
          <h3 className="text-lg text-navy">Темы — от самой проблемной</h3>
          <p className="mt-1 text-sm text-muted">Доля верных ответов группы. Нажмите на тему — кто из учеников набрал по ней меньше 50%.</p>
          <ul className="mt-3 space-y-1.5">
            {byTopic.map((t) => (
              <li key={t.topic} className="rounded-2xl border border-white/10">
                <button type="button" aria-expanded={openTopic === t.topic} onClick={() => setOpenTopic(openTopic === t.topic ? null : t.topic)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm">
                  <span className="min-w-0 flex-1 truncate text-navy">
                    {t.topic} <span className="text-xs text-muted">· {t.section === "math" ? "Math" : "Verbal"}</span>
                  </span>
                  <span className="h-1.5 w-32 rounded-full bg-navy/10">
                    <span className={`block h-1.5 rounded-full ${tone(t.pct)}`} style={{ width: `${t.pct}%` }} />
                  </span>
                  <span className={`w-12 text-right font-semibold ${toneText(t.pct)}`}>{t.pct}%</span>
                  <span className="w-28 text-right text-xs text-muted">{t.weak.length ? `слабо у ${t.weak.length}` : "у всех ок"}</span>
                </button>
                {openTopic === t.topic ? (
                  <div className="border-t border-white/[0.07] px-3 py-2 text-sm">
                    {t.weak.length ? (
                      <p className="text-navy">Меньше 50%: {t.weak.map((sid) => nameOf.get(sid) ?? "ученик").join(", ")}</p>
                    ) : (
                      <p className="text-muted">Все справились хотя бы наполовину.</p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      Верных ответов {t.correct} из {t.total}
                    </p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : view === "students" ? (
        <section className="sp-glass overflow-x-auto rounded-3xl border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] text-left text-xs uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-2.5 font-normal">Ученик</th>
                <th className="px-3 py-2.5 font-normal">Итог</th>
                {full.sections.map((s) => (
                  <th key={s.id} className="px-3 py-2.5 font-normal">
                    {s.title.replace(/—.*$/, "").trim() || `Модуль ${s.position}`}
                  </th>
                ))}
                {hasBoth ? <th className="px-3 py-2.5 font-normal">≈ SAT</th> : null}
                <th className="px-3 py-2.5 font-normal">Слабые темы</th>
                <th className="px-3 py-2.5 font-normal" />
              </tr>
            </thead>
            <tbody>
              {students
                .map((sid) => ({ sid, a: attemptOf.get(sid) }))
                .sort((x, y) => (y.a?.score ?? -1) / (y.a?.max_score || 1) - (x.a?.score ?? -1) / (x.a?.max_score || 1))
                .map(({ sid, a }) => {
                  const p = a?.finished_at ? pct(a.score ?? 0, a.max_score ?? 0) : null;
                  const gid = a ? assignmentGroup.get(a.assignment_id) : groups.roster.find((r) => r.student_id === sid)?.group_id;
                  return (
                    <tr key={sid} className="border-b border-white/[0.04]">
                      <td className="px-4 py-2.5 text-navy">
                        {nameOf.get(sid) ?? "Ученик"}
                        {a && a.tab_switches > 0 ? <span className="block text-xs text-gold">уходил со страницы: {a.tab_switches}</span> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        {a?.finished_at ? (
                          <span className={`font-semibold ${toneText(p ?? 0)}`}>
                            {a.score}/{a.max_score} · {p}%
                          </span>
                        ) : a ? (
                          <span className="text-xs text-gold">проходит</span>
                        ) : (
                          <span className="text-xs text-muted">не начинал</span>
                        )}
                      </td>
                      {full.sections.map((s) => {
                        if (!a?.finished_at) return <td key={s.id} className="px-3 py-2.5 text-muted">—</td>;
                        const r = sectionScore(a.id, s.id);
                        return (
                          <td key={s.id} className="px-3 py-2.5 text-navy">
                            {r.got}/{r.max}
                          </td>
                        );
                      })}
                      {hasBoth ? (
                        <td className="px-3 py-2.5 text-navy">
                          {a?.finished_at ? `${scaled(sectionPct(a.id, "verbal") ?? 0) + scaled(sectionPct(a.id, "math") ?? 0)}` : "—"}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 text-xs text-navy">{a?.finished_at ? weakOf(sid).slice(0, 3).join(", ") || "—" : ""}</td>
                      <td className="px-3 py-2.5 text-right">
                        {a && gid && canEditGroup(gid) ? (
                          <button
                            type="button"
                            className="text-xs text-burgundy hover:underline"
                            onClick={() => {
                              if (window.confirm(`Сбросить попытку ${nameOf.get(sid) ?? "ученика"}? Ответы удалятся, ученик сможет пройти заново.`)) void run(() => deleteAttempt(a.id), "Попытка сброшена");
                            }}
                          >
                            сбросить
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {hasBoth ? <p className="px-4 pb-3 pt-1 text-xs text-muted">≈ SAT — примерный балл: каждый раздел 200–800 по доле набранных баллов.</p> : null}
        </section>
      ) : (
        <section className="sp-glass overflow-x-auto rounded-3xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] text-left text-xs uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-2.5 font-normal">Вопрос</th>
                <th className="px-3 py-2.5 font-normal">Тема</th>
                <th className="px-3 py-2.5 font-normal">Верно</th>
                <th className="px-3 py-2.5 font-normal">Частый неверный</th>
                <th className="px-3 py-2.5 font-normal">Без ответа</th>
              </tr>
            </thead>
            <tbody>
              {byQuestion.map(({ q, s, total, right, empty, top }) => {
                const p = pct(right, total);
                return (
                  <tr key={q.id} className="border-b border-white/[0.04]">
                    <td className="px-4 py-2 text-navy">
                      {s.section === "math" ? "Math" : "Verbal"} · {s.position}.{q.position}
                      <span className="block max-w-xs truncate text-xs text-muted">{(q.stem || q.passage).slice(0, 80)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-navy">{topicOf(q.id)}</td>
                    <td className={`px-3 py-2 font-semibold ${toneText(p)}`}>{total ? `${p}% (${right}/${total})` : "—"}</td>
                    <td className="px-3 py-2 text-xs text-navy">{top ? `${top[0]} — ${top[1]} уч.` : "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted">{empty || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
