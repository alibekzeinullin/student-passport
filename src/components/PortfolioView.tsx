"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import { fetchDeadlines, fetchDeadlinesByParentToken, type Deadline } from "@/lib/deadlines";
import {
  buildPortfolio,
  deletePortfolioItem,
  GROUP_ORDER,
  loadPortfolio,
  loadPortfolioByParentToken,
  PORTFOLIO_CATEGORIES,
  reviewPortfolioItem,
  savePortfolioItem,
  type PortfolioCategory,
  type PortfolioDraft,
  type PortfolioItem,
} from "@/lib/portfolio";
import type { StudentProfile } from "@/lib/types";
import { fetchWorks, fetchWorksByParentToken, type StudentWork } from "@/lib/works";

const STATUS: Record<PortfolioItem["status"], [string, string]> = {
  pending: ["на проверке у ментора", "text-gold"],
  approved: ["подтверждено", "text-emerald-600"],
  rejected: ["нужно поправить", "text-burgundy"],
};

/** Напечатать портфолио (в браузере — «Сохранить как PDF») на светлом фоне. */
function printPortfolio() {
  const root = document.documentElement;
  const prev = root.dataset.theme;
  root.dataset.theme = "sat";
  window.setTimeout(() => {
    window.print();
    if (prev) root.dataset.theme = prev;
    else delete root.dataset.theme;
  }, 50);
}

/**
 * Портфолио (Activity List): олимпиады с результатами, проекты, исследования, экзамены — сайт собирает сам;
 * волонтёрство, клубы, спорт, лидерство и другое ученик добавляет, ментор подтверждает.
 */
