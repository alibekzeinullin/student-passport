"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StudentProfile } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  RESULT_LABELS,
  addDaysIso,
  createDeadlines,
  daysLeft,
  daysWord,
  deleteDeadline,
  fetchDeadlines,
  fetchDeadlinesByParentToken,
  peekFetchDeadlines,
  peekFetchDeadlinesByParentToken,
  formatDaysLeft,
  formatDueDate,
  isTableMissing,
  updateDeadline,
  urgencyOf,
  type Deadline,
  type DeadlineCategory,
  type DeadlineResult,
  type DeadlineStatus,
  type Urgency,
} from "@/lib/deadlines";
import {
  fetchMeetingsByParentToken,
  fetchMeetingsForStudent,
  peekFetchMeetingsByParentToken,
  peekFetchMeetingsForStudent,
  type Meeting,
} from "@/lib/meetings";
import {
  attendanceStreak,
  computeBadges,
  recentAttendance,
} from "@/lib/achievements";
import { useCountUp } from "@/lib/use-count-up";
import { fetchSubmissions, fetchSubmissionsByParentToken, peekSubmissions, type EssaySubmission } from "@/lib/essays";
import { fetchTermGrades, fetchTermGradesByParentToken, type TermGrade } from "@/lib/term-grades";
import { BadgesPanel } from "@/components/BadgesPanel";
import { fetchWorks, peekWorks, type StudentWork } from "@/lib/works";
import { buildStudentTodos, type StudentTodo } from "@/lib/student-todos";
import { OpportunityLogo } from "@/components/OpportunityLogo";

type Mode = "admin" | "student" | "parent";

interface OverviewItem extends Deadline {
  /** Домашка из журнала встреч — не хранится как дедлайн */
  virtual?: boolean;
}

const MIGRATION_HINT =
  "Дедлайны ещё не подключены к базе: выполните supabase/migration-platform.sql в Supabase → SQL Editor и обновите страницу.";

