"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StudentProfile } from "@/lib/types";
import { fetchAllMeetings, homeworkRating, type Meeting } from "@/lib/meetings";
import {
  CATEGORY_LABELS,
  daysLeft,
  fetchDeadlines,
  formatDaysLeft,
  formatDueDate,
  type Deadline,
} from "@/lib/deadlines";
import { currentMonthYearLabel } from "@/lib/monthly-progress";

type Severity = "high" | "medium" | "low";

interface Alert {
  key: string;
  studentId: string;
  studentName: string;
  severity: Severity;
  text: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_DOT: Record<Severity, string> = {
  high: "bg-burgundy",
  medium: "bg-gold",
  low: "bg-navy-soft",
};

function normalizeMonth(label: string): string {
  return label.toLowerCase().replace(/\s*г\.?\s*$/, "").replace(/\s+/g, " ").trim();
}

function daysSince(iso: string): number {
  return -daysLeft(iso);
}

function buildAlerts(
  students: StudentProfile[],
  meetings: Meeting[],
  deadlines: Deadline[],
): Alert[] {
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = normalizeMonth(currentMonthYearLabel(prevMonthDate));
  const prevMonthPrefix = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const alerts: Alert[] = [];

  for (const s of students) {
    const name = `${s.lastName} ${s.firstName}`.trim() || s.email;
    const own = meetings
      .filter((m) => m.studentId === s.id)
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));
    const push = (key: string, severity: Severity, text: string) =>
      alerts.push({ key: `${s.id}-${key}`, studentId: s.id, studentName: name, severity, text });

    const marked = own.filter((m) => m.attendance !== null);
    if (marked.length >= 2 && marked[0].attendance === "absent" && marked[1].attendance === "absent") {
      push("absent2", "high", "2 пропуска подряд");
    } else if (marked[0]?.attendance === "absent") {
      push("absent1", "medium", "Пропустил последнюю встречу");
    }

    if (own.length === 0) {
      push("nomeet", "low", "Ещё нет ни одной встречи в журнале");
    } else {
      const since = daysSince(own[0].meetingDate);
      if (since > 10) push("stale", "medium", `Не было встречи ${formatDaysLeft(since)}`);
    }

    const ratings = own.map(homeworkRating).filter((v): v is number => v !== null).slice(0, 2);
    if (ratings.length === 2 && (ratings[0] + ratings[1]) / 2 < 5) {
      push("hwlow", "medium", "Домашка просела: две последние ниже 5/10");
    }

    for (const d of deadlines.filter((x) => x.studentId === s.id && x.status === "planned")) {
      const left = daysLeft(d.dueDate);
      if (left < 0) {
        push(`over-${d.id}`, "high", `Просрочен дедлайн: ${d.title}`);
      } else if (left <= 3) {
        push(`hot-${d.id}`, "high", `${left === 0 ? "Сегодня" : `Через ${formatDaysLeft(left)}`}: ${d.title} — ещё не подал`);
      }
    }

    const hadMeetingsLastMonth = own.some((m) => m.meetingDate.startsWith(prevMonthPrefix));
    const hasReview = s.monthlyProgressReviews.some(
      (r) => normalizeMonth(r.monthYear) === prevMonth,
    );
    if (hadMeetingsLastMonth && !hasReview) {
      push("monthly", "low", `Нет месячного отчёта за ${prevMonth.charAt(0).toUpperCase()}${prevMonth.slice(1)}`);
    }
  }

  return alerts.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.studentName.localeCompare(b.studentName, "ru"),
  );
}

interface DeadlineGroup {
  key: string;
  title: string;
  category: Deadline["category"];
  dueDate: string;
  total: number;
  submitted: number;
  names: { name: string; status: Deadline["status"] }[];
}

