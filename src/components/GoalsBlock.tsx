"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { isoDate } from "@/lib/lessons";
import {
  deleteGoal,
  goalPct,
  loadGoals,
  loadGoalsByParentToken,
  nearbyTerms,
  saveGoal,
  setGoalDone,
  termLabel,
  termOf,
  type StudentGoal,
} from "@/lib/goals";

/**
 * Цели на четверть. Ментор ставит цели вместе с учеником (число — сколько нужно) и отмечает прогресс;
 * ученик и родитель видят. Прошлые четверти — свёрнуты.
 */
export function GoalsBlock({
  studentId,
  mode,
  parentToken,
  onChange,
}: {
  studentId: string;
  mode: "admin" | "student" | "parent";
  parentToken?: string;
  onChange?: (goals: StudentGoal[]) => void;
}) {
  const current = termOf(isoDate(new Date()));
  const [goals, setGoals] = useState<StudentGoal[] | null>(null);
  const [term, setTerm] = useState(current);
  const [showPast, setShowPast] = useState(false);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newTarget, setNewTarget] = useState("1");
  const [editing, setEditing] = useState<string | null>(null);
  const admin = mode === "admin";

  const reload = useCallback(async () => {
    const list = mode === "parent" && parentToken ? await loadGoalsByParentToken(parentToken) : await loadGoals(studentId);
    setGoals(list);
    onChange?.(list);
  }, [mode, parentToken, studentId, onChange]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  const run = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const inTerm = (goals ?? []).filter((g) => g.term === term);
  const past = useMemo(() => {
    const m = new Map<string, StudentGoal[]>();
    (goals ?? []).filter((g) => g.term < current).forEach((g) => m.set(g.term, [...(m.get(g.term) ?? []), g]));
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [goals, current]);

  if (!goals) return null;
  if (!admin && !goals.length) return null;
  const overall = inTerm.length ? Math.round(inTerm.reduce((s, g) => s + goalPct(g), 0) / inTerm.length) : null;

  return (
    <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6" aria-label="Цели на четверть">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg text-navy">Цели на четверть</h3>
          <p className="text-xs text-muted">
            {termLabel(term)}
            {overall !== null ? ` · выполнено в среднем на ${overall}%` : ""}
          </p>
        </div>
        {admin ? (
          <div role="group" aria-label="Четверть" className="flex rounded-full border border-white/10 p-0.5 text-xs">
            {nearbyTerms(current).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={term === t}
                onClick={() => setTerm(t)}
                className={`rounded-full px-3 py-1 ${term === t ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"}`}
              >
                {t === current ? "текущая" : termLabel(t).split(" ")[0] + " чет."}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-burgundy">{error}</p> : null}

      {inTerm.length ? (
        <ul className="mt-3 space-y-2.5">
          {inTerm.map((g) => {
            const p = goalPct(g);
            const done = g.done >= g.target;
            return (
              <li key={g.id} className="rounded-2xl border border-white/10 px-3 py-2.5">
                {editing === g.id && admin ? (
                  <GoalEditor
                    goal={g}
                    onCancel={() => setEditing(null)}
                    onSave={(patch) =>
                      run(async () => {
                        await saveGoal({ ...g, ...patch });
                        setEditing(null);
                      })
                    }
                    onDelete={() =>
                      run(async () => {
                        if (!window.confirm(`Удалить цель «${g.title}»?`)) return;
                        await deleteGoal(g.id);
                        setEditing(null);
                      })
                    }
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className={`text-sm ${done ? "text-emerald-600" : "text-navy"}`}>
                        {done ? "✓ " : ""}
                        {g.title}
                        {g.note ? <span className="block text-xs text-muted">{g.note}</span> : null}
                      </p>
                      <span className="flex shrink-0 items-center gap-1.5 text-sm">
                        {admin ? (
                          <button type="button" aria-label={`Меньше: ${g.title}`} onClick={() => run(() => setGoalDone(g.id, g.done - 1))} disabled={g.done <= 0} className="grid h-6 w-6 place-items-center rounded-full border border-white/15 text-navy disabled:opacity-30">
                            −
                          </button>
                        ) : null}
                        <span className="font-semibold tabular-nums text-navy">
                          {g.done}/{g.target}
                        </span>
                        {admin ? (
                          <>
                            <button type="button" aria-label={`Больше: ${g.title}`} onClick={() => run(() => setGoalDone(g.id, g.done + 1))} className="grid h-6 w-6 place-items-center rounded-full border border-white/15 text-navy">
                              +
                            </button>
                            <button type="button" onClick={() => setEditing(g.id)} className="ml-1 text-xs text-muted hover:text-navy">
                              изменить
                            </button>
                          </>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-navy/10">
                      <div className={`h-1.5 rounded-full ${done ? "bg-emerald-500" : "bg-gold"}`} style={{ width: `${p}%` }} />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{admin ? "Целей на эту четверть пока нет — поставьте 2–3 вместе с учеником." : "Целей на эту четверть пока нет."}</p>
      )}

      {admin ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Например: подать на 2 олимпиады"
            aria-label="Новая цель"
            className="min-w-0 flex-1"
          />
          <Input value={newTarget} onChange={(e) => setNewTarget(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Сколько нужно" inputMode="numeric" className="!w-20 text-center" />
          <Button
            type="button"
            disabled={!newTitle.trim() || !Number(newTarget)}
            onClick={() =>
              run(async () => {
                await saveGoal({ student_id: studentId, term, title: newTitle, target: Number(newTarget), sort: inTerm.length });
                setNewTitle("");
                setNewTarget("1");
              })
            }
          >
            Добавить цель
          </Button>
          <p className="w-full text-xs text-muted">Число — сколько нужно сделать (для «закончить проект» оставьте 1). Ученик и родители видят цели и прогресс.</p>
        </div>
      ) : null}

      {past.length ? (
        <div className="mt-3">
          <button type="button" onClick={() => setShowPast((v) => !v)} className="text-xs text-muted hover:text-navy">
            {showPast ? "Скрыть прошлые четверти" : `Прошлые четверти (${past.length})`}
          </button>
          {showPast ? (
            <ul className="mt-2 space-y-2 text-sm">
              {past.map(([t, list]) => (
                <li key={t}>
                  <p className="text-xs text-muted">{termLabel(t)}</p>
                  {list.map((g) => (
                    <p key={g.id} className={g.done >= g.target ? "text-emerald-600" : "text-navy"}>
                      {g.done >= g.target ? "✓" : "○"} {g.title} — {g.done}/{g.target}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function GoalEditor({
  goal,
  onSave,
  onCancel,
  onDelete,
}: {
  goal: StudentGoal;
  onSave: (patch: Partial<StudentGoal>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(goal.title);
  const [target, setTarget] = useState(String(goal.target));
  const [note, setNote] = useState(goal.note);
  return (
    <div className="space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Цель" />
      <div className="flex flex-wrap gap-2">
        <Input value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Сколько нужно" className="!w-20 text-center" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка (по желанию)" aria-label="Заметка" className="min-w-0 flex-1" />
      </div>
      <div className="flex gap-3 text-sm">
        <Button type="button" disabled={!title.trim() || !Number(target)} onClick={() => onSave({ title, target: Number(target), note })}>
          Сохранить
        </Button>
        <button type="button" onClick={onCancel} className="text-muted hover:text-navy">
          Отмена
        </button>
        <button type="button" onClick={onDelete} className="ml-auto text-burgundy hover:underline">
          удалить
        </button>
      </div>
    </div>
  );
}
