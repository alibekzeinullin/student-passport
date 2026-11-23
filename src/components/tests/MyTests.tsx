"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { loadMyTests, startTest, type MyTest } from "@/lib/tests";

function when(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Тесты на сайте в кабинете SAT — компактно: сначала доступные, пройденные свёрнуты. Пустой — блок не показывается. */
export function MyTests() {
  const router = useRouter();
  const [tests, setTests] = useState<MyTest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [now] = useState(() => Date.now());

  const reload = useCallback(async () => setTests(await loadMyTests()), []);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  // Пока ждём, что учитель отметит ученика и откроет код, — обновляем список
  const waiting = (tests ?? []).some((t) => t.gated && !t.attempt_id && !t.finished_at);
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => void reload(), 15000);
    return () => window.clearInterval(t);
  }, [waiting, reload]);

  if (!tests || !tests.length) return null;

  const open = async (t: MyTest) => {
    setBusy(t.assignment_id);
    setError("");
    try {
      const id = t.attempt_id ?? (await startTest(t.assignment_id, codes[t.assignment_id]));
      router.push(`/test/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
      void reload();
    }
  };

  const active = tests.filter((t) => !t.finished_at);
  const done = tests.filter((t) => t.finished_at);
  const shown = showAll ? [...active, ...done] : [...active, ...done.slice(0, active.length ? 0 : 2)];

  return (
    <section className="sp-glass rounded-3xl border px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-navy">Тесты</h3>
        {done.length > (active.length ? 0 : 2) ? (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs text-muted hover:text-navy">
            {showAll ? "Свернуть" : `Все тесты (${tests.length})`}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-burgundy">{error}</p> : null}
      <ul className="mt-2 divide-y divide-navy/10">
        {shown.map((t) => {
          const notYet = new Date(t.opens_at).getTime() > now;
          const closed = Boolean(t.closes_at && new Date(t.closes_at).getTime() < now);
          const finished = Boolean(t.finished_at);
          const going = Boolean(t.attempt_id && !finished);
          const needCode = t.gated && !t.attempt_id;
          return (
            <li key={t.assignment_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-navy">{t.title}</span>
                <span className="block text-xs text-muted">
                  {t.questions} вопросов · {t.total_minutes} мин
                  {finished ? ` · пройден ${when(t.finished_at as string)}` : notYet ? ` · откроется ${when(t.opens_at)}` : t.closes_at ? ` · до ${when(t.closes_at)}` : ""}
                </span>
              </span>
              {finished ? (
                <>
                  <span className="text-sm text-navy">
                    {Number(t.score)} / {Number(t.max_score)}
                  </span>
                  <button type="button" className="text-sm text-gold hover:underline" onClick={() => router.push(`/test/${t.attempt_id}`)}>
                    Результат
                  </button>
                </>
              ) : notYet ? (
                <span className="text-xs text-muted">скоро</span>
              ) : closed && !going ? (
                <span className="text-xs text-muted">закрыт</span>
              ) : needCode && !t.allowed ? (
                <span className="text-xs text-muted">Тест запускает учитель на занятии</span>
              ) : (
                <span className="flex items-center gap-2">
                  {needCode ? (
                    <input
                      value={codes[t.assignment_id] ?? ""}
                      onChange={(e) => setCodes((c) => ({ ...c, [t.assignment_id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                      inputMode="numeric"
                      placeholder={t.code_active ? "Код" : "Ждём код"}
                      aria-label={`Код для теста ${t.title}`}
                      className="w-24 rounded-xl border-2 border-navy/20 bg-white px-3 py-1.5 text-center font-mono tracking-widest text-navy outline-none focus:border-gold"
                    />
                  ) : null}
                  <Button
                    type="button"
                    disabled={busy !== null || (needCode && (codes[t.assignment_id] ?? "").length !== 6)}
                    onClick={() => {
                      if (!going && !window.confirm(`Начать «${t.title}»? Таймер запустится сразу и не остановится, даже если закрыть страницу.`)) return;
                      void open(t);
                    }}
                  >
                    {busy === t.assignment_id ? "Открываю…" : going ? "Продолжить" : "Начать"}
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
