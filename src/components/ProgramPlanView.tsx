"use client";

import { useMemo, useState } from "react";
import { PHASES, currentMonth, entryFor, addMonths, isGrade10, monthsOf, periodLabel, stepLines, type PlanEntry } from "@/lib/program-plan";
import { monthNominative } from "@/lib/parent-report";

/**
 * План года — лента месяцев и карточки. Для родителя: текущий и следующий месяц раскрыты,
 * вариант для 10 класса показывается только десятиклассникам. Для ментора (showAll) — всё.
 */
export function ProgramPlanView({
  plan,
  className,
  showAll = false,
  today = currentMonth(),
}: {
  plan: PlanEntry[];
  className?: string;
  showAll?: boolean;
  today?: string;
}) {
  const g10 = isGrade10(className);
  const current = entryFor(plan, today);
  const next = useMemo(() => {
    for (let i = 1; i <= 3; i += 1) {
      const e = entryFor(plan, addMonths(today, i));
      if (e && e.id !== current?.id) return e;
    }
    return null;
  }, [plan, today, current]);
  const [open, setOpen] = useState<Set<string>>(() => new Set([current?.id, next?.id].filter(Boolean) as string[]));

  const months = plan.flatMap((e) => monthsOf(e).map((m) => ({ m, e })));
  const usedPhases = Array.from(new Set(plan.map((e) => e.phase)));

  const toggle = (id: string, force?: boolean) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (force ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });

  if (!plan.length) return <p className="text-sm text-muted">План года ещё не заполнен.</p>;

  return (
    <div className="space-y-5">
      <div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map(({ m, e }) => {
            const done = e.end_month < today;
            const now = m === today;
            return (
              <button
                key={m}
                type="button"
                title={`${monthNominative(m)}: ${e.title}`}
                onClick={() => {
                  toggle(e.id, true);
                  document.getElementById(`plan-${e.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`rounded-xl py-2.5 text-[11px] font-semibold text-[#1a1530] transition hover:-translate-y-0.5 sm:text-xs ${done ? "opacity-45" : ""} ${now ? "ring-2 ring-navy ring-offset-2 ring-offset-[var(--background,#0f1726)]" : ""}`}
                style={{ background: PHASES[e.phase].color }}
              >
                {monthNominative(m).slice(0, 3)}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          {usedPhases.map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-3 w-3 rounded" style={{ background: PHASES[p].color }} />
              {PHASES[p].label}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {plan.map((e) => {
          const isOpen = open.has(e.id);
          const status = e.end_month < today ? "Пройдено" : e.id === current?.id ? "Сейчас" : e.id === next?.id ? "Дальше" : "";
          const color = PHASES[e.phase].color;
          const steps = stepLines(e.steps);
          const show10 = e.grade10.trim() && (showAll || g10);
          return (
            <section
              key={e.id}
              id={`plan-${e.id}`}
              className="sp-glass scroll-mt-24 overflow-hidden rounded-3xl border"
              style={isOpen ? { borderColor: `${color}80` } : undefined}
            >
              <button type="button" onClick={() => toggle(e.id)} aria-expanded={isOpen} className="flex w-full items-center gap-4 px-4 py-4 text-left sm:px-5">
                <span
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-center text-[11px] font-bold leading-tight text-[#1a1530]"
                  style={{ background: color, opacity: e.end_month < today ? 0.55 : 1 }}
                  aria-hidden
                >
                  {e.start_month === e.end_month ? monthNominative(e.start_month).slice(0, 3) : `${monthNominative(e.start_month).slice(0, 3)}–${monthNominative(e.end_month).slice(0, 3)}`}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {periodLabel(e)}
                    {status ? <span className={status === "Сейчас" ? "text-gold" : ""}> · {status}</span> : null}
                  </span>
                  <span className="mt-0.5 block text-lg leading-snug text-navy">{e.title}</span>
                  {e.short ? <span className="block text-sm text-muted">{e.short}</span> : null}
                  <span className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    <span className={`rounded-full px-2.5 py-1 ${e.format === "team" ? "bg-navy text-[#1a2433]" : "border border-white/15 text-muted"}`}>
                      {e.format === "team" ? "Команда" : "Индивидуально"}
                    </span>
                    <span className="rounded-full px-2.5 py-1 text-[#1a1530]" style={{ background: color }}>
                      {PHASES[e.phase].label}
                    </span>
                    {show10 ? <span className="rounded-full border border-navy/40 px-2.5 py-1 text-navy">10 кл: свой формат</span> : null}
                  </span>
                </span>
                <span aria-hidden className={`text-[10px] text-muted transition ${isOpen ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>

              {isOpen ? (
                <div className="grid gap-5 border-t border-white/[0.07] px-4 py-5 sm:px-5 md:grid-cols-[1.15fr_1fr]" style={{ background: `${color}0d` }}>
                  <div className="space-y-4 text-sm leading-relaxed text-navy">
                    {e.focus ? <Block title="Фокус" text={e.focus} /> : null}
                    {e.result ? <Block title="Результат" text={e.result} /> : null}
                  </div>
                  {steps.length ? (
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{steps.length === 4 ? "По неделям" : "Этапы"}</p>
                      <ol className="space-y-2 text-sm text-navy">
                        {steps.map((s, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold text-[#1a1530]" style={{ background: color }}>
                              {i + 1}
                            </span>
                            <span className="pt-0.5">{s}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {e.diff ? <p className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm text-navy md:col-span-2">Чем отличается: {e.diff}</p> : null}
                  {show10 ? (
                    <p className="rounded-2xl border border-dashed border-navy/40 px-4 py-3 text-sm text-navy md:col-span-2">Для 10 класса: {e.grade10}</p>
                  ) : null}
                  {e.home ? (
                    <p className="border-t border-white/[0.07] pt-4 text-sm text-navy md:col-span-2">
                      <span className="text-gold">Как помочь дома.</span> {e.home}
                    </p>
                  ) : null}
                  {e.takeaway ? (
                    <p className="border-t border-white/[0.07] pt-4 text-sm text-navy md:col-span-2">
                      <span className="text-gold">Итог.</span> {e.takeaway}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</p>
      <p>{text}</p>
    </div>
  );
}
