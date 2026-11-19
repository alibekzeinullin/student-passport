"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import type { GroupsData } from "@/lib/groups";
import { deleteAssignment, publishTest, updateAssignment, type AttemptRow, type TestFull } from "@/lib/tests";

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
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const groupName = (id: string) => groups.groups.find((g) => g.id === id)?.name ?? "группа";
  const noQuestions = full.questions.length === 0;

  return (
    <div className="space-y-5">
      <section className="sp-glass space-y-3 rounded-3xl border px-5 py-5 sm:px-6">
        <h3 className="text-lg text-navy">Опубликовать для групп</h3>
        <p className="text-sm text-muted">Тест появится у учеников в кабинете SAT в указанное время. Проходят один раз; время модулей считает сервер.</p>
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
                () => publishTest(full.test.id, Array.from(picked), new Date(opens).toISOString(), closes ? new Date(closes).toISOString() : null),
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
                  </span>
                </span>
                {mine ? (
                  <>
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
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
