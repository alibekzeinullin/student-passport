"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StudentProfile } from "@/lib/types";
import type { MeetingFormat } from "@/lib/meetings";
import { useStudents } from "@/context/StudentsContext";
import {
  addDays,
  cellState,
  fetchAttendance,
  peekFetchAttendance,
  findCell,
  mondayOf,
  parseIso,
  todayLocalIso,
  weekLabel,
  type AttendanceMeeting,
} from "@/lib/attendance";
import {
  fetchInvites,
  peekFetchInvites,
  hasIndividualThisWeek,
  inviteKey,
  saturdayOf,
  setInvited,
  studentParity,
  weekParity,
  type Invite,
} from "@/lib/schedule";
import { CELL_WORD } from "@/components/attendance/cell-styles";

const HISTORY_FROM = "2025-08-01";

function errorText(err: unknown): string {
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  if (msg.includes("meeting_invites") || msg.includes("ind_parity")) {
    return "График ещё не подключён: выполните supabase/migration-schedule.sql в Supabase → SQL Editor.";
  }
  return "Не удалось сохранить. Попробуйте ещё раз.";
}

export function AttendancePlan({ students }: { students: StudentProfile[] }) {
  const { updateStudent } = useStudents();
  const thisMonday = mondayOf(todayLocalIso());
  const nextMonday = addDays(thisMonday, 7);
  const [meetings, setMeetings] = useState<AttendanceMeeting[]>(
    () => peekFetchAttendance(HISTORY_FROM, addDays(nextMonday, 6)) ?? [],
  );
  const [invites, setInvites] = useState<Invite[]>(() => peekFetchInvites(thisMonday, nextMonday) ?? []);
  const [loaded, setLoaded] = useState(() => peekFetchInvites(thisMonday, nextMonday) !== undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.allSettled([
        fetchAttendance(HISTORY_FROM, addDays(nextMonday, 6)),
        fetchInvites(thisMonday, nextMonday),
      ]),
    [thisMonday, nextMonday],
  );

  const apply = useCallback((r: Awaited<ReturnType<typeof load>>) => {
    if (r[0].status === "fulfilled") setMeetings(r[0].value);
    if (r[1].status === "fulfilled") {
      setInvites(r[1].value);
    } else {
      console.error(r[1].reason);
      setError(errorText(r[1].reason));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [load, apply]);

  const invitedSet = useMemo(
    () => new Set(invites.map((i) => inviteKey(i.studentId, i.weekMonday, i.format))),
    [invites],
  );

  const parities = useMemo(
    () => new Map(students.map((s) => [s.id, studentParity(s, meetings)])),
    [students, meetings],
  );

  const toggleInvite = async (items: { studentId: string; weekMonday: string; format: MeetingFormat }[], invited: boolean, key: string) => {
    setBusy(key);
    setError("");
    try {
      await setInvited(items, invited);
      apply(await load());
    } catch (err) {
      console.error(err);
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const setParity = async (student: StudentProfile, parity: 0 | 1, key: string) => {
    setBusy(key);
    setError("");
    try {
      await updateStudent(student.id, { indParity: parity });
    } catch (err) {
      console.error(err);
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const unscheduled = students.filter((s) => parities.get(s.id)?.parity === null);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Групповая — каждую субботу у всех. Индивидуальная — раз в 2 недели, у каждого ученика своя неделя. Отмечайте, кому уже отправили приглашение (например, в Битриксе).
      </p>

      {error ? (
        <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div>
      ) : null}

      {unscheduled.length > 0 && loaded ? (
        <section className="rounded-3xl border border-gold/30 bg-gold/[0.06] px-5 py-4">
          <h3 className="text-base font-medium text-navy">Без графика индивидуальных · {unscheduled.length}</h3>
          <p className="mt-1 text-xs text-muted">У них ещё нет индивидуальных встреч — выберите, с какой недели начать.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {unscheduled.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm text-navy">{s.lastName} {s.firstName}</span>
                <button
                  type="button"
                  disabled={busy === `p-${s.id}`}
                  onClick={() => void setParity(s, weekParity(thisMonday), `p-${s.id}`)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-navy hover:border-gold/60"
                >
                  с этой недели
                </button>
                <button
                  type="button"
                  disabled={busy === `p-${s.id}`}
                  onClick={() => void setParity(s, weekParity(nextMonday), `p-${s.id}`)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-navy hover:border-gold/60"
                >
                  со следующей
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {[
          { monday: thisMonday, title: "Эта неделя" },
          { monday: nextMonday, title: "Следующая неделя" },
        ].map(({ monday, title }) => {
          const individuals = students.filter((s) =>
            hasIndividualThisWeek(parities.get(s.id)?.parity ?? null, monday),
          );
          const groupItems = students.map((s) => ({ studentId: s.id, weekMonday: monday, format: "group" as const }));
          const indItems = individuals.map((s) => ({ studentId: s.id, weekMonday: monday, format: "individual" as const }));
          const invitedCount = [...groupItems, ...indItems].filter((i) => invitedSet.has(inviteKey(i.studentId, i.weekMonday, i.format))).length;
          const total = groupItems.length + indItems.length;
          const groupInvited = groupItems.filter((i) => invitedSet.has(inviteKey(i.studentId, monday, "group"))).length;
          const pct = total ? (invitedCount / total) * 100 : 0;

          return (
            <section key={monday} className="sp-glass flex flex-col gap-5 rounded-3xl border p-5">
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xl font-light text-navy">
                    {title} <span className="text-muted">· {weekLabel(monday)}</span>
                  </h3>
                  <span className="text-xs text-muted">приглашены {loaded ? `${invitedCount}/${total}` : "…"}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-navy-soft">
                    Групповая · суббота, {parseIso(saturdayOf(monday)).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                  </h4>
                  <button
                    type="button"
                    disabled={busy === `ga-${monday}` || students.length === 0}
                    onClick={() =>
                      void toggleInvite(
                        groupItems.filter((i) => !invitedSet.has(inviteKey(i.studentId, monday, "group"))),
                        true,
                        `ga-${monday}`,
                      )
                    }
                    className="rounded-full border border-gold/40 px-3 py-1.5 text-xs text-gold transition hover:bg-gold/10 disabled:opacity-50"
                  >
                    {groupInvited === students.length && students.length > 0 ? "Все приглашены ✓" : "Пригласил всех"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {students.map((s) => {
                    const on = invitedSet.has(inviteKey(s.id, monday, "group"));
                    const key = `g-${monday}-${s.id}`;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        disabled={busy === key}
                        onClick={() => void toggleInvite([{ studentId: s.id, weekMonday: monday, format: "group" }], !on, key)}
                        className={`rounded-full border px-3 py-1.5 text-[13px] transition ${
                          on ? "border-gold/50 bg-gold/15 text-navy" : "border-white/10 text-muted hover:text-navy"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {s.lastName} {s.firstName.charAt(0)}.
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-burgundy">
                  Индивидуальные · {individuals.length}
                </h4>
                {individuals.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">На этой неделе индивидуальных нет.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {individuals.map((s) => {
                      const on = invitedSet.has(inviteKey(s.id, monday, "individual"));
                      const key = `i-${monday}-${s.id}`;
                      const met = findCell(meetings, s.id, monday, "individual");
                      const info = parities.get(s.id);
                      return (
                        <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                          <div className="min-w-0 flex-[1_1_160px]">
                            <Link href={`/admin/students/${s.id}`} className="text-sm text-navy underline-offset-2 hover:underline">
                              {s.lastName} {s.firstName}
                            </Link>
                            <p className="text-[11px] text-muted">
                              {s.className}
                              {met ? ` · встреча: ${CELL_WORD[cellState(met)]}` : ""}
                              {info?.source === "history" ? " · график по истории" : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-pressed={on}
                            disabled={busy === key}
                            onClick={() => void toggleInvite([{ studentId: s.id, weekMonday: monday, format: "individual" }], !on, key)}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              on ? "border-gold/50 bg-gold/15 text-navy" : "border-white/15 text-muted hover:text-navy"
                            }`}
                          >
                            {on ? "✓ приглашён" : "отметить приглашение"}
                          </button>
                          <button
                            type="button"
                            disabled={busy === `p-${s.id}`}
                            title="Встречу перенесли: дальше график пойдёт со следующей недели"
                            onClick={() => {
                              const current = info?.parity ?? weekParity(monday);
                              void setParity(s, (1 - current) as 0 | 1, `p-${s.id}`);
                            }}
                            className="rounded-full px-2 py-1.5 text-xs text-muted transition hover:text-gold"
                          >
                            сдвинуть на неделю
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
