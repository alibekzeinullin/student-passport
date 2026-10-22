"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { Select } from "@/components/ui/Field";
import { useStudents } from "@/context/StudentsContext";
import {
  FIELD_LABELS,
  ROLE_LABELS,
  describeEntry,
  describeValue,
  fetchActivity,
  type ActivityAction,
  type ActivityEntry,
} from "@/lib/activity";

const PERIODS = [
  { key: "1", label: "Сегодня", days: 1 },
  { key: "7", label: "7 дней", days: 7 },
  { key: "30", label: "30 дней", days: 30 },
  { key: "90", label: "3 месяца", days: 90 },
] as const;

const ROLE_DOT: Record<string, string> = {
  admin: "bg-gold",
  student: "bg-burgundy",
  parent: "bg-navy-soft",
  system: "bg-white/30",
};

function sinceIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

export default function ActivityPage() {
  const { students } = useStudents();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("7");
  const [role, setRole] = useState("");
  const [studentId, setStudentId] = useState("");
  const [action, setAction] = useState<ActivityAction | "changes" | "">("");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const days = PERIODS.find((p) => p.key === period)?.days ?? 7;
  const load = useCallback(
    () =>
      fetchActivity({
        sinceIso: sinceIso(days),
        studentId: studentId || undefined,
        actorRole: role || undefined,
        action: action || undefined,
      }),
    [days, studentId, role, action],
  );

  useEffect(() => {
    let cancelled = false;
    load().then(
      (rows) => {
        if (cancelled) return;
        setEntries(rows);
        setError("");
        setLoaded(true);
      },
      (err: unknown) => {
        if (cancelled) return;
        console.error(err);
        const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
        setError(
          msg.includes("activity_log")
            ? "История ещё не подключена: выполните supabase/migration-activity.sql в Supabase → SQL Editor."
            : "Не удалось загрузить историю.",
        );
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  const nameById = useMemo(
    () => new Map(students.map((s) => [s.id, `${s.lastName} ${s.firstName}`.trim()])),
    [students],
  );

  const groups = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const e of entries) {
      const key = new Date(e.at).toDateString();
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.values()];
  }, [entries]);

  const logins = entries.filter((e) => e.action === "login");
  const studentLogins = new Set(logins.filter((e) => e.actorRole === "student").map((e) => e.actorId)).size;
  const parentViews = entries.filter((e) => e.action === "parent_view").length;
  const changes = entries.filter((e) => ["insert", "update", "delete"].includes(e.action)).length;

  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">История</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Кто заходил и что менял</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Записывается автоматически: входы, изменения профилей, встреч, дедлайнов и оценок, открытия ссылки родителями. Видите только вы.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Учеников заходили" value={loaded ? String(studentLogins) : "…"} />
          <Stat label="Родители открывали ссылку" value={loaded ? String(parentViews) : "…"} />
          <Stat label="Изменений" value={loaded ? String(changes) : "…"} />
        </div>

        <div className="sp-glass flex flex-wrap items-center gap-3 rounded-3xl border px-4 py-3">
          <div role="group" aria-label="Период" className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={period === p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-full px-3 py-1.5 transition ${period === p.key ? "bg-gold text-gold-ink" : "text-muted hover:text-navy"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Select aria-label="Кто" value={role} onChange={(e) => setRole(e.target.value)} className="!w-auto !rounded-full !py-1.5">
            <option value="">Все</option>
            <option value="student">Ученики</option>
            <option value="parent">Родители</option>
            <option value="admin">Я (ментор)</option>
          </Select>
          <Select aria-label="Действие" value={action} onChange={(e) => setAction(e.target.value as ActivityAction | "changes" | "")} className="!w-auto !rounded-full !py-1.5">
            <option value="">Все действия</option>
            <option value="login">Входы</option>
            <option value="changes">Изменения</option>
            <option value="parent_view">Ссылка родителя</option>
          </Select>
          <Select aria-label="Ученик" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="!w-auto !max-w-[16rem] !rounded-full !py-1.5">
            <option value="">Все ученики</option>
            {[...students]
              .sort((a, b) => a.lastName.localeCompare(b.lastName, "ru"))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lastName} {s.firstName}
                </option>
              ))}
          </Select>
        </div>

        {error ? (
          <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div>
        ) : null}

        {loaded && !error && entries.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted">
            За этот период ничего не происходило.
          </p>
        ) : null}

        <div className="flex flex-col gap-5">
          {groups.map((list) => (
            <section key={list[0].id}>
              <h3 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted first-letter:uppercase">
                {dayLabel(list[0].at)}
              </h3>
              <ul className="sp-glass rounded-3xl border px-2 py-1">
                {list.map((e) => {
                  const student = e.studentId ? nameById.get(e.studentId) : undefined;
                  const actor =
                    e.actorRole === "parent"
                      ? `Родитель${student ? ` (${student})` : ""}`
                      : e.actorName || ROLE_LABELS[e.actorRole] || "—";
                  const aboutOther = student && e.actorRole === "admin";
                  const details = Object.entries(e.changes).filter(([k]) => e.action === "update" && e.fields.includes(k));
                  const open = openId === e.id;
                  return (
                    <li key={e.id} className="border-t border-white/[0.05] first:border-t-0">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : e.id)}
                        disabled={details.length === 0}
                        aria-expanded={details.length ? open : undefined}
                        className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition enabled:hover:bg-white/[0.03]"
                      >
                        <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-muted">
                          {new Date(e.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${ROLE_DOT[e.actorRole] ?? "bg-white/30"}`} aria-hidden />
                        <span className="min-w-0 flex-1 text-sm text-navy">
                          <span className="font-medium">{actor}</span>{" "}
                          <span className="text-muted">{describeEntry(e)}</span>
                          {aboutOther ? (
                            <>
                              {" · "}
                              <Link href={`/admin/students/${e.studentId}`} onClick={(ev) => ev.stopPropagation()} className="text-gold underline-offset-2 hover:underline">
                                {student}
                              </Link>
                            </>
                          ) : null}
                        </span>
                        {details.length ? <span className="text-xs text-muted" aria-hidden>{open ? "▲" : "▼"}</span> : null}
                      </button>
                      {open && details.length ? (
                        <dl className="mb-2 ml-[4.25rem] mr-3 grid gap-x-4 gap-y-1 rounded-2xl bg-black/15 px-4 py-3 text-xs sm:grid-cols-[160px_minmax(0,1fr)]">
                          {details.map(([field, value]) => {
                            const [before, after] = Array.isArray(value) ? value : [undefined, value];
                            return (
                              <div key={field} className="contents">
                                <dt className="text-muted first-letter:uppercase">{FIELD_LABELS[field] ?? field}</dt>
                                <dd className="m-0 break-words text-navy">
                                  {before === "…" || after === "…" ? (
                                    "изменён список"
                                  ) : (
                                    <>
                                      <span className="text-muted line-through decoration-white/30">{describeValue(field, before)}</span>
                                      {" → "}
                                      {describeValue(field, after)}
                                    </>
                                  )}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        {entries.length >= 500 ? (
          <p className="text-xs text-muted">Показаны последние 500 событий — сузьте период или выберите ученика.</p>
        ) : null}
      </div>
    </RequireAuth>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sp-glass rounded-3xl border px-5 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-4xl font-light text-navy">{value}</p>
    </div>
  );
}
