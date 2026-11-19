"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { MathText } from "@/components/tests/MathText";
import { DesmosPanel } from "@/components/tests/DesmosPanel";
import { TestResultView } from "@/components/tests/TestResultView";
import { useSatTheme } from "@/lib/sat-theme";
import { loadAttemptState, nextTestSection, noteTabSwitch, saveTestAnswer, type RunState } from "@/lib/tests";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function mmss(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function TestRunPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  return (
    <RequireAuth role="student">
      <Runner attemptId={attemptId} />
    </RequireAuth>
  );
}

function Runner({ attemptId }: { attemptId: string }) {
  useSatTheme(true);
  const [state, setState] = useState<RunState | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { answer: string; flagged: boolean }>>({});
  const [left, setLeft] = useState(0);
  const [review, setReview] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [pending, setPending] = useState<Record<string, { answer: string; flagged: boolean }>>({});
  const [notice, setNotice] = useState("");
  const [calcOpen, setCalcOpen] = useState(false);
  const deadline = useRef(0);
  const typing = useRef<Record<string, number>>({});
  const sectionRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await loadAttemptState(attemptId);
      setState(s);
      if (!s.finished && s.current) {
        if (sectionRef.current !== null && sectionRef.current !== s.current.position) {
          setNotice(`Начался следующий модуль: ${s.current.title}`);
          setIndex(0);
          setReview(false);
        }
        sectionRef.current = s.current.position;
        deadline.current = Date.now() + s.current.seconds_left * 1000;
        setLeft(s.current.seconds_left);
        setAnswers(s.answers ?? {});
      }
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [attemptId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  // Таймер: считаем от срока, который дал сервер; на нуле спрашиваем сервер — он переключит модуль сам
  useEffect(() => {
    if (!state || state.finished) return;
    const t = window.setInterval(() => {
      const sec = Math.round((deadline.current - Date.now()) / 1000);
      setLeft(sec);
      if (sec <= -2) void refresh();
    }, 1000);
    return () => window.clearInterval(t);
  }, [state, refresh]);

  // Уход со страницы — отмечаем (учитель увидит число)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && state && !state.finished) void noteTabSwitch(attemptId);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [attemptId, state]);

  // Несохранённые ответы (пропала связь) — пробуем снова каждые 3 секунды
  useEffect(() => {
    const ids = Object.keys(pending);
    if (!ids.length) return;
    const t = window.setTimeout(async () => {
      for (const id of ids) {
        try {
          await saveTestAnswer(attemptId, id, pending[id].answer, pending[id].flagged);
          setPending((p) => {
            const n = { ...p };
            delete n[id];
            return n;
          });
        } catch {
          break;
        }
      }
    }, 3000);
    return () => window.clearTimeout(t);
  }, [pending, attemptId]);

  const save = async (qid: string, patch: Partial<{ answer: string; flagged: boolean }>) => {
    const next = { answer: answers[qid]?.answer ?? "", flagged: answers[qid]?.flagged ?? false, ...patch };
    setAnswers((a) => ({ ...a, [qid]: next }));
    try {
      const ok = await saveTestAnswer(attemptId, qid, next.answer, next.flagged);
      if (!ok) {
        setNotice("Время модуля вышло — ответы сохранены, переходим дальше.");
        await refresh();
      }
    } catch {
      setPending((p) => ({ ...p, [qid]: next }));
    }
  };

  const finishSection = async () => {
    if (Object.keys(pending).length) {
      setNotice("Подождите: сохраняем последние ответы…");
      return;
    }
    try {
      await nextTestSection(attemptId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (error && !state) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-burgundy">{error}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-gold underline">
          В кабинет
        </Link>
      </div>
    );
  }
  if (!state) return <p className="px-4 py-16 text-center text-muted">Загрузка теста…</p>;
  if (state.finished) return <TestResultView attemptId={attemptId} />;

  const qs = state.questions ?? [];
  const cur = state.current!;
  const q = qs[Math.min(index, qs.length - 1)];
  const answered = qs.filter((x) => answers[x.id]?.answer).length;
  const isLastSection = (state.sections ?? []).every((s) => s.position <= cur.position);
  const low = left <= 300;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
      {/* Верхняя панель */}
      <header className="flex flex-wrap items-center gap-3 border-b border-navy/10 bg-white px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{state.test_title}</p>
          <p className="truncate font-semibold text-navy">{cur.title}</p>
        </div>
        <div className={`rounded-full px-4 py-1.5 font-mono text-lg font-semibold tabular-nums ${low ? "bg-burgundy/10 text-burgundy" : "bg-navy/5 text-navy"}`} role="timer" aria-label="Осталось времени">
          {mmss(left)}
        </div>
        {cur.calculator ? (
          <Button type="button" variant="secondary" onClick={() => setCalcOpen((v) => !v)}>
            {calcOpen ? "Скрыть Desmos" : "Калькулятор Desmos"}
          </Button>
        ) : null}
      </header>
      {notice ? (
        <div className="flex items-center justify-between gap-3 bg-gold/10 px-4 py-2 text-sm text-navy sm:px-6">
          {notice}
          <button type="button" className="text-xs text-muted" onClick={() => setNotice("")}>
            ✕
          </button>
        </div>
      ) : null}
      {Object.keys(pending).length ? <div className="bg-burgundy/10 px-4 py-1.5 text-xs text-burgundy sm:px-6">Нет связи — ответ сохранится, как только интернет вернётся. Не закрывайте страницу.</div> : null}

      {/* Вопрос или обзор модуля */}
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto">
          {review || !q ? (
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
              <h2 className="text-2xl font-light text-navy">Проверьте модуль</h2>
              <p className="mt-1 text-sm text-muted">
                Отвечено {answered} из {qs.length}. Нажмите на номер, чтобы вернуться к вопросу.
              </p>
              <QuestionGrid qs={qs} answers={answers} current={-1} onPick={(i) => { setIndex(i); setReview(false); }} />
              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    const empty = qs.length - answered;
                    if (!window.confirm(`${empty ? `Без ответа: ${empty}. ` : ""}${isLastSection ? "Завершить тест?" : "Перейти к следующему модулю? Вернуться к этому будет нельзя."}`)) return;
                    void finishSection();
                  }}
                >
                  {isLastSection ? "Завершить тест" : "Следующий модуль →"}
                </Button>
                {q ? (
                  <Button type="button" variant="ghost" onClick={() => setReview(false)}>
                    К вопросам
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={`mx-auto grid gap-6 px-4 py-6 sm:px-6 ${q.passage ? "max-w-6xl lg:grid-cols-2" : "max-w-3xl"}`}>
              {q.passage ? (
                <article className="rounded-2xl bg-white px-5 py-4 leading-relaxed text-navy shadow-sm lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
                  <MathText text={q.passage} />
                </article>
              ) : null}
              <section>
                <div className="flex items-center justify-between gap-3 border-b border-navy/10 pb-2">
                  <span className="rounded bg-navy px-2.5 py-0.5 text-sm font-semibold text-white">{q.position}</span>
                  <button
                    type="button"
                    aria-pressed={answers[q.id]?.flagged ?? false}
                    onClick={() => void save(q.id, { flagged: !(answers[q.id]?.flagged ?? false) })}
                    className={`text-sm ${answers[q.id]?.flagged ? "font-semibold text-burgundy" : "text-muted hover:text-navy"}`}
                  >
                    {answers[q.id]?.flagged ? "⚑ Отмечен для проверки" : "⚐ Отметить для проверки"}
                  </button>
                </div>
                {q.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.image} alt="Иллюстрация к вопросу" className="mt-4 max-h-80 rounded-lg" />
                ) : null}
                <MathText text={q.stem} className="mt-4 block text-lg leading-relaxed text-navy" />
                {q.kind === "choice" ? (
                  <div className="mt-5 space-y-2" role="radiogroup" aria-label={`Вопрос ${q.position}`}>
                    {q.options.map((o, i) => {
                      const sel = answers[q.id]?.answer === LETTERS[i];
                      return (
                        <button
                          key={i}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          onClick={() => void save(q.id, { answer: sel ? "" : LETTERS[i] })}
                          className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition ${sel ? "border-[#4f6bd8] bg-[#4f6bd8]/[0.07]" : "border-navy/15 bg-white hover:border-navy/40"}`}
                        >
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold ${sel ? "border-[#4f6bd8] bg-[#4f6bd8] text-white" : "border-navy/40 text-navy"}`}>{LETTERS[i]}</span>
                          <MathText text={o} className="pt-0.5 text-navy" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-5">
                    <label htmlFor={`ans-${q.id}`} className="text-sm text-muted">
                      Ваш ответ (число, дробь вида 3/4 или десятичная)
                    </label>
                    <input
                      id={`ans-${q.id}`}
                      key={q.id}
                      defaultValue={answers[q.id]?.answer ?? ""}
                      maxLength={12}
                      inputMode="decimal"
                      onChange={(e) => {
                        // сохраняем, пока ученик печатает (через полсекунды тишины) — на случай, если время выйдет
                        const value = e.target.value.trim();
                        window.clearTimeout(typing.current[q.id]);
                        typing.current[q.id] = window.setTimeout(() => void save(q.id, { answer: value }), 500);
                      }}
                      onBlur={(e) => {
                        window.clearTimeout(typing.current[q.id]);
                        if (e.target.value.trim() !== (answers[q.id]?.answer ?? "")) void save(q.id, { answer: e.target.value.trim() });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="mt-1 block w-48 rounded-xl border-2 border-navy/20 bg-white px-4 py-2.5 font-mono text-lg text-navy outline-none focus:border-[#4f6bd8]"
                    />
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
        {calcOpen && cur.calculator ? <DesmosPanel onClose={() => setCalcOpen(false)} /> : null}
      </div>

      {/* Нижняя панель */}
      <footer className="relative flex items-center justify-between gap-3 border-t border-navy/10 bg-white px-4 py-2.5 sm:px-6">
        <Button type="button" variant="ghost" disabled={review || index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          ← Назад
        </Button>
        <button type="button" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen} className="rounded-full bg-navy px-4 py-1.5 text-sm font-semibold text-white">
          {review ? "Обзор модуля" : `Вопрос ${index + 1} из ${qs.length}`} ▾
        </button>
        {review ? (
          <span className="w-24" />
        ) : index < qs.length - 1 ? (
          <Button type="button" onClick={() => setIndex((i) => i + 1)}>
            Далее →
          </Button>
        ) : (
          <Button type="button" onClick={() => setReview(true)}>
            К обзору →
          </Button>
        )}
        {navOpen ? (
          <div className="absolute bottom-full left-1/2 mb-2 w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border border-navy/10 bg-white p-4 shadow-xl">
            <QuestionGrid
              qs={qs}
              answers={answers}
              current={review ? -1 : index}
              onPick={(i) => {
                setIndex(i);
                setReview(false);
                setNavOpen(false);
              }}
            />
            <button type="button" className="mt-3 text-sm text-gold hover:underline" onClick={() => { setReview(true); setNavOpen(false); }}>
              Обзор модуля и завершение →
            </button>
          </div>
        ) : null}
      </footer>
    </div>
  );
}

function QuestionGrid({
  qs,
  answers,
  current,
  onPick,
}: {
  qs: { id: string; position: number }[];
  answers: Record<string, { answer: string; flagged: boolean }>;
  current: number;
  onPick: (i: number) => void;
}) {
  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-2">
        {qs.map((x, i) => {
          const a = answers[x.id];
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => onPick(i)}
              aria-label={`Вопрос ${x.position}${a?.answer ? ", отвечен" : ", без ответа"}${a?.flagged ? ", отмечен" : ""}`}
              className={`relative grid h-10 w-10 place-items-center rounded-lg border-2 text-sm font-semibold ${a?.answer ? "border-[#4f6bd8] bg-[#4f6bd8] text-white" : "border-dashed border-navy/30 text-navy"} ${i === current ? "ring-2 ring-gold ring-offset-2" : ""}`}
            >
              {x.position}
              {a?.flagged ? <span className="absolute -right-1 -top-1 text-xs text-burgundy">⚑</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span>
          <i className="mr-1 inline-block h-3 w-3 rounded bg-[#4f6bd8]" />
          отвечен
        </span>
        <span>
          <i className="mr-1 inline-block h-3 w-3 rounded border border-dashed border-navy/40" />
          без ответа
        </span>
        <span className="text-burgundy">⚑ отмечен для проверки</span>
      </p>
    </div>
  );
}
