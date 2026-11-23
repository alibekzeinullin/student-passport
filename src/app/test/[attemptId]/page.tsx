"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { MathText } from "@/components/tests/MathText";
import { DesmosPanel } from "@/components/tests/DesmosPanel";
import { Directions, ReferenceSheet } from "@/components/tests/ReferenceSheet";
import { useAuth } from "@/context/AuthContext";
import { TestResultView } from "@/components/tests/TestResultView";
import { useSatTheme } from "@/lib/sat-theme";
import { addQuestionTime, loadAttemptState, nextTestSection, noteTabSwitch, saveTestAnswer, type RunState } from "@/lib/tests";

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
  const [panel, setPanel] = useState<"directions" | "reference" | null>(null);
  const [timerHidden, setTimerHidden] = useState(false);
  const [fiveMin, setFiveMin] = useState(false);
  const [strikeMode, setStrikeMode] = useState(false);
  const [split, setSplit] = useState(50);
  const [wide, setWide] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Вычеркнутые варианты — только на этом устройстве, как пометки на черновике
  const [elim, setElim] = useState<Record<string, number[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(`sp-elim:${attemptId}`) ?? "{}") as Record<string, number[]>;
    } catch {
      return {};
    }
  });
  const { user } = useAuth();
  const splitBox = useRef<HTMLElement>(null);
  const dragging = useRef(false);
  const warnedFor = useRef<number | null>(null);
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

  useEffect(() => {
    try {
      localStorage.setItem(`sp-elim:${attemptId}`, JSON.stringify(elim));
    } catch {
      /* без сохранения */
    }
  }, [elim, attemptId]);

  // Перегородка текст/вопрос — только на широком экране
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // За 5 минут до конца модуля — предупреждение (один раз на модуль), таймер больше не скрыть
  const curPos = state?.current?.position ?? null;
  useEffect(() => {
    if (curPos === null || left > 300 || left <= 0 || warnedFor.current === curPos) return;
    warnedFor.current = curPos;
    setFiveMin(true);
    setTimerHidden(false);
  }, [left, curPos]);
  useEffect(() => {
    if (!fiveMin) return;
    const t = window.setTimeout(() => setFiveMin(false), 8000);
    return () => window.clearTimeout(t);
  }, [fiveMin]);

  // Время на вопросе: считаем, пока вопрос на экране и вкладка видна; отправляем при смене вопроса и каждые 15 секунд
  const activeQid =
    state && !state.finished && !review && state.questions?.length ? state.questions[Math.min(index, state.questions.length - 1)].id : null;
  const clock = useRef<{ qid: string | null; since: number | null }>({ qid: null, since: null });
  const flushTime = useCallback(() => {
    const c = clock.current;
    if (c.qid && c.since !== null) {
      void addQuestionTime(attemptId, c.qid, Date.now() - c.since).catch(() => undefined);
      c.since = Date.now();
    }
  }, [attemptId]);
  useEffect(() => {
    clock.current = { qid: activeQid, since: activeQid && document.visibilityState === "visible" ? Date.now() : null };
    const t = window.setInterval(flushTime, 15000);
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        flushTime();
        clock.current.since = null;
      } else if (clock.current.qid) clock.current.since = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      flushTime();
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [activeQid, flushTime]);

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
  const math = cur.section === "math";
  const struck = q ? (elim[q.id] ?? []) : [];
  const toggleStrike = (qid: string, i: number) =>
    setElim((e) => {
      const list = e[qid] ?? [];
      return { ...e, [qid]: list.includes(i) ? list.filter((x) => x !== i) : [...list, i] };
    });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
      {/* Верхняя панель — как в Bluebook: модуль и инструкция слева, таймер по центру, инструменты справа */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b-2 border-dashed border-navy/15 bg-white px-4 py-2 sm:px-6">
        <div className="min-w-0">
          <p className="truncate font-semibold text-navy">{cur.title}</p>
          <button type="button" onClick={() => setPanel((p) => (p === "directions" ? null : "directions"))} className="whitespace-nowrap text-sm text-muted hover:text-navy" aria-expanded={panel === "directions"}>
            Инструкция ▾
          </button>
        </div>
        <div className="flex flex-col items-center">
          {timerHidden && !low ? (
            <span className="h-7 text-2xl leading-7 text-navy/40" aria-label="Таймер скрыт">⏱</span>
          ) : (
            <span role="timer" aria-label="Осталось времени" className={`font-mono text-xl font-semibold tabular-nums ${low ? "text-burgundy" : "text-navy"}`}>
              {mmss(left)}
            </span>
          )}
          {low ? (
            <span className="text-xs text-burgundy">последние минуты</span>
          ) : (
            <button type="button" onClick={() => setTimerHidden((v) => !v)} className="rounded-full border border-navy/20 px-3 text-xs text-navy hover:bg-navy/5">
              {timerHidden ? "Показать" : "Скрыть"}
            </button>
          )}
        </div>
        <div className="flex items-center justify-end gap-1">
          {math && cur.calculator ? (
            <ToolButton active={calcOpen} onClick={() => setCalcOpen((v) => !v)} icon="🖩" label="Калькулятор" />
          ) : null}
          {math ? (
            <ToolButton active={panel === "reference"} onClick={() => setPanel((p) => (p === "reference" ? null : "reference"))} icon="ƒ" label="Справочник" />
          ) : null}
        </div>
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
      <div className="relative flex min-h-0 flex-1">
        {panel === "directions" ? <Directions section={cur.section} onClose={() => setPanel(null)} /> : null}
        {panel === "reference" ? <ReferenceSheet onClose={() => setPanel(null)} /> : null}
        {fiveMin ? (
          <div role="alert" className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-navy px-4 py-2.5 text-sm text-white shadow-xl">
            Осталось 5 минут в этом модуле.
            <button type="button" onClick={() => setFiveMin(false)} className="text-white/80 hover:text-white" aria-label="Закрыть">
              ✕
            </button>
          </div>
        ) : null}
        <main ref={splitBox} className="min-w-0 flex-1 overflow-y-auto">
          {review || !q ? (
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
              <h2 className="text-center text-2xl font-semibold text-navy">Проверьте свои ответы</h2>
              <p className="mt-2 text-center text-sm text-muted">
                Отвечено {answered} из {qs.length}. Нажмите на номер, чтобы вернуться к вопросу.
                {isLastSection ? "" : " После перехода к следующему модулю вернуться к этому будет нельзя."}
              </p>
              <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
                <p className="font-semibold text-navy">{cur.title}</p>
                <QuestionGrid qs={qs} answers={answers} current={-1} onPick={(i) => { setIndex(i); setReview(false); }} />
              </div>
            </div>
          ) : (
            <div className={q.passage ? "flex h-full flex-col lg:flex-row" : "mx-auto max-w-3xl px-4 py-6 sm:px-6"}>
              {q.passage ? (
                <>
                  <article
                    className="overflow-y-auto px-5 py-6 leading-relaxed text-navy sm:px-8 lg:h-full"
                    style={wide ? { width: `${split}%` } : undefined}
                  >
                    <MathText text={q.passage} className="text-[17px]" />
                  </article>
                  {/* Перегородку можно двигать мышью — как в Bluebook */}
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Ширина текста"
                    aria-valuenow={Math.round(split)}
                    tabIndex={0}
                    onPointerDown={(e) => {
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      dragging.current = true;
                    }}
                    onPointerMove={(e) => {
                      if (!dragging.current || !splitBox.current) return;
                      const r = splitBox.current.getBoundingClientRect();
                      setSplit(Math.min(75, Math.max(25, ((e.clientX - r.left) / r.width) * 100)));
                    }}
                    onPointerUp={() => (dragging.current = false)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft") setSplit((v) => Math.max(25, v - 5));
                      if (e.key === "ArrowRight") setSplit((v) => Math.min(75, v + 5));
                    }}
                    className="hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-navy/10 hover:bg-navy/20 lg:flex"
                  >
                    <span className="h-8 w-0.5 rounded bg-navy/40" />
                  </div>
                </>
              ) : null}
              <section className={q.passage ? "min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:h-full" : ""}>
                {/* Полоса вопроса: номер, отметка, вычёркивание */}
                <div className="flex items-center gap-3 rounded-md bg-navy/[0.06] pr-2">
                  <span className="rounded-l-md bg-navy px-3 py-1.5 text-sm font-semibold text-white">{q.position}</span>
                  <button
                    type="button"
                    aria-pressed={answers[q.id]?.flagged ?? false}
                    onClick={() => void save(q.id, { flagged: !(answers[q.id]?.flagged ?? false) })}
                    className={`flex items-center gap-1.5 text-sm ${answers[q.id]?.flagged ? "font-semibold text-burgundy" : "text-navy hover:underline"}`}
                  >
                    <span aria-hidden>{answers[q.id]?.flagged ? "🔖" : "🏷"}</span>
                    Отметить для проверки
                  </button>
                  {q.kind === "choice" ? (
                    <button
                      type="button"
                      aria-pressed={strikeMode}
                      title="Вычёркивание вариантов"
                      onClick={() => setStrikeMode((v) => !v)}
                      className={`ml-auto rounded px-2 py-0.5 text-sm font-semibold line-through decoration-2 ${strikeMode ? "bg-[#4f6bd8] text-white" : "border border-navy/30 text-navy hover:bg-navy/5"}`}
                    >
                      ABC
                    </button>
                  ) : null}
                </div>
                {q.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.image} alt="Иллюстрация к вопросу" className="mt-4 max-h-80 rounded-lg" />
                ) : null}
                <MathText text={q.stem} className="mt-4 block text-[17px] leading-relaxed text-navy" />
                {q.kind === "choice" ? (
                  <div className="mt-5 space-y-2.5" role="radiogroup" aria-label={`Вопрос ${q.position}`}>
                    {q.options.map((o, i) => {
                      const sel = answers[q.id]?.answer === LETTERS[i];
                      const out = struck.includes(i);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={sel}
                            onClick={() => {
                              if (out) toggleStrike(q.id, i); // выбор зачёркнутого варианта снимает зачёркивание
                              void save(q.id, { answer: sel ? "" : LETTERS[i] });
                            }}
                            className={`relative flex min-w-0 flex-1 items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition ${sel ? "border-[#4f6bd8] bg-white shadow-[0_0_0_1px_#4f6bd8]" : "border-navy/25 bg-white hover:border-navy/50"}`}
                          >
                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold ${sel ? "border-[#4f6bd8] bg-[#4f6bd8] text-white" : "border-navy/50 text-navy"}`}>{LETTERS[i]}</span>
                            <MathText text={o} className={`pt-0.5 text-navy ${out ? "opacity-40" : ""}`} />
                            {out ? <span aria-hidden className="pointer-events-none absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 bg-navy/70" /> : null}
                          </button>
                          {strikeMode ? (
                            out ? (
                              <button type="button" onClick={() => toggleStrike(q.id, i)} className="w-14 shrink-0 text-sm font-semibold text-navy underline">
                                Вернуть
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  toggleStrike(q.id, i);
                                  if (sel) void save(q.id, { answer: "" });
                                }}
                                aria-label={`Вычеркнуть вариант ${LETTERS[i]}`}
                                className="grid w-14 shrink-0 place-items-center"
                              >
                                <span className="relative grid h-6 w-6 place-items-center rounded-full border border-navy/50 text-xs font-semibold text-navy">
                                  {LETTERS[i]}
                                  <span className="absolute inset-x-[-3px] top-1/2 h-px bg-navy" />
                                </span>
                              </button>
                            )
                          ) : null}
                        </div>
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
                        setDraft((d) => ({ ...d, [q.id]: value }));
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
                      className="mt-1 block w-48 rounded-xl border-2 border-navy/30 bg-white px-4 py-2.5 font-mono text-lg text-navy outline-none focus:border-[#4f6bd8]"
                    />
                    <AnswerPreview value={draft[q.id] ?? answers[q.id]?.answer ?? ""} />
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
        {calcOpen && cur.calculator ? <DesmosPanel onClose={() => setCalcOpen(false)} /> : null}
      </div>

      {/* Нижняя панель — имя ученика, номер вопроса, Назад/Далее */}
      <footer className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t-2 border-dashed border-navy/15 bg-white px-4 py-2.5 sm:px-6">
        <p className="hidden truncate font-semibold text-navy sm:block">{user?.name}</p>
        <button type="button" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen} className="col-start-2 rounded-lg bg-navy px-4 py-1.5 text-sm font-semibold text-white">
          {review ? "Обзор модуля" : `Вопрос ${index + 1} из ${qs.length}`} ▾
        </button>
        <div className="col-start-3 flex justify-end gap-2">
          {review ? (
            <>
              {q ? (
                <Button type="button" variant="secondary" onClick={() => setReview(false)}>
                  Назад
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => {
                  const empty = qs.length - answered;
                  if (!window.confirm(`${empty ? `Без ответа: ${empty}. ` : ""}${isLastSection ? "Завершить тест?" : "Перейти к следующему модулю? Вернуться к этому будет нельзя."}`)) return;
                  void finishSection();
                }}
              >
                {isLastSection ? "Завершить тест" : "Следующий модуль"}
              </Button>
            </>
          ) : (
            <>
              {index > 0 ? (
                <Button type="button" variant="secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                  Назад
                </Button>
              ) : null}
              <Button type="button" onClick={() => (index < qs.length - 1 ? setIndex((i) => i + 1) : setReview(true))}>
                Далее
              </Button>
            </>
          )}
        </div>
        {navOpen ? (
          <div className="absolute bottom-full left-1/2 mb-2 w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border border-navy/10 bg-white p-4 shadow-xl">
            <p className="text-center font-semibold text-navy">{cur.title}</p>
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
            <div className="mt-3 text-center">
              <button type="button" className="rounded-full border border-navy/30 px-4 py-1.5 text-sm font-semibold text-navy hover:bg-navy/5" onClick={() => { setReview(true); setNavOpen(false); }}>
                К странице проверки
              </button>
            </div>
          </div>
        ) : null}
      </footer>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center rounded-lg px-2.5 py-1 text-xs ${active ? "bg-navy/10 text-navy" : "text-navy/80 hover:bg-navy/5"}`}
    >
      <span aria-hidden className="text-lg leading-5">
        {icon}
      </span>
      {label}
    </button>
  );
}

/** Как ответ будет прочитан — «Answer Preview» в Bluebook: дробь показываем дробью. */
function AnswerPreview({ value }: { value: string }) {
  const v = value.trim();
  if (!v) return null;
  const frac = /^(-?)(\d+)\/(\d+)$/.exec(v);
  const tex = frac ? `${frac[1]}\\dfrac{${frac[2]}}{${frac[3]}}` : /^-?(\d+\.?\d*|\.\d+)$/.test(v) ? v : null;
  return (
    <p className="mt-3 text-sm text-muted">
      Ответ будет прочитан как:{" "}
      {tex ? <MathText text={`$${tex}$`} className="text-lg text-navy" /> : <span className="text-burgundy">не похоже на число — проверьте запись</span>}
    </p>
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
