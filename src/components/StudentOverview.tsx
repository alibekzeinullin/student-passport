"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StudentProfile } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  addDaysIso,
  createDeadlines,
  daysLeft,
  daysWord,
  deleteDeadline,
  fetchDeadlines,
  fetchDeadlinesByParentToken,
  formatDaysLeft,
  formatDueDate,
  isTableMissing,
  updateDeadline,
  urgencyOf,
  type Deadline,
  type DeadlineCategory,
  type DeadlineStatus,
  type Urgency,
} from "@/lib/deadlines";
import {
  fetchMeetingsByParentToken,
  fetchMeetingsForStudent,
  type Meeting,
} from "@/lib/meetings";
import {
  attendanceStreak,
  computeBadges,
  recentAttendance,
  type Badge,
} from "@/lib/achievements";
import { useCountUp } from "@/lib/use-count-up";

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
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, [load, apply]);

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

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <section className="sp-rise flex min-w-0 flex-[3_1_0%] flex-col gap-4">
        {error ? (
          <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">
            {error}
          </div>
        ) : null}

        <DeadlineHero item={hero} loaded={loaded} mode={mode} />

        <div className="sp-glass rounded-3xl border px-4 py-4 sm:px-6 sm:py-5">
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
      />
    </div>
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
}: {
  item?: OverviewItem;
  loaded: boolean;
  mode: Mode;
}) {
  const progress = useCountUp(1400, 150);

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
          <h3 className="mt-2 text-2xl font-medium leading-snug text-white sm:text-[28px]">
            {item.title}
          </h3>
          <p className="mt-2 text-sm text-white/70">
            {item.virtual ? "к следующей встрече · " : "подача до "}
            {formatDueDate(item.dueDate)}
          </p>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-sm text-[#f0d9a8] underline-offset-2 hover:underline"
            >
              Открыть сайт →
            </a>
          ) : null}
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
}: {
  student: StudentProfile;
  meetings: Meeting[];
  deadlines: Deadline[];
}) {
  const streak = attendanceStreak(meetings);
  const squares = recentAttendance(meetings, 10);
  const badges = computeBadges(student, meetings, deadlines);
  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned);
  const progress = useCountUp(1200, 300);

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

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            Достижения
          </h3>
          <span className="text-xs text-muted">
            {earned.length} из {badges.length}
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {[...earned, ...locked].slice(0, 9).map((b) => (
            <BadgeTile key={b.id} badge={b} />
          ))}
        </ul>
      </div>
    </aside>
  );
}

function BadgeTile({ badge }: { badge: Badge }) {
  return (
    <li
      className={`flex flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-3 text-center ${
        badge.earned
          ? "border-gold/30 bg-gold/[0.08]"
          : "border-white/[0.06] bg-white/[0.02] opacity-55"
      }`}
      title={badge.earned ? badge.title : `Как получить: ${badge.hint}`}
    >
      <BadgeIcon icon={badge.icon} earned={badge.earned} />
      <span className={`text-[11px] leading-tight ${badge.earned ? "text-navy" : "text-muted"}`}>
        {badge.title}
      </span>
      <span className="sr-only">
        {badge.earned ? "получено" : `не получено: ${badge.hint}`}
      </span>
    </li>
  );
}

function BadgeIcon({ icon, earned }: { icon: Badge["icon"]; earned: boolean }) {
  const stroke = earned ? "var(--gold)" : "var(--muted)";
  const paths: Record<Badge["icon"], React.ReactNode> = {
    flame: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" />,
    star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
    book: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7" />,
    trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6" />,
    target: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01" />,
    rocket: <path d="M14 4c3 0 6 3 6 6l-6 6-6-6c0-3 3-6 6-6zM8 16l-3 3M10 18l-2 3M6 14l-3 2M15 9h.01" />,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
    check: <path d="M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0zM8.5 12l2.5 2.5 4.5-5" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={earned ? { filter: "drop-shadow(0 0 6px rgba(203,176,115,.45))" } : undefined}
    >
      {paths[icon]}
    </svg>
  );
}