function groupUpcoming(students: StudentProfile[], deadlines: Deadline[]): DeadlineGroup[] {
  const nameById = new Map(students.map((s) => [s.id, `${s.lastName} ${s.firstName}`.trim()]));
  const groups = new Map<string, DeadlineGroup>();
  for (const d of deadlines) {
    if (daysLeft(d.dueDate) < 0 || !nameById.has(d.studentId)) continue;
    const key = d.groupKey ?? d.opportunityId ?? `${d.title}|${d.dueDate}`;
    const g =
      groups.get(key) ??
      { key, title: d.title, category: d.category, dueDate: d.dueDate, total: 0, submitted: 0, names: [] };
    g.total += 1;
    if (d.status === "submitted") g.submitted += 1;
    g.names.push({ name: nameById.get(d.studentId) ?? "—", status: d.status });
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
}

export function AttentionPanel({ students }: { students: StudentProfile[] }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([fetchAllMeetings(), fetchDeadlines()]).then(([m, d]) => {
      if (cancelled) return;
      if (m.status === "fulfilled") setMeetings(m.value);
      if (d.status === "fulfilled") setDeadlines(d.value);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const alerts = useMemo(() => buildAlerts(students, meetings, deadlines), [students, meetings, deadlines]);
  const groups = useMemo(() => groupUpcoming(students, deadlines), [students, deadlines]);
  const high = alerts.filter((a) => a.severity === "high").length;
  const visible = showAll ? alerts : alerts.slice(0, 8);

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <section className="sp-glass min-w-0 flex-[3_1_0%] rounded-3xl border px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">
            Что требует внимания
          </h3>
          {loaded ? (
            <span className="text-xs text-muted">
              {alerts.length === 0
                ? "всё спокойно"
                : `${alerts.length} ${alerts.length === 1 ? "пункт" : alerts.length < 5 ? "пункта" : "пунктов"}${high ? ` · ${high} срочно` : ""}`}
            </span>
          ) : null}
        </div>

        {!loaded ? (
          <p className="mt-4 text-sm text-muted">Собираю данные…</p>
        ) : alerts.length === 0 ? (
          <p className="mt-4 text-2xl font-light text-navy">Все ученики в порядке</p>
        ) : (
          <ul className="mt-3 flex flex-col">
            {visible.map((a) => (
              <li key={a.key} className="border-t border-white/[0.06] first:border-t-0">
                <Link
                  href={`/admin/students/${a.studentId}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.04]"
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]} ${a.severity === "high" ? "sp-pulse" : ""}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 text-sm text-navy">
                    <span className="font-medium">{a.studentName}</span>
                    <span className="text-muted"> — {a.text}</span>
                  </span>
                  <span className="text-muted" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {alerts.length > 8 ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 text-sm text-muted underline-offset-2 hover:text-navy hover:underline"
          >
            {showAll ? "Свернуть" : `Показать все (${alerts.length})`}
          </button>
        ) : null}
      </section>

      <section className="sp-glass min-w-0 flex-[2_1_0%] rounded-3xl border px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            Ближайшие дедлайны
          </h3>
          <Link href="/opportunities" className="text-xs text-gold underline-offset-2 hover:underline">
            Лента возможностей →
          </Link>
        </div>
        {loaded && groups.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Пока пусто. Добавьте олимпиаду ученикам из ленты возможностей.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {groups.map((g) => {
              const left = daysLeft(g.dueDate);
              return (
                <li key={g.key} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-navy" title={g.title}>{g.title}</p>
                      <p className="text-xs text-muted">
                        {CATEGORY_LABELS[g.category]} · {formatDueDate(g.dueDate)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${left <= 3 ? "border-burgundy/50 text-burgundy" : left <= 14 ? "border-gold/40 text-gold" : "border-white/10 text-muted"}`}
                    >
                      {formatDaysLeft(left)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                        style={{ width: `${(g.submitted / g.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted" title={g.names.map((n) => `${n.name}: ${n.status === "submitted" ? "подал" : n.status === "skipped" ? "не будет" : "готовится"}`).join("\n")}>
                      подали {g.submitted}/{g.total}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
