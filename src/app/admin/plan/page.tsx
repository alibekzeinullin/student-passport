"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import { ProgramPlanView } from "@/components/ProgramPlanView";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_ENTRY, PHASES, addMonths, loadPlan, periodLabel, type PlanEntry, type PlanPhase } from "@/lib/program-plan";

type Draft = Omit<PlanEntry, "id"> & { id?: string };

const FIELDS: { key: keyof Draft; label: string; hint?: string; rows?: number }[] = [
  { key: "focus", label: "Фокус", rows: 3 },
  { key: "result", label: "Результат", hint: "Попадает в «Что дальше» месячного отчёта", rows: 3 },
  { key: "steps", label: "По неделям / этапы", hint: "Каждая строка — отдельный пункт", rows: 4 },
  { key: "home", label: "Как помочь дома", hint: "Тоже уходит в «Что дальше»", rows: 2 },
  { key: "grade10", label: "Для 10 класса", hint: "Пусто — у всех одинаково. Десятиклассникам заменяет «Результат» в отчёте", rows: 2 },
  { key: "diff", label: "Чем отличается", rows: 2 },
  { key: "takeaway", label: "Итог для портфолио", rows: 2 },
];

export default function PlanPage() {
  const [plan, setPlan] = useState<PlanEntry[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [view, setView] = useState<"edit" | "parent">("edit");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlan(await loadPlan(createClient()));
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "";
      setError(msg.includes("program_plan") ? "Таблица плана ещё не создана в базе (migration-program-plan.sql)." : msg);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setError("");
    if (!editing.title.trim()) return setError("Нужно название месяца.");
    if (!/^\d{4}-\d{2}$/.test(editing.start_month) || !/^\d{4}-\d{2}$/.test(editing.end_month) || editing.end_month < editing.start_month) {
      return setError("Проверьте месяцы: «по» не раньше «с».");
    }
    const overlap = (plan ?? []).find(
      (e) => e.id !== editing.id && e.start_month <= editing.end_month && editing.start_month <= e.end_month,
    );
    if (overlap) return setError(`Месяцы пересекаются с «${overlap.title}» (${periodLabel(overlap)}).`);
    setSaving(true);
    const { id, ...row } = editing;
    const supabase = createClient();
    const res = id ? await supabase.from("program_plan").update(row).eq("id", id) : await supabase.from("program_plan").insert(row);
    setSaving(false);
    if (res.error) return setError(res.error.message);
    setNotice(`«${editing.title}» сохранено`);
    setEditing(null);
    await load();
  };

  const remove = async (e: PlanEntry) => {
    if (!window.confirm(`Удалить «${e.title}» из плана?`)) return;
    const { error: err } = await createClient().from("program_plan").delete().eq("id", e.id);
    if (err) return setError(err.message);
    setNotice(`«${e.title}» удалено`);
    await load();
  };

  const addNew = () => {
    const last = plan?.[plan.length - 1];
    const m = last ? addMonths(last.end_month, 1) : new Date().toISOString().slice(0, 7);
    setEditing({ ...EMPTY_ENTRY, start_month: m, end_month: m });
  };

  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Менторство</p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">План года</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Фокусы месяцев. Родители видят план в своём кабинете, а месячный отчёт сам добавляет «Что дальше» из следующего месяца.
            </p>
          </div>
          <div className="flex rounded-full border border-white/10 p-1 text-sm">
            {(
              [
                ["edit", "Редактировать"],
                ["parent", "Как видят родители"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={`rounded-full px-4 py-1.5 transition ${view === id ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">{notice}</div> : null}

        {!plan ? (
          !error ? <p className="text-muted">Загрузка…</p> : null
        ) : view === "parent" ? (
          <ProgramPlanView plan={plan} showAll />
        ) : (
          <div className="space-y-2.5">
            {plan.map((e) =>
              editing?.id === e.id ? (
                <Editor key={e.id} d={editing} set={setEditing} onSave={save} onCancel={() => setEditing(null)} saving={saving} />
              ) : (
                <div key={e.id} className="sp-glass flex flex-wrap items-center gap-4 rounded-3xl border px-4 py-3 sm:px-5">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: PHASES[e.phase].color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs uppercase tracking-[0.12em] text-muted">
                      {periodLabel(e)} · {PHASES[e.phase].label}
                    </span>
                    <span className="block text-navy">{e.title}</span>
                  </span>
                  <Button type="button" variant="secondary" onClick={() => setEditing({ ...e })} disabled={Boolean(editing)}>
                    Изменить
                  </Button>
                  <button type="button" onClick={() => void remove(e)} className="text-xs text-burgundy hover:underline" disabled={Boolean(editing)}>
                    удалить
                  </button>
                </div>
              ),
            )}
            {editing && !editing.id ? (
              <Editor d={editing} set={setEditing} onSave={save} onCancel={() => setEditing(null)} saving={saving} />
            ) : (
              <Button type="button" variant="ghost" onClick={addNew} disabled={Boolean(editing)}>
                + Добавить месяц
              </Button>
            )}
          </div>
        )}
      </div>
    </RequireAuth>
  );
}

function Editor({
  d,
  set,
  onSave,
  onCancel,
  saving,
}: {
  d: Draft;
  set: (d: Draft) => void;
  onSave: () => Promise<unknown>;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <section className="sp-glass space-y-4 rounded-3xl border border-gold/40 px-4 py-5 sm:px-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="pl-start">С месяца</Label>
          <Input id="pl-start" type="month" value={d.start_month} onChange={(e) => set({ ...d, start_month: e.target.value, end_month: d.end_month < e.target.value ? e.target.value : d.end_month })} />
        </div>
        <div>
          <Label htmlFor="pl-end">По месяц</Label>
          <Input id="pl-end" type="month" value={d.end_month} onChange={(e) => set({ ...d, end_month: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="pl-phase">Тип</Label>
          <Select id="pl-phase" value={d.phase} onChange={(e) => set({ ...d, phase: e.target.value as PlanPhase })}>
            {(Object.keys(PHASES) as PlanPhase[]).map((p) => (
              <option key={p} value={p}>
                {PHASES[p].label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-format">Формат</Label>
          <Select id="pl-format" value={d.format} onChange={(e) => set({ ...d, format: e.target.value as Draft["format"] })}>
            <option value="individual">Индивидуально</option>
            <option value="team">Команда</option>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pl-title">Название</Label>
          <Input id="pl-title" value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} placeholder="Запуск ресёрча" />
        </div>
        <div>
          <Label htmlFor="pl-short">Коротко</Label>
          <Input id="pl-short" value={d.short} onChange={(e) => set({ ...d, short: e.target.value })} placeholder="Тема, вопрос и план исследования" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`pl-${f.key}`}>{f.label}</Label>
            <Textarea
              id={`pl-${f.key}`}
              value={String(d[f.key] ?? "")}
              onChange={(e) => set({ ...d, [f.key]: e.target.value })}
              style={{ minHeight: `${(f.rows ?? 2) * 1.6 + 1}rem` }}
            />
            {f.hint ? <p className="mt-1 text-xs text-muted">{f.hint}</p> : null}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={saving} onClick={() => void onSave()}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </section>
  );
}
