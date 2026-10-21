"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useStudents } from "@/context/StudentsContext";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import {
  SECTIONS,
  TAG_LABELS,
  TIER_LABELS,
  categoryFor,
  fetchOpportunities,
  type Opportunity,
} from "@/lib/opportunities";
import {
  createDeadlines,
  daysLeft,
  fetchDeadlines,
  formatDaysLeft,
  formatDueDate,
  isTableMissing,
  type Deadline,
} from "@/lib/deadlines";

const ALL = "all";

export function OpportunitiesFeed() {
  const { user } = useAuth();
  const { students } = useStudents();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState<Opportunity[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState(ALL);
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [hidePast, setHidePast] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const loadDeadlines = useCallback(
    () => fetchDeadlines(isAdmin ? undefined : user?.studentId),
    [isAdmin, user?.studentId],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([fetchOpportunities(), loadDeadlines()]).then(([o, d]) => {
      if (cancelled) return;
      if (o.status === "fulfilled") {
        setItems(o.value);
      } else {
        console.error(o.reason);
        setError(
          isTableMissing(o.reason, "opportunities")
            ? "Лента ещё не подключена: выполните supabase/migration-platform.sql в Supabase → SQL Editor."
            : "Не удалось загрузить ленту.",
        );
      }
      if (d.status === "fulfilled") setDeadlines(d.value);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadDeadlines]);

  const refreshDeadlines = async () => {
    try {
      setDeadlines(await loadDeadlines());
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((o) => {
      if (section !== ALL && o.section !== section) return false;
      if (freeOnly && o.money !== "free") return false;
      if (hidePast && (o.nextCycle || (o.dueDate && daysLeft(o.dueDate) < 0))) return false;
      if (!q) return true;
      return [o.name, o.shortName, o.description, o.topics, o.grades]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, section, query, freeOnly, hidePast]);

  const soon = useMemo(
    () =>
      items
        .filter((o) => o.dueDate && !o.nextCycle && daysLeft(o.dueDate) >= 0)
        .slice(0, 3),
    [items],
  );

  const addedBy = (id: string) => deadlines.filter((d) => d.opportunityId === id);

  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
          Лента возможностей
        </p>
        <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">
          Олимпиады, конкурсы и хакатоны 2026–27
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {isAdmin
            ? "Выберите возможность и добавьте её ученикам — у них появится обратный отсчёт до дедлайна."
            : "Нажмите «В мои дедлайны» — на главной появится обратный отсчёт до подачи."}
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">
          {error}
        </div>
      ) : null}

      {soon.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {soon.map((o) => {
            const left = daysLeft(o.dueDate as string);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setSection(ALL);
                  setOpenId(o.id);
                  document.getElementById(`opp-${o.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className={`rounded-3xl border px-5 py-4 text-left transition hover:-translate-y-0.5 ${
                  left <= 7
                    ? "border-burgundy/40 bg-gradient-to-br from-burgundy-deep to-[#4d1320]"
                    : "sp-glass"
                }`}
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#f0d9a8]">
                  {o.kind || "Дедлайн"}
                </p>
                <p className="mt-1 text-4xl font-light leading-none text-white">
                  {left}
                  <span className="ml-1 text-sm text-white/70">
                    {formatDaysLeft(left).replace(/^\d+\s/, "")}
                  </span>
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-white">{o.shortName}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="sp-glass flex flex-col gap-3 rounded-3xl border px-4 py-4 sm:px-6">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Разделы">
          {[{ id: ALL, title: "Все" }, ...SECTIONS].map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={section === s.id}
              onClick={() => setSection(s.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                section === s.id
                  ? "bg-gold text-gold-ink"
                  : "border border-white/10 text-muted hover:text-navy"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: математика, эссе, 8 класс…"
            aria-label="Поиск"
            className="sm:max-w-sm"
          />
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} className="size-4 accent-[#cbb073]" />
            Только бесплатные
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={hidePast} onChange={(e) => setHidePast(e.target.checked)} className="size-4 accent-[#cbb073]" />
            Скрыть прошедшие
          </label>
          <span className="text-xs text-muted sm:ml-auto">
            {loaded ? `${filtered.length} из ${items.length}` : "Загрузка…"}
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {filtered.map((o) => (
          <OpportunityCard
            key={o.id}
            item={o}
            open={openId === o.id}
            onToggle={() => setOpenId((prev) => (prev === o.id ? null : o.id))}
            added={addedBy(o.id)}
            isAdmin={isAdmin}
            studentId={user?.studentId}
            students={students}
            onAdded={refreshDeadlines}
          />
        ))}
        {loaded && filtered.length === 0 && !error ? (
          <li className="rounded-3xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted">
            Ничего не найдено. Попробуйте другой раздел или снимите фильтры.
          </li>
        ) : null}
      </ul>
    </>
  );
}

function OpportunityCard({
  item,
  open,
  onToggle,
  added,
  isAdmin,
  studentId,
  students,
  onAdded,
}: {
  item: Opportunity;
  open: boolean;
  onToggle: () => void;
  added: Deadline[];
  isAdmin: boolean;
  studentId?: string;
  students: { id: string; firstName: string; lastName: string; className: string }[];
  onAdded: () => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const left = item.dueDate ? daysLeft(item.dueDate) : null;
  const sectionTitle = SECTIONS.find((s) => s.id === item.section)?.title ?? "";

  const dateTone =
    left === null || item.nextCycle
      ? "text-muted"
      : left < 0
        ? "text-muted line-through"
        : left <= 7
          ? "text-burgundy"
          : left <= 30
            ? "text-gold"
            : "text-navy";

  return (
    <li id={`opp-${item.id}`} className="sp-glass rounded-3xl border">
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-start sm:px-6">
        <div className="flex flex-row items-baseline gap-3 sm:flex-col sm:gap-0.5">
          <span className="text-[11px] text-muted">{item.kind || "Даты"}</span>
          <span className={`text-lg font-medium tabular-nums ${dateTone}`}>
            {item.dueDate ? formatDueDate(item.dueDate) : "уточнить"}
            {item.approx && item.dueDate ? <span className="text-muted"> ≈</span> : null}
          </span>
          {left !== null && !item.nextCycle && left >= 0 ? (
            <span className={`text-xs ${left <= 7 ? "text-burgundy" : "text-muted"}`}>
              через {formatDaysLeft(left)}
            </span>
          ) : item.nextCycle ? (
            <span className="text-xs text-muted">следующий цикл</span>
          ) : null}
        </div>

        <div className="min-w-0">
          <button type="button" onClick={onToggle} className="text-left" aria-expanded={open}>
            <h3 className="text-lg font-medium leading-snug text-navy hover:text-gold">{item.name}</h3>
          </button>
          <p className="mt-1 text-sm text-muted">{item.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted">{sectionTitle}</span>
            {item.tier === "top" ? (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-gold">{TIER_LABELS.top}</span>
            ) : TIER_LABELS[item.tier] ? (
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted">{TIER_LABELS[item.tier]}</span>
            ) : null}
            {item.tags
              .filter((t) => TAG_LABELS[t])
              .map((t) => (
                <span
                  key={t}
                  className={`rounded-full px-2 py-0.5 ${t === "free" ? "bg-emerald-400/10 text-emerald-300" : "border border-white/10 text-muted"}`}
                >
                  {TAG_LABELS[t]}
                </span>
              ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          {isAdmin ? (
            <>
              <Button type="button" variant={picking ? "secondary" : "primary"} onClick={() => setPicking((v) => !v)}>
                {picking ? "Отмена" : "Добавить ученикам"}
              </Button>
              {added.length > 0 ? (
                <span className="text-xs text-muted">
                  уже у {added.length} · подали {added.filter((d) => d.status === "submitted").length}
                </span>
              ) : null}
            </>
          ) : added.length > 0 ? (
            <span className="rounded-full border border-emerald-400/30 px-3 py-1.5 text-sm text-emerald-300">
              ✓ В дедлайнах
            </span>
          ) : (
            <Button type="button" onClick={() => setPicking((v) => !v)}>
              {picking ? "Отмена" : "В мои дедлайны"}
            </Button>
          )}
          <button type="button" onClick={onToggle} className="text-xs text-muted underline-offset-2 hover:text-navy hover:underline">
            {open ? "Свернуть" : "Подробнее"}
          </button>
        </div>
      </div>

      {picking ? (
        <AddToDeadlines
          item={item}
          isAdmin={isAdmin}
          studentId={studentId}
          students={students}
          alreadyIds={new Set(added.map((d) => d.studentId))}
          onDone={async () => {
            setPicking(false);
            await onAdded();
          }}
        />
      ) : null}

      {open ? (
        <dl className="grid gap-x-6 gap-y-3 border-t border-white/[0.07] px-5 py-4 text-sm sm:grid-cols-[180px_minmax(0,1fr)] sm:px-6">
          {[
            ["Даты", item.dateNote],
            ["Где", item.location],
            ["Этапы", item.stages],
            ["Классы", item.grades],
            ["Стоимость", item.price],
            ["Предметы", item.topics],
            ["Что даёт", item.gives],
            ["Как участвовать", item.how],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="m-0 text-navy">{v}</dd>
              </div>
            ))}
          {item.url ? (
            <div className="contents">
              <dt className="text-muted">Сайт</dt>
              <dd className="m-0">
                <a href={item.url} target="_blank" rel="noreferrer" className="break-all text-gold underline-offset-2 hover:underline">
                  {item.url}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </li>
  );
}

function AddToDeadlines({
  item,
  isAdmin,
  studentId,
  students,
  alreadyIds,
  onDone,
}: {
  item: Opportunity;
  isAdmin: boolean;
  studentId?: string;
  students: { id: string; firstName: string; lastName: string; className: string }[];
  alreadyIds: Set<string>;
  onDone: () => Promise<void>;
}) {
  const [date, setDate] = useState(item.dueDate ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const candidates = students.filter((s) => !alreadyIds.has(s.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    const ids = isAdmin ? [...selected] : studentId ? [studentId] : [];
    if (!date) {
      setError("Укажите дату дедлайна");
      return;
    }
    if (ids.length === 0) {
      setError("Выберите хотя бы одного ученика");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createDeadlines(
        ids,
        {
          title: item.shortName,
          category: categoryFor(item),
          dueDate: date,
          url: item.url,
          notes: item.kind,
          opportunityId: item.id,
        },
        isAdmin,
      );
      await onDone();
    } catch (err) {
      console.error(err);
      setError("Не удалось добавить. Попробуйте ещё раз.");
      setBusy(false);
    }
  };

  return (
    <div className="sp-rise flex flex-col gap-3 border-t border-gold/20 bg-[#162030]/60 px-5 py-4 sm:px-6">
      <div className="max-w-xs">
        <Label htmlFor={`date-${item.id}`}>Дата дедлайна</Label>
        <Input id={`date-${item.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {item.approx ? (
          <p className="mt-1 text-xs text-muted">Дата примерная — проверьте на сайте и поправьте при необходимости.</p>
        ) : null}
      </div>
      {isAdmin ? (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Ученики</span>
            <button
              type="button"
              className="text-xs text-gold underline-offset-2 hover:underline"
              onClick={() => setSelected(new Set(candidates.map((s) => s.id)))}
            >
              Выбрать всех
            </button>
            {selected.size > 0 ? (
              <button type="button" className="text-xs text-muted hover:text-navy" onClick={() => setSelected(new Set())}>
                Снять выбор
              </button>
            ) : null}
          </div>
          {candidates.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Уже добавлено всем ученикам.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {candidates.map((s) => {
                const on = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      on ? "border-gold bg-gold/15 text-navy" : "border-white/10 text-muted hover:text-navy"
                    }`}
                  >
                    {s.lastName} {s.firstName}
                    {s.className ? <span className="text-muted"> · {s.className}</span> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
      {error ? <p className="text-sm text-burgundy">{error}</p> : null}
      <div>
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          {busy
            ? "Добавляю…"
            : isAdmin
              ? `Добавить${selected.size ? ` (${selected.size})` : ""}`
              : "Добавить в мои дедлайны"}
        </Button>
      </div>
    </div>
  );
}
