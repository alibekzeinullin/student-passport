"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MathText } from "@/components/tests/MathText";
import { loadAttemptResult, type AttemptResult } from "@/lib/tests";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function pctOf(a: number, b: number): number {
  return b > 0 ? Math.round((100 * a) / b) : 0;
}

function tone(p: number): string {
  return p < 50 ? "bg-burgundy/80" : p < 80 ? "bg-gold" : "bg-emerald-500";
}

/** Результат теста для ученика: баллы, модули, темы; разбор — если учитель его открыл. */
export function TestResultView({ attemptId }: { attemptId: string }) {
  const [r, setR] = useState<AttemptResult | null>(null);
  const [error, setError] = useState("");
  const [onlyWrong, setOnlyWrong] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadAttemptResult(attemptId)
      .then((x) => {
        if (!cancelled) setR(x);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (error) return <p className="px-4 py-16 text-center text-burgundy">{error}</p>;
  if (!r) return <p className="px-4 py-16 text-center text-muted">Считаем результат…</p>;
  const p = pctOf(Number(r.score), Number(r.max_score));
  const weak = r.topics.filter((t) => Number(t.pct) < 80);
  const shown = r.questions.filter((q) => !onlyWrong || !q.is_correct);

  return (
    <div className="sp-rise mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/dashboard" className="text-sm text-muted hover:text-navy">
        ← В кабинет
      </Link>
      <section className="sp-glass rounded-3xl border px-6 py-6">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Тест завершён</p>
        <h2 className="mt-1 text-2xl font-light text-navy">{r.test_title}</h2>
        <p className="mt-3 flex items-baseline gap-3">
          <span className="text-5xl font-light text-gold">{Number(r.score)}</span>
          <span className="text-navy">из {Number(r.max_score)} баллов · {p}%</span>
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {r.sections.map((s, i) => (
            <div key={i} className="rounded-2xl border border-navy/10 px-4 py-3">
              <p className="text-sm text-navy">{s.title}</p>
              <p className="text-xs text-muted">
                {Number(s.score)} из {Number(s.max)} · {pctOf(Number(s.score), Number(s.max))}%
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="sp-glass rounded-3xl border px-6 py-6">
        <h3 className="text-lg text-navy">По темам</h3>
        <p className="mt-1 text-sm text-muted">{weak.length ? `Над чем поработать: ${weak.slice(0, 3).map((t) => t.topic).join(", ")}.` : "Все темы — 80% и выше. Отлично!"}</p>
        <ul className="mt-3 space-y-2">
          {r.topics.map((t) => {
            const tp = Number(t.pct);
            return (
              <li key={`${t.section}-${t.topic}`} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-navy">
                  {t.topic} <span className="text-xs text-muted">· {t.section === "math" ? "Math" : "Verbal"}</span>
                </span>
                <span className="h-1.5 w-32 rounded-full bg-navy/10">
                  <span className={`block h-1.5 rounded-full ${tone(tp)}`} style={{ width: `${tp}%` }} />
                </span>
                <span className="w-24 text-right text-navy">
                  {t.correct}/{t.total} · {tp}%
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="sp-glass rounded-3xl border px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg text-navy">Разбор</h3>
          {r.review_open ? (
            <label className="flex items-center gap-2 text-sm text-navy">
              <input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} /> только ошибки
            </label>
          ) : null}
        </div>
        {!r.review_open ? (
          <>
            <p className="mt-1 text-sm text-muted">Правильные ответы учитель откроет после того, как тест пройдёт вся группа. Пока видно, где были ошибки.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.questions.map((q, i) => (
                <span
                  key={i}
                  title={`${q.section_title}, вопрос ${q.position}: ${q.is_correct ? "верно" : q.answer ? "неверно" : "без ответа"}${q.topic ? ` · ${q.topic}` : ""}`}
                  className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-semibold text-white ${q.is_correct ? "bg-emerald-500" : q.answer ? "bg-burgundy/80" : "bg-navy/30"}`}
                >
                  {q.position}
                </span>
              ))}
            </div>
          </>
        ) : (
          <ul className="mt-3 space-y-3">
            {shown.map((q, i) => (
              <li key={i} className={`rounded-2xl border px-4 py-3 ${q.is_correct ? "border-emerald-500/30" : "border-burgundy/30"}`}>
                <p className="text-xs text-muted">
                  {q.section_title} · вопрос {q.position} · {q.topic || "без темы"} ·{" "}
                  <span className={q.is_correct ? "text-emerald-300" : "text-burgundy"}>{q.is_correct ? "верно" : q.answer ? "неверно" : "без ответа"}</span>
                </p>
                {q.passage ? <MathText text={q.passage} className="mt-2 block text-sm text-muted" /> : null}
                {q.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.image} alt="" className="mt-2 max-h-56 rounded-lg" />
                ) : null}
                {q.stem ? <MathText text={q.stem} className="mt-2 block text-navy" /> : null}
                {q.kind === "choice" && q.options ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {q.options.map((o, k) => {
                      const L = LETTERS[k];
                      const right = L === q.correct_answer?.toUpperCase();
                      const mine = L === q.answer.toUpperCase();
                      return (
                        <li key={k} className={`flex gap-2 rounded-lg px-2 py-1 ${right ? "bg-emerald-500/10" : mine ? "bg-burgundy/10" : ""}`}>
                          <span className="font-semibold">{L})</span>
                          <MathText text={o} className="text-navy" />
                          {right ? <span className="ml-auto text-xs text-emerald-300">верный</span> : mine ? <span className="ml-auto text-xs text-burgundy">ваш</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-navy">
                    Ваш ответ: <span className="font-mono">{q.answer || "—"}</span> · верный: <span className="font-mono">{q.correct_answer}</span>
                  </p>
                )}
              </li>
            ))}
            {!shown.length ? <p className="text-sm text-muted">Ошибок нет 🎉</p> : null}
          </ul>
        )}
      </section>
    </div>
  );
}