export function PortfolioView({
  student,
  mode,
  parentToken,
}: {
  student: Pick<StudentProfile, "id" | "firstName" | "lastName" | "className" | "school" | "academicActivities" | "testScores">;
  mode: "student" | "admin" | "parent";
  parentToken?: string;
}) {
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [works, setWorks] = useState<StudentWork[]>([]);
  const [editing, setEditing] = useState<PortfolioDraft | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (mode === "parent" && parentToken) {
      const [i, d, w] = await Promise.all([
        loadPortfolioByParentToken(parentToken),
        fetchDeadlinesByParentToken(parentToken).catch(() => [] as Deadline[]),
        fetchWorksByParentToken(parentToken).catch(() => [] as StudentWork[]),
      ]);
      setItems(i);
      setDeadlines(d);
      setWorks(w);
      return;
    }
    const [i, d, w] = await Promise.all([
      loadPortfolio(student.id),
      fetchDeadlines(student.id).catch(() => [] as Deadline[]),
      fetchWorks(student.id).catch(() => [] as StudentWork[]),
    ]);
    setItems(i);
    setDeadlines(d);
    setWorks(w);
  }, [mode, parentToken, student.id]);

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

  const entries = useMemo(
    () => (items ? buildPortfolio({ student, deadlines, works, items, includePending: mode !== "parent" }) : []),
    [items, student, deadlines, works, mode],
  );
  const groups = GROUP_ORDER.map((g) => [g, entries.filter((e) => e.group === g)] as const).filter(([, list]) => list.length);
  const pending = (items ?? []).filter((i) => i.status === "pending").length;

  if (!items) return <p className="text-sm text-muted">Собираю портфолио…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {mode !== "parent" ? (
          <Button type="button" onClick={() => setEditing(emptyDraft(student.id))}>
            + Добавить запись
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={printPortfolio}>
          Скачать PDF
        </Button>
        {mode === "admin" && pending ? <span className="text-sm text-gold">Ждут подтверждения: {pending}</span> : null}
        {error ? <span className="text-sm text-burgundy">{error}</span> : null}
      </div>

      {editing ? (
        <ItemForm
          draft={editing}
          onCancel={() => setEditing(null)}
          onSave={(d) =>
            run(async () => {
              await savePortfolioItem(d);
              setEditing(null);
            })
          }
        />
      ) : null}

      <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-8 print:border-0 print:px-0">
        <div className="border-b border-navy/10 pb-3">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">TODAY Scholars · Activity List</p>
          <h3 className="mt-1 text-2xl font-light text-navy">
            {student.firstName} {student.lastName}
          </h3>
          <p className="text-sm text-muted">{[student.className && `${student.className} класс`, student.school].filter(Boolean).join(" · ")}</p>
        </div>
        {groups.length ? (
          <div className="mt-4 space-y-5">
            {groups.map(([group, list]) => (
              <div key={group} className="break-inside-avoid">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{group}</p>
                <ul className="mt-2 space-y-2.5">
                  {list.map((e) => (
                    <li key={e.key} className="break-inside-avoid rounded-2xl border border-navy/10 px-4 py-2.5 print:rounded-none print:border-0 print:border-b print:px-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="font-semibold text-navy">
                          {e.title}
                          {e.link ? (
                            <a href={e.link} target="_blank" rel="noreferrer" className="ml-2 text-xs font-normal text-gold hover:underline print:hidden">
                              ссылка
                            </a>
                          ) : null}
                        </p>
                        <span className="text-xs text-muted">{e.period}</span>
                      </div>
                      {e.detail ? <p className="text-sm text-muted">{e.detail}</p> : null}
                      {e.result ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-navy">{e.result}</p> : null}
                      {e.item && mode !== "parent" ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs print:hidden">
                          <span className={STATUS[e.item.status][1]}>{STATUS[e.item.status][0]}</span>
                          {e.item.mentor_comment ? <span className="text-muted">ментор: {e.item.mentor_comment}</span> : null}
                          {mode === "admin" ? <ReviewControls item={e.item} run={run} /> : null}
                          {mode === "admin" || e.item.status !== "approved" ? (
                            <>
                              <button type="button" onClick={() => setEditing({ ...e.item! })} className="text-navy hover:underline">
                                изменить
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  run(async () => {
                                    if (!window.confirm(`Удалить «${e.item!.title}»?`)) return;
                                    await deletePortfolioItem(e.item!.id);
                                  })
                                }
                                className="text-burgundy hover:underline"
                              >
                                удалить
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : e.source !== "manual" && mode !== "parent" ? (
                        <p className="mt-1 text-[11px] text-muted print:hidden">собрано сайтом автоматически</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Пока пусто. Олимпиады с результатами, проекты и экзамены появятся здесь сами
            {mode !== "parent" ? ", а волонтёрство, клубы, спорт и лидерство добавьте кнопкой выше" : ""}.
          </p>
        )}
      </section>
    </div>
  );
}

function emptyDraft(studentId: string): PortfolioDraft {
  return {
    student_id: studentId,
    category: "volunteer",
    title: "",
    organization: "",
    role: "",
    description: "",
    start_date: null,
    end_date: null,
    hours_per_week: null,
    weeks_per_year: null,
    link: "",
  };
}

function ReviewControls({ item, run }: { item: PortfolioItem; run: (fn: () => Promise<void>) => Promise<void> }) {
  return (
    <>
      {item.status !== "approved" ? (
        <button type="button" onClick={() => run(() => reviewPortfolioItem(item.id, "approved", ""))} className="font-semibold text-emerald-600 hover:underline">
          подтвердить
        </button>
      ) : null}
      {item.status !== "rejected" ? (
        <button
          type="button"
          onClick={() => {
            const c = window.prompt("Что поправить? Ученик увидит этот комментарий.", item.mentor_comment);
            if (c !== null) void run(() => reviewPortfolioItem(item.id, "rejected", c));
          }}
          className="text-gold hover:underline"
        >
          вернуть на доработку
        </button>
      ) : null}
    </>
  );
}

function ItemForm({ draft, onSave, onCancel }: { draft: PortfolioDraft; onSave: (d: PortfolioDraft) => void; onCancel: () => void }) {
  const [d, setD] = useState<PortfolioDraft>(draft);
  const set = (patch: Partial<PortfolioDraft>) => setD((x) => ({ ...x, ...patch }));
  return (
    <section className="sp-rise grid gap-3 rounded-3xl border border-gold/30 bg-gold/[0.04] px-5 py-5 sm:grid-cols-2 print:hidden">
      <div>
        <Label htmlFor="pf-cat">Раздел</Label>
        <Select id="pf-cat" value={d.category} onChange={(e) => set({ category: e.target.value as PortfolioCategory })}>
          {(Object.keys(PORTFOLIO_CATEGORIES) as PortfolioCategory[]).map((k) => (
            <option key={k} value={k}>
              {PORTFOLIO_CATEGORIES[k]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="pf-title">Название</Label>
        <Input id="pf-title" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Волонтёр в приюте для животных" />
      </div>
      <div>
        <Label htmlFor="pf-org">Организация</Label>
        <Input id="pf-org" value={d.organization} onChange={(e) => set({ organization: e.target.value })} placeholder="Фонд «Дос»" />
      </div>
      <div>
        <Label htmlFor="pf-role">Роль</Label>
        <Input id="pf-role" value={d.role} onChange={(e) => set({ role: e.target.value })} placeholder="Координатор волонтёров" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pf-start">С</Label>
          <Input id="pf-start" type="date" value={d.start_date ?? ""} onChange={(e) => set({ start_date: e.target.value || null })} />
        </div>
        <div>
          <Label htmlFor="pf-end">По (пусто — сейчас)</Label>
          <Input id="pf-end" type="date" value={d.end_date ?? ""} onChange={(e) => set({ end_date: e.target.value || null })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pf-hours">Часов в неделю</Label>
          <Input id="pf-hours" inputMode="decimal" value={d.hours_per_week ?? ""} onChange={(e) => set({ hours_per_week: e.target.value ? Math.min(100, Number(e.target.value.replace(",", ".")) || 0) : null })} />
        </div>
        <div>
          <Label htmlFor="pf-weeks">Недель в году</Label>
          <Input id="pf-weeks" inputMode="numeric" value={d.weeks_per_year ?? ""} onChange={(e) => set({ weeks_per_year: e.target.value ? Math.min(52, Number(e.target.value.replace(/\D/g, "")) || 0) : null })} />
        </div>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="pf-desc">Что сделал(а) и результат</Label>
        <Textarea id="pf-desc" value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Организовал сбор корма, привлёк 15 волонтёров, собрали 200 кг" className="min-h-20" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="pf-link">Ссылка на подтверждение (по желанию)</Label>
        <Input id="pf-link" value={d.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://…" />
      </div>
      <div className="flex gap-3 sm:col-span-2">
        <Button type="button" disabled={!d.title.trim()} onClick={() => onSave(d)}>
          Сохранить
        </Button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-navy">
          Отмена
        </button>
      </div>
    </section>
  );
}
