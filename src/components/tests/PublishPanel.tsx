"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import type { GroupsData } from "@/lib/groups";
import { isoDate, loadPresentToday } from "@/lib/lessons";
import {
  closeTestSession,
  deleteAssignment,
  loadAllowed,
  openTestSession,
  publishTest,
  updateAssignment,
  type AssignmentRow,
  type AttemptRow,
  type TestFull,
} from "@/lib/tests";

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

/** datetime-local ↔ ISO (время ученика и учителя — Алматы, как в браузере) */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "без срока";
}

export function PublishPanel({
  full,
  groups,
  canEditGroup,
  issues,
  attempts,
  run,
}: {
  full: TestFull;
  groups: GroupsData;
  canEditGroup: (groupId: string) => boolean;
  issues: number;
  attempts: AttemptRow[];
  run: Run;
}) {
  const available = groups.groups.filter((g) => !g.archived && canEditGroup(g.id));
  const published = new Set(full.assignments.map((a) => a.group_id));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [opens, setOpens] = useState(toLocalInput(new Date().toISOString()));
  const [closes, setCloses] = useState("");
  const [gated, setGated] = useState(true);
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState<Map<string, Set<string>>>(new Map());
  const [sessionFor, setSessionFor] = useState<string | null>(null);
  const reloadAllowed = useCallback(async () => {
    const rows = await loadAllowed(full.assignments.map((a) => a.id));
    const m = new Map<string, Set<string>>();
    rows.forEach((r) => m.set(r.assignment_id, (m.get(r.assignment_id) ?? new Set()).add(r.student_id)));
    setAllowed(m);
  }, [full.assignments]);
  useEffect(() => {
    void Promise.resolve().then(reloadAllowed);
  }, [reloadAllowed]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);
  const groupName = (id: string) => groups.groups.find((g) => g.id === id)?.name ?? "группа";
  const noQuestions = full.questions.length === 0;

  return (
    <div className="space-y-5">
      <section className="sp-glass space-y-3 rounded-3xl border px-5 py-5 sm:px-6">
        <h3 className="text-lg text-navy">Опубликовать для групп</h3>
        <p className="text-sm text-muted">Тест появится у учеников в кабинете SAT в указанное время. Проходят один раз; время модулей считает сервер.</p>
        <label className="flex items-start gap-2 text-sm text-navy">
          <input type="checkbox" className="mt-1" checked={gated} onChange={(e) => setGated(e.target.checked)} />
          <span>
            Только в классе
            <span className="block text-xs text-muted">
              Начать смогут только ученики, которых вы отметите на занятии, и только с кодом, который вы скажете вслух. Из дома без отметки не откроется.
            </span>
          </span>
        </label>
        {issues ? (
          <p className="rounded-2xl border border-burgundy/30 bg-burgundy/[0.06] px-4 py-2 text-sm text-burgundy">
            {issues} вопрос(ов) требуют внимания (нет ответа или темы) — лучше исправить до публикации, иначе отчёт будет неточным.
          </p>
        ) : null}
        {available.length ? (
          <div className="flex flex-wrap gap-2">
            {available.map((g) => (
              <label key={g.id} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${picked.has(g.id) ? "border-gold bg-gold/10 text-navy" : "border-white/15 text-navy"}`}>
                <input
                  type="checkbox"
                  checked={picked.has(g.id)}
                  onChange={(e) =>
                    setPicked((prev) => {
                      const n = new Set(prev);
                      if (e.target.checked) n.add(g.id);
                      else n.delete(g.id);
                      return n;
                    })
                  }
                />
                {g.name}
                {published.has(g.id) ? <span className="text-xs text-muted">(уже опубликован)</span> : null}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Нет групп, в которые вы можете публиковать.</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="pub-open">Открыть</Label>
            <Input id="pub-open" type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pub-close">Закрыть (по желанию)</Label>
            <Input id="pub-close" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </div>
          <Button
            type="button"
            disabled={busy || !picked.size || !opens || noQuestions || (Boolean(closes) && closes <= opens)}
            onClick={async () => {
              if (issues && !window.confirm(`Есть ${issues} вопрос(ов) без ответа или темы. Всё равно опубликовать?`)) return;
              setBusy(true);
              const ok = await run(
                () => publishTest(full.test.id, Array.from(picked), new Date(opens).toISOString(), closes ? new Date(closes).toISOString() : null, gated),
                `Опубликовано для: ${Array.from(picked).map(groupName).join(", ")}`,
              );
              setBusy(false);
              if (ok) setPicked(new Set());
            }}
          >
            {busy ? "Публикую…" : "Опубликовать"}
          </Button>
        </div>
        {noQuestions ? <p className="text-xs text-muted">Сначала добавьте вопросы.</p> : null}
      </section>

      {full.assignments.length ? (
        <ul className="space-y-2">
          {full.assignments.map((a) => {
            const att = attempts.filter((x) => x.assignment_id === a.id);
            const done = att.filter((x) => x.finished_at).length;
            const state = new Date(a.opens_at).getTime() > now ? "откроется" : a.closes_at && new Date(a.closes_at).getTime() < now ? "закрыт" : "открыт";
            const mine = canEditGroup(a.group_id);
            return (
              <li key={a.id} className="sp-glass flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl border px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-navy">{groupName(a.group_id)}</span>
                  <span className="block text-xs text-muted">
                    {state} · {fmt(a.opens_at)} — {fmt(a.closes_at)} · начали {att.length}, завершили {done}
                    {a.gated ? ` · только в классе, допущено ${allowed.get(a.id)?.size ?? 0}` : " · открыт всей группе"}
                  </span>
                  {a.gated && a.access_code && a.code_until && new Date(a.code_until).getTime() > now ? (
                    <span className="mt-1 block text-sm text-navy">
                      Код: <span className="font-mono text-lg font-semibold tracking-[0.2em] text-gold">{a.access_code}</span>
                      <span className="text-xs text-muted"> · действует до {new Date(a.code_until).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                  ) : null}
                </span>
                {mine ? (
                  <>
                    {a.gated && state === "открыт" ? (
                      <Button type="button" variant="secondary" onClick={() => setSessionFor(sessionFor === a.id ? null : a.id)}>
                        {sessionFor === a.id ? "Скрыть" : "Запустить в классе"}
                      </Button>
                    ) : null}
                    <label className="flex items-center gap-2 text-xs text-navy" title="Ученики увидят правильные ответы и свои ошибки">
                      <input type="checkbox" checked={a.review_open} onChange={(e) => void run(() => updateAssignment(a.id, { review_open: e.target.checked }), e.target.checked ? "Разбор открыт ученикам" : "Разбор скрыт")} />
                      показать разбор ученикам
                    </label>
                    {state !== "закрыт" ? (
                      <button type="button" className="text-xs text-navy hover:underline" onClick={() => void run(() => updateAssignment(a.id, { closes_at: new Date(Math.max(Date.now(), new Date(a.opens_at).getTime() + 60000)).toISOString() }), "Тест закрыт для группы")}>
                        закрыть сейчас
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs text-burgundy hover:underline"
                      onClick={() => {
                        if (window.confirm(att.length ? `Снять публикацию? Результаты ${att.length} учеников этой группы удалятся.` : "Снять публикацию?")) void run(() => deleteAssignment(a.id), "Публикация снята");
                      }}
                    >
                      снять
                    </button>
                  </>
                ) : null}
                {sessionFor === a.id && mine ? (
                  <SessionPanel
                    assignment={a}
                    roster={groups.roster.filter((r) => r.group_id === a.group_id).map((r) => ({ student_id: r.student_id, full_name: r.full_name }))}
                    allowed={allowed.get(a.id) ?? new Set()}
                    started={new Set(att.map((x) => x.student_id))}
                    run={run}
                    now={now}
                    onDone={reloadAllowed}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Запуск теста в классе: отметить присутствующих и выдать код. */
function SessionPanel({
  assignment,
  roster,
  allowed,
  started,
  run,
  now,
  onDone,
}: {
  now: number;
  assignment: AssignmentRow;
  roster: { student_id: string; full_name: string }[];
  allowed: Set<string>;
  started: Set<string>;
  run: Run;
  onDone: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(allowed));
  const [minutes, setMinutes] = useState(120);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const live = Boolean(assignment.access_code && assignment.code_until && new Date(assignment.code_until).getTime() > now);

  // Сразу отмечаем тех, кто отмечен «был» на сегодняшнем занятии
  useEffect(() => {
    if (allowed.size) return;
    let cancelled = false;
    void loadPresentToday(assignment.group_id, isoDate(new Date())).then((ids) => {
      if (cancelled || !ids.length) return;
      setPicked(new Set(ids));
      setHint(`Отмечены ученики, которые сегодня на занятии: ${ids.length}`);
    });
    return () => {
      cancelled = true;
    };
  }, [assignment.group_id, allowed.size]);

  return (
    <div className="mt-2 w-full rounded-2xl border border-gold/30 bg-gold/[0.05] px-4 py-3">
      <p className="text-sm text-navy">Кто сейчас в классе — им откроется тест:</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {roster.map((m) => (
          <label key={m.student_id} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${picked.has(m.student_id) ? "border-gold bg-gold/10" : "border-white/15"} text-navy`}>
            <input
              type="checkbox"
              checked={picked.has(m.student_id)}
              onChange={(e) =>
                setPicked((prev) => {
                  const n = new Set(prev);
                  if (e.target.checked) n.add(m.student_id);
                  else n.delete(m.student_id);
                  return n;
                })
              }
            />
            {m.full_name}
            {started.has(m.student_id) ? <span className="text-xs text-muted">(начал)</span> : null}
          </label>
        ))}
        {roster.length > 1 ? (
          <button type="button" className="text-xs text-muted hover:text-navy" onClick={() => setPicked(new Set(roster.map((r) => r.student_id)))}>
            отметить всех
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-navy">
          Код действует
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="rounded-lg border border-white/15 bg-transparent px-2 py-1">
            <option value={30}>30 мин</option>
            <option value={60}>1 час</option>
            <option value={120}>2 часа</option>
            <option value={180}>3 часа</option>
          </select>
        </label>
        <Button
          type="button"
          disabled={busy || !picked.size}
          onClick={async () => {
            setBusy(true);
            let code = "";
            await run(async () => {
              code = await openTestSession(assignment.id, Array.from(picked), minutes);
            }, "Тест открыт отмеченным ученикам");
            await onDone();
            setBusy(false);
            if (code) setHint(`Скажите классу код: ${code}`);
          }}
        >
          {live ? "Обновить список и новый код" : "Открыть и получить код"}
        </Button>
        {live ? (
          <button
            type="button"
            className="text-xs text-burgundy hover:underline"
            onClick={async () => {
              await run(() => closeTestSession(assignment.id), "Код отключён — начать тест больше нельзя (кто начал — допишет)");
            }}
          >
            отключить код
          </button>
        ) : null}
      </div>
    </div>
  );
}
