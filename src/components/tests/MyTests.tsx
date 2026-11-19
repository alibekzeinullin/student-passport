"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { loadMyTests, startTest, type MyTest } from "@/lib/tests";

function when(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

/** Тесты на сайте в кабинете SAT: открытые, скоро, пройденные. Пустой — блок не показывается. */
export function MyTests() {
  const router = useRouter();
  const [tests, setTests] = useState<MyTest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void loadMyTests().then((t) => {
      if (!cancelled) setTests(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!tests || !tests.length) return null;

  const open = async (t: MyTest) => {
    setBusy(t.assignment_id);
    setError("");
    try {
      const id = t.attempt_id ?? (await startTest(t.assignment_id));
      router.push(`/test/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <section className="sp-glass rounded-3xl border px-6 py-6">
      <h3 className="text-lg text-navy">Тесты</h3>
      {error ? <p className="mt-2 text-sm text-burgundy">{error}</p> : null}
      <ul className="mt-3 space-y-2">
        {tests.map((t) => {
          const notYet = new Date(t.opens_at).getTime() > now;
          const closed = Boolean(t.closes_at && new Date(t.closes_at).getTime() < now);
          const done = Boolean(t.finished_at);
          const going = Boolean(t.attempt_id && !done);
          return (
            <li key={t.assignment_id} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${!done && !notYet && !closed ? "border-gold/50 bg-gold/[0.06]" : "border-navy/10"}`}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-navy">{t.title}</span>
                <span className="block text-xs text-muted">
                  {t.sections} модул{t.sections === 1 ? "ь" : t.sections < 5 ? "я" : "ей"} · {t.questions} вопросов · {t.total_minutes} мин
                  {done
                    ? ` · пройден ${when(t.finished_at as string)}`
                    : notYet
                      ? ` · откроется ${when(t.opens_at)}`
                      : t.closes_at
                        ? ` · до ${when(t.closes_at)}`
                        : ""}
                </span>
              </span>
              {done ? (
                <>
                  <span className="text-sm text-navy">
                    {Number(t.score)} / {Number(t.max_score)}
                  </span>
                  <Button type="button" variant="secondary" onClick={() => router.push(`/test/${t.attempt_id}`)}>
                    Результат
                  </Button>
                </>
              ) : notYet ? (
                <span className="text-xs text-muted">скоро</span>
              ) : closed && !going ? (
                <span className="text-xs text-muted">закрыт</span>
              ) : (
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!going && !window.confirm(`Начать «${t.title}»? Таймер запустится сразу и не остановится, даже если закрыть страницу.`)) return;
                    void open(t);
                  }}
                >
                  {busy === t.assignment_id ? "Открываю…" : going ? "Продолжить" : "Начать тест"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