export function StudentOverview({
  student,
  mode,
  parentToken,
}: {
  student: StudentProfile;
  mode: Mode;
  parentToken?: string;
}) {
  // Уже загружали в этой сессии — показываем сразу, обновляем в фоне
  const cachedDeadlines =
    mode === "parent" ? peekFetchDeadlinesByParentToken(parentToken ?? "") : peekFetchDeadlines(student.id);
  const cachedMeetings =
    mode === "parent" ? peekFetchMeetingsByParentToken(parentToken ?? "") : peekFetchMeetingsForStudent(student.id);
  const [deadlines, setDeadlines] = useState<Deadline[]>(() => cachedDeadlines ?? []);
  const [meetings, setMeetings] = useState<Meeting[]>(() => cachedMeetings ?? []);
  const [loaded, setLoaded] = useState(() => cachedDeadlines !== undefined);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [essays, setEssays] = useState<EssaySubmission[] | null>(() =>
    mode !== "parent" ? (peekSubmissions(student.id) ?? null) : null,
  );
  const [grades, setGrades] = useState<TermGrade[] | null>(null);
  const [works, setWorks] = useState<StudentWork[] | null>(() => (mode === "student" ? (peekWorks(student.id) ?? null) : null));
  const [extrasReady, setExtrasReady] = useState(false);

  const load = useCallback(async () => {
    const [d, m] = await Promise.allSettled([
      mode === "parent"
        ? fetchDeadlinesByParentToken(parentToken ?? "")
        : fetchDeadlines(student.id),
      mode === "parent"
        ? fetchMeetingsByParentToken(parentToken ?? "")
        : fetchMeetingsForStudent(student.id),
    ]);
    return { d, m };
  }, [mode, parentToken, student.id]);

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof load>>) => {
      if (result.d.status === "fulfilled") {
        setDeadlines(result.d.value);
        setError("");
      } else {
        console.error(result.d.reason);
        setError(
          isTableMissing(result.d.reason, "student_deadlines")
            ? MIGRATION_HINT
            : "Не удалось загрузить дедлайны.",
        );
      }
      if (result.m.status === "fulfilled") setMeetings(result.m.value);
      setLoaded(true);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void load().then((r) => {
      if (!cancelled) apply(r);
    });
    if (mode === "student") {
      fetchWorks(student.id).then(
        (l) => !cancelled && setWorks(l),
        () => undefined,
      );
    }
    // Эссе и оценки — для достижений (и задач ученика)
    void Promise.allSettled([
      mode === "parent" ? fetchSubmissionsByParentToken(parentToken ?? "") : fetchSubmissions(student.id),
      mode === "parent" ? fetchTermGradesByParentToken(parentToken ?? "") : fetchTermGrades(student.id),
    ]).then(([e, g]) => {
      if (cancelled) return;
      if (e.status === "fulfilled") setEssays(e.value);
      if (g.status === "fulfilled") setGrades(g.value);
      setExtrasReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [load, apply, mode, student.id, parentToken]);

  const reload = async () => apply(await load());

  const items: OverviewItem[] = useMemo(() => {
    const list: OverviewItem[] = [...deadlines];
    const latest = [...meetings]
      .filter((m) => m.format === "individual")
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))[0];
    if (latest?.homework.trim()) {
      const due = addDaysIso(latest.meetingDate, 7);
      if (daysLeft(due) >= -1) {
        list.push({
          id: `hw-${latest.id}`,
          studentId: student.id,
          title: latest.homework.trim().split("\n")[0],
          category: "task",
          dueDate: due,
          url: "",
          notes: "Домашка с последней встречи",
          status: "planned",
          createdByAdmin: true,
          opportunityId: null,
          groupKey: null,
          result: null,
          virtual: true,
        });
      }
    }
    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [deadlines, meetings, student.id]);

  const active = items.filter((d) => d.status === "planned");
  const done = items.filter((d) => d.status !== "planned");
  const upcoming = active.filter((d) => daysLeft(d.dueDate) >= 0);
  const overdue = active.filter((d) => daysLeft(d.dueDate) < 0);
  const hero = upcoming[0];
  const rest = [...overdue, ...upcoming.slice(1)];

  const canEdit = mode !== "parent";
  const todos = loaded ? buildStudentTodos(student, deadlines, meetings, new Date(), mode === "student" ? essays : null, works) : [];

  return (
    <div className="flex flex-col gap-5">
    {loaded ? <TodoPanel todos={todos} mode={mode} /> : null}
    <div className="flex flex-col gap-5 lg:flex-row">
      <section className="sp-rise flex min-w-0 flex-[3_1_0%] flex-col gap-4">
        {error ? (
          <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">
            {error}
          </div>
        ) : null}

        <DeadlineHero item={hero} loaded={loaded} mode={mode} onChanged={reload} />

        <div id="sec-deadlines" className="sp-glass scroll-mt-24 rounded-3xl border px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Дедлайны
            </h3>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/opportunities"
                  className="rounded-full border border-white/15 px-4 py-2 text-sm text-navy transition hover:border-gold/60 hover:bg-white/5"
                >
                  Лента возможностей
                </Link>
                <Button
                  type="button"
                  onClick={() => setAdding((v) => !v)}
                  disabled={Boolean(error)}
                >
                  {adding ? "Отмена" : "+ Дедлайн"}
                </Button>
              </div>
            ) : null}
          </div>

          {adding ? (
            <AddDeadlineForm
              studentId={student.id}
              asAdmin={mode === "admin"}
              onDone={async () => {
                setAdding(false);
                await reload();
              }}
            />
          ) : null}

          <ul className="mt-3 flex flex-col gap-2">
            {rest.map((d) => (
              <DeadlineRow key={d.id} item={d} mode={mode} onChanged={reload} />
            ))}
            {loaded && rest.length === 0 && !adding ? (
              <li className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-muted">
                {hero
                  ? "Других дедлайнов пока нет."
                  : mode === "parent"
                    ? "Дедлайнов пока нет."
                    : "Добавьте олимпиаду, конкурс или задание — здесь появится обратный отсчёт."}
              </li>
            ) : null}
          </ul>

          {done.length > 0 ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline"
                aria-expanded={showDone}
              >
                {showDone ? "Скрыть" : "Показать"} завершённые ({done.length})
              </button>
              {showDone ? (
                <ul className="mt-2 flex flex-col gap-2">
                  {done.map((d) => (
                    <DeadlineRow key={d.id} item={d} mode={mode} onChanged={reload} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <MotivationCard
        student={student}
        meetings={meetings}
        deadlines={deadlines}
        essays={essays}
        grades={grades}
        ready={loaded && extrasReady}
        mode={mode}
      />
    </div>
    </div>
  );
}

// ---------- Что не сделано ----------

const TODO_DOT: Record<StudentTodo["severity"], string> = {
  high: "bg-burgundy sp-pulse",
  medium: "bg-gold",
  low: "bg-navy-soft",
};

function TodoPanel({ todos, mode }: { todos: StudentTodo[]; mode: Mode }) {
  const [open, setOpen] = useState(false);
  const high = todos.filter((t) => t.severity === "high").length;
  const visible = open ? todos : todos.slice(0, 4);

  if (todos.length === 0) {
    return (
      <div className="sp-rise flex items-center gap-3 rounded-3xl border border-emerald-400/25 bg-emerald-400/[0.06] px-5 py-4 text-sm text-navy">
        <span className="flex size-8 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300" aria-hidden>✓</span>
        {mode === "student" ? "Всё сделано — так держать!" : "У ученика всё заполнено и сдано вовремя."}
      </div>
    );
  }

  return (
    <section
      className={`sp-rise rounded-3xl border px-5 py-4 sm:px-6 ${
        high > 0 ? "border-burgundy/35 bg-burgundy-deep/20" : "border-gold/25 bg-gold/[0.05]"
      }`}
      aria-label="Что нужно сделать"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">
          {mode === "student" ? "Что нужно сделать" : mode === "admin" ? "Что не сделано у ученика" : "Что пока не сделано"}
        </h3>
        <span className="text-xs text-muted">
          {todos.length} {todos.length === 1 ? "пункт" : todos.length < 5 ? "пункта" : "пунктов"}
          {high ? ` · ${high} срочно` : ""}
        </span>
      </div>
      <ul className="mt-2 flex flex-col">
        {visible.map((t) => (
          <li key={t.key} className="border-t border-white/[0.06] first:border-t-0">
            {mode === "parent" ? (
              <span className="flex items-center gap-3 px-2 py-2.5 text-sm text-navy">
                <span className={`size-2 shrink-0 rounded-full ${TODO_DOT[t.severity]}`} aria-hidden />
                <span className="min-w-0 flex-1">{t.text.replace(/^Добавь фото в профиль$/, "Нет фото в профиле")}</span>
              </span>
            ) : (
              <Link
                href={t.href}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm text-navy transition hover:bg-white/[0.04]"
              >
                <span className={`size-2 shrink-0 rounded-full ${TODO_DOT[t.severity]}`} aria-hidden />
                <span className="min-w-0 flex-1">{t.text}</span>
                <span className="text-muted" aria-hidden>→</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
      {todos.length > 4 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-sm text-muted underline-offset-2 hover:text-navy hover:underline"
        >
          {open ? "Свернуть" : `Показать все (${todos.length})`}
        </button>
      ) : null}
    </section>
  );
}

// ---------- Главный дедлайн ----------

const HERO_TONE: Record<Urgency, { box: string; label: string; ring: string }> = {
  calm: {
    box: "sp-glass border",
    label: "text-navy-soft",
    ring: "var(--navy-soft)",
  },
  soon: {
    box: "border border-gold/30 bg-gradient-to-br from-gold/[0.14] to-gold/[0.03]",
    label: "text-gold",
    ring: "var(--gold)",
  },
  hot: {
    box: "border border-burgundy/40 bg-gradient-to-br from-burgundy-deep to-[#4d1320]",
    label: "text-[#f0d9a8]",
    ring: "#f0d9a8",
  },
  overdue: {
    box: "border border-burgundy/40 bg-gradient-to-br from-burgundy-deep to-[#4d1320]",
    label: "text-[#f0d9a8]",
    ring: "#f0d9a8",
  },
  done: { box: "sp-glass border", label: "text-muted", ring: "var(--muted)" },
};

function DeadlineHero({
  item,
  loaded,
  mode,
  onChanged,
}: {
  item?: OverviewItem;
  loaded: boolean;
  mode: Mode;
  onChanged: () => Promise<void>;
}) {
  const progress = useCountUp(1400, 150, `hero-${item?.id ?? "none"}`);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      console.error(err);
      window.alert("Не удалось сохранить. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  if (!item) {
    return (
      <div className="sp-glass flex min-h-44 flex-col justify-center rounded-3xl border px-6 py-6 sm:px-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">
          Ближайший дедлайн
        </p>
        <p className="mt-2 text-2xl font-light text-navy sm:text-3xl">
          {loaded ? "Пока нет дедлайнов" : "Загрузка…"}
        </p>
        {loaded && mode !== "parent" ? (
          <p className="mt-2 max-w-md text-sm text-muted">
            Загляните в ленту возможностей — там олимпиады, конкурсы и хакатоны
            с датами подачи.
          </p>
        ) : null}
      </div>
    );
  }

  const left = Math.max(0, daysLeft(item.dueDate));
  const urgency = urgencyOf(item);
  const tone = HERO_TONE[urgency];
  // Кольцо: сколько осталось от 30-дневного окна
  const fill = Math.min(1, left / 30) * progress;
  const shownDays = Math.round(left * progress);

  return (
    <div
      className={`relative overflow-hidden rounded-3xl px-6 py-6 sm:px-8 sm:py-7 ${tone.box}`}
    >
      <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p
            className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] ${tone.label}`}
          >
            {urgency === "hot" ? (
              <span className="sp-pulse inline-block size-2 rounded-full bg-[#f0d9a8]" aria-hidden />
            ) : null}
            Ближайший дедлайн · {CATEGORY_LABELS[item.category]}
          </p>
          <div className="mt-2 flex items-center gap-3">
            {item.url && !item.virtual ? <OpportunityLogo name={item.title} url={item.url} size={44} /> : null}
            <h3 className="text-2xl font-medium leading-snug text-white sm:text-[28px]">
              {item.title}
            </h3>
          </div>
          <p className="mt-2 text-sm text-white/70">
            {item.virtual ? "к следующей встрече · " : "подача до "}
            {formatDueDate(item.dueDate)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm text-[#f0d9a8] underline-offset-2 hover:underline"
              >
                Открыть сайт →
              </a>
            ) : null}
            {mode !== "parent" && !item.virtual ? (
              <select
                aria-label="Статус"
                value={item.status}
                disabled={busy}
                onChange={(e) =>
                  void run(() => updateDeadline(item.id, { status: e.target.value as DeadlineStatus }))
                }
                className="rounded-full border border-white/25 bg-black/20 px-3 py-1 text-xs text-white outline-none"
              >
                {(Object.keys(STATUS_LABELS) as DeadlineStatus[]).map((st) => (
                  <option key={st} value={st} className="text-black">
                    {STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            ) : null}
            {!item.virtual && (mode === "admin" || (mode === "student" && !item.createdByAdmin)) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Удалить «${item.title}»?`)) void run(() => deleteDeadline(item.id));
                }}
                className="text-xs text-white/60 underline-offset-2 hover:text-white hover:underline"
              >
                Удалить
              </button>
            ) : null}
          </div>
        </div>
        <div className="relative size-32 shrink-0 self-start sm:size-36 sm:self-auto">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r="52" pathLength={100} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={6} />
            <circle
              cx="60"
              cy="60"
              r="52"
              pathLength={100}
              fill="none"
              stroke={tone.ring}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={100}
              strokeDashoffset={100 - fill * 100}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            {left === 0 ? (
              <span className="text-2xl font-medium">сегодня</span>
            ) : (
              <>
                <span className="text-5xl font-light leading-none tracking-tight">
                  {shownDays}
                </span>
                <span className="mt-1 text-xs text-white/70">{daysWord(left)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Строка дедлайна ----------

const URGENCY_BADGE: Record<Urgency, string> = {
  calm: "border-white/10 text-muted",
  soon: "border-gold/40 text-gold",
  hot: "border-burgundy/50 bg-burgundy/10 text-burgundy",
  overdue: "border-burgundy/50 bg-burgundy/15 text-burgundy",
  done: "border-emerald-400/30 text-emerald-300",
};

function DeadlineRow({
  item,
  mode,
  onChanged,
}: {
  item: OverviewItem;
  mode: Mode;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const urgency = urgencyOf(item);
  const left = daysLeft(item.dueDate);
  const canSetStatus = mode !== "parent" && !item.virtual;
  const canDelete =
    !item.virtual && (mode === "admin" || (mode === "student" && !item.createdByAdmin));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      console.error(err);
      window.alert("Не удалось сохранить. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 transition hover:border-white/15 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
      {item.url && !item.virtual ? <OpportunityLogo name={item.title} url={item.url} size={36} /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-navy">{item.title}</span>
          {item.createdByAdmin && !item.virtual ? (
            <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[11px] text-gold">
              от ментора
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {CATEGORY_LABELS[item.category]} · {formatDueDate(item.dueDate)}
          {item.notes && !item.virtual ? ` · ${item.notes}` : ""}
          {item.url ? (
            <>
              {" · "}
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-navy-soft underline-offset-2 hover:underline"
              >
                сайт
              </a>
            </>
          ) : null}
        </p>
      </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${URGENCY_BADGE[urgency]}`}
        >
          {item.status === "planned"
            ? left >= 0
              ? `осталось ${formatDaysLeft(left)}`
              : formatDaysLeft(left)
            : STATUS_LABELS[item.status]}
        </span>
        {canSetStatus ? (
          <Select
            aria-label="Статус"
            value={item.status}
            disabled={busy}
            onChange={(e) =>
              void run(() =>
                updateDeadline(item.id, { status: e.target.value as DeadlineStatus }),
              )
            }
            className="!w-auto !rounded-full !py-1.5 text-xs"
          >
            {(Object.keys(STATUS_LABELS) as DeadlineStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        ) : null}
        {item.result && !(mode === "admin") ? (
          <span className="rounded-full border border-gold/50 bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold">
            {item.result === "prize" ? "🏆 " : "↗ "}
            {RESULT_LABELS[item.result]}
          </span>
        ) : null}
        {mode === "admin" && !item.virtual && item.status === "submitted" && ["olympiad", "contest", "hackathon"].includes(item.category) ? (
          <Select
            aria-label="Результат"
            value={item.result ?? ""}
            disabled={busy}
            onChange={(e) =>
              void run(() =>
                updateDeadline(item.id, { result: (e.target.value || null) as DeadlineResult | null }),
              )
            }
            className={`!w-auto !rounded-full !py-1.5 text-xs ${item.result ? "!border-gold/60 !text-gold" : ""}`}
          >
            <option value="">Результат: —</option>
            <option value="advanced">Прошёл дальше</option>
            <option value="prize">Призёр / победитель</option>
          </Select>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Удалить «${item.title}»?`)) {
                void run(() => deleteDeadline(item.id));
              }
            }}
            className="rounded-full px-2 py-1 text-xs text-muted transition hover:text-burgundy"
            aria-label={`Удалить ${item.title}`}
          >
            Удалить
          </button>
        ) : null}
      </div>
    </li>
  );
}

// ---------- Форма ----------

function AddDeadlineForm({
  studentId,
  asAdmin,
  onDone,
}: {
  studentId: string;
  asAdmin: boolean;
  onDone: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DeadlineCategory>("olympiad");
  const [dueDate, setDueDate] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!title.trim() || !dueDate) {
      setError("Укажите название и дату");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createDeadlines([studentId], { title, category, dueDate, url, notes }, asAdmin);
      await onDone();
    } catch (err) {
      console.error(err);
      setError("Не удалось сохранить дедлайн.");
      setBusy(false);
    }
  };

  return (
    <div className="sp-rise mt-4 grid gap-3 rounded-2xl border border-gold/25 bg-[#162030] p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label>Название</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: Республиканская олимпиада, школьный этап"
        />
      </div>
      <div>
        <Label>Тип</Label>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as DeadlineCategory)}
        >
          {(Object.keys(CATEGORY_LABELS) as DeadlineCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Дата подачи</Label>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div>
        <Label>Ссылка (необязательно)</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
      </div>
      <div>
        <Label>Заметка (необязательно)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="!min-h-0" rows={1} />
      </div>
      {error ? <p className="text-sm text-burgundy sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          {busy ? "Сохраняю…" : "Добавить дедлайн"}
        </Button>
      </div>
    </div>
  );
}

// ---------- Мотивация: серия и достижения ----------

const SQUARE: Record<string, string> = {
  present: "bg-burgundy",
  late: "bg-gold/70",
  absent: "bg-white/10 ring-1 ring-inset ring-burgundy/50",
};

function MotivationCard({
  student,
  meetings,
  deadlines,
  essays,
  grades,
  ready,
  mode,
}: {
  student: StudentProfile;
  meetings: Meeting[];
  deadlines: Deadline[];
  essays: EssaySubmission[] | null;
  grades: TermGrade[] | null;
  ready: boolean;
  mode: Mode;
}) {
  const streak = attendanceStreak(meetings);
  const squares = recentAttendance(meetings, 10);
  const badges = computeBadges(student, meetings, deadlines, { essays, grades });
  const progress = useCountUp(1200, 300, `streak-${student.id}`);

  return (
    <aside className="sp-glass sp-rise flex min-w-0 flex-[2_1_0%] flex-col gap-5 rounded-3xl border px-5 py-5 sm:px-6">
      <div>
        <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          Серия встреч
        </h3>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-5xl font-light leading-none tracking-tight text-navy">
            {Math.round(streak * progress)}
          </span>
          <span className="text-sm text-muted">
            {streak === 1 ? "встреча подряд" : streak >= 2 && streak <= 4 ? "встречи подряд" : "встреч подряд"}
          </span>
        </div>
        {squares.length > 0 ? (
          <div className="mt-3 flex gap-1.5" aria-label="Последние встречи">
            {squares.map((a, i) => (
              <span
                key={i}
                className={`size-5 rounded-md ${SQUARE[a]} transition-transform duration-500`}
                style={{
                  transform: `scale(${Math.min(1, Math.max(0, progress * 1.6 - i * 0.06))})`,
                }}
                title={a === "present" ? "был" : a === "late" ? "опоздал" : "пропуск"}
              />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Серия начнётся с первой встречи.</p>
        )}
      </div>

      <BadgesPanel badges={badges} studentId={student.id} ready={ready} celebrate={mode === "student"} />
    </aside>
  );
}
