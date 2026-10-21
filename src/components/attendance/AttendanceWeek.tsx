"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StudentProfile } from "@/lib/types";
import type { Attendance } from "@/lib/meetings";
import { isMeetingsTableMissing } from "@/lib/meetings";
import {
  addDays,
  cellState,
  defaultDateInWeek,
  fetchAttendance,
  findCell,
  individualDue,
  insertMeetings,
  isGroupWeekly,
  mondayOf,
  moveGroupSession,
  newSessionKey,
  setAttendance,
  todayLocalIso,
  weekLabel,
  weekdayLabel,
  type AttendanceMeeting,
  type CellState,
} from "@/lib/attendance";
import { DOT_CLASS } from "@/components/attendance/cell-styles";
import { hasIndividualThisWeek, studentParity } from "@/lib/schedule";

const HISTORY_WEEKS = 6;

function errorText(err: unknown): string {
  if (isMeetingsTableMissing(err)) {
    return "Журнал встреч не подключён: выполните миграции из SUPABASE_SETUP.md.";
  }
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : "";
  if (msg.includes("session_key")) {
    return "Таблица посещаемости ещё не подключена: выполните supabase/migration-attendance.sql в Supabase → SQL Editor.";
  }
  return "Не удалось сохранить отметку. Попробуйте ещё раз.";
}

export function AttendanceWeek({ students }: { students: StudentProfile[] }) {
  const [monday, setMonday] = useState(() => mondayOf(todayLocalIso()));
  const [meetings, setMeetings] = useState<AttendanceMeeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const from = addDays(monday, -7 * (HISTORY_WEEKS - 1));
  const sunday = addDays(monday, 6);

  const fetchRange = useCallback(() => fetchAttendance(from, sunday), [from, sunday]);

  useEffect(() => {
    let cancelled = false;
    fetchRange().then(
      (rows) => {
        if (cancelled) return;
        setMeetings(rows);
        setLoaded(true);
      },
      (err: unknown) => {
        if (cancelled) return;
        console.error(err);
        setError(errorText(err));
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchRange]);

  const reload = async () => {
    try {
      setMeetings(await fetchRange());
    } catch (err) {
      console.error(err);
    }
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try {
      await fn();
      await reload();
    } catch (err) {
      console.error(err);
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  // --- Групповая встреча этой недели ---
  const groupRows = useMemo(
    () =>
      meetings.filter(
        (m) => m.format === "group" && m.meetingDate >= monday && m.meetingDate <= sunday,
      ),
    [meetings, monday, sunday],
  );
  const groupDate = groupRows[0]?.meetingDate ?? defaultDateInWeek(monday, "group");
  const groupKey = groupRows.find((m) => m.sessionKey)?.sessionKey ?? null;
  const [pendingGroupDate, setPendingGroupDate] = useState<string | null>(null);

  // --- Сводка ---
  const indStates = students.map((s) => cellState(findCell(meetings, s.id, monday, "individual")));
  const groupWeekly = isGroupWeekly(monday);
  // До 10 октября групповая была раз в 2 недели: в неделю без индивидуальной
  const groupExpected = groupWeekly
    ? students
    : students.filter(
        (s, i) =>
          indStates[i] === "none" || cellState(findCell(meetings, s.id, monday, "group")) !== "none",
      );
  const groupOthers = students.filter((s) => !groupExpected.includes(s));
  const grpStates = groupExpected.map((s) => cellState(findCell(meetings, s.id, monday, "group")));
  const came = (list: CellState[]) => list.filter((x) => x === "present" || x === "late").length;
  const scheduled = (list: CellState[]) => list.filter((x) => x !== "none").length;
  const indScheduled = scheduled(indStates);
  const grpScheduled = scheduled(grpStates);
  const unmarked = indStates.filter((x) => x === "unmarked").length + grpStates.filter((x) => x === "unmarked").length;
  const isCurrentWeek = monday === mondayOf(todayLocalIso());

  const setInd = (s: StudentProfile, target: CellState) => {
    const existing = findCell(meetings, s.id, monday, "individual");
    const current = cellState(existing);
    const next: CellState = current === target ? "none" : target;
    void run(`ind-${s.id}`, () =>
      setAttendance({
        existing,
        studentId: s.id,
        format: "individual",
        date: existing?.meetingDate ?? defaultDateInWeek(monday, "individual"),
        state: next,
      }),
    );
  };

  const cycleGroup = (s: StudentProfile) => {
    const existing = findCell(meetings, s.id, monday, "group");
    const current = cellState(existing);
    const next: CellState =
      current === "none" || current === "unmarked" ? "present" : current === "present" || current === "late" ? "absent" : "none";
    void run(`grp-${s.id}`, () =>
      setAttendance({
        existing,
        studentId: s.id,
        format: "group",
        date: groupDate,
        state: next,
        sessionKey: groupKey ?? newSessionKey(),
      }),
    );
  };

  const allCame = () => {
    const key = groupKey ?? newSessionKey();
    void run("grp-all", async () => {
      const toInsert: { studentId: string; date: string; format: "group"; attendance: Attendance; sessionKey: string | null }[] = [];
      for (const s of groupExpected) {
        const existing = findCell(meetings, s.id, monday, "group");
        if (!existing) {
          toInsert.push({ studentId: s.id, date: groupDate, format: "group", attendance: "present", sessionKey: key });
        } else if (existing.attendance !== "present" && existing.attendance !== "late") {
          await setAttendance({ existing, studentId: s.id, format: "group", date: groupDate, state: "present" });
        }
      }
      await insertMeetings(toInsert);
    });
  };

  const historyFor = (studentId: string) =>
    Array.from({ length: HISTORY_WEEKS }, (_, i) => {
      const wk = addDays(monday, -7 * (HISTORY_WEEKS - 1 - i));
      return cellState(findCell(meetings, studentId, wk, "individual"));
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setMonday((m) => addDays(m, -7))}
          aria-label="Предыдущая неделя"
          className="size-10 rounded-full border border-white/15 text-navy transition hover:bg-white/5"
        >
          ←
        </button>
        <h3 className="min-w-48 text-center text-2xl font-light text-navy">
          {weekLabel(monday, true)}
        </h3>
        <button
          type="button"
          onClick={() => setMonday((m) => addDays(m, 7))}
          aria-label="Следующая неделя"
          className="size-10 rounded-full border border-white/15 text-navy transition hover:bg-white/5"
        >
          →
        </button>
        {!isCurrentWeek ? (
          <button
            type="button"
            onClick={() => setMonday(mondayOf(todayLocalIso()))}
            className="rounded-full border border-gold/40 px-4 py-2 text-sm text-gold transition hover:bg-gold/10"
          >
            К этой неделе
          </button>
        ) : (
          <span className="text-xs uppercase tracking-[0.14em] text-gold">эта неделя</span>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Индивидуальные" value={came(indStates)} total={indScheduled} color="bg-burgundy" />
        <Kpi
          label={`Групповая · ${weekdayLabel(groupDate)}${groupWeekly ? "" : " · раз в 2 нед."}`}
          value={came(grpStates)}
          total={grpScheduled}
          color="bg-navy-soft"
        />
        <div
          className={`rounded-3xl border px-5 py-4 ${
            unmarked > 0
              ? "border-burgundy/40 bg-gradient-to-br from-burgundy-deep to-[#4d1320]"
              : "sp-glass"
          }`}
        >
          <p className={`text-xs ${unmarked > 0 ? "text-[#f0d9a8]" : "text-muted"}`}>Встречи без отметки</p>
          <p className="mt-1 text-4xl font-light leading-none text-white">{loaded ? unmarked : "…"}</p>
          <p className={`mt-2 text-xs ${unmarked > 0 ? "text-[#e9c9cf]" : "text-muted"}`}>
            {unmarked > 0 ? "назначены, но посещение не отмечено" : "всё отмечено"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <section className="sp-glass min-w-0 flex-[3_1_0%] rounded-3xl border p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2 px-1 pb-3">
            <h3 className="text-lg font-medium text-navy">Индивидуальные встречи</h3>
            <span className="text-xs text-muted">история {HISTORY_WEEKS} недель</span>
          </div>
          <ul className="flex flex-col gap-2">
            {students.map((s, i) => {
              const existing = findCell(meetings, s.id, monday, "individual");
              const state = indStates[i];
              const name = `${s.lastName} ${s.firstName}`.trim();
              return (
                <li
                  key={s.id}
                  className={`flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 ${
                    s.status === "paused" ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-[1_1_180px]">
                    <Link
                      href={`/admin/students/${s.id}`}
                      className="text-[15px] text-navy underline-offset-2 hover:underline"
                    >
                      {name}
                    </Link>
                    <p className="text-xs text-muted">
                      {s.className}
                      {existing ? ` · ${weekdayLabel(existing.meetingDate)}` : ""}
                      {!existing ? (
                        <DueTag
                          due={(() => {
                            const { parity } = studentParity(s, meetings);
                            if (parity === null) return individualDue(meetings, s.id, monday);
                            return hasIndividualThisWeek(parity, monday) ? "due" : "off";
                          })()}
                        />
                      ) : null}
                    </p>
                  </div>
                  <div className="flex gap-1" aria-label="История за прошлые недели">
                    {historyFor(s.id).map((h, k) => (
                      <span key={k} className={`size-3 rounded-[4px] ${DOT_CLASS[h]}`} />
                    ))}
                  </div>
                  <div
                    role="group"
                    aria-label={`Посещение: ${name}`}
                    className="flex rounded-full border border-white/10 bg-black/15 p-[3px]"
                  >
                    {(
                      [
                        ["present", "Был", "bg-burgundy text-[#121b29]"],
                        ["late", "Опоздал", "bg-gold text-gold-ink"],
                        ["absent", "Не был", "bg-burgundy/20 text-[#f2a3b1]"],
                      ] as const
                    ).map(([key, label, on]) => (
                      <button
                        key={key}
                        type="button"
                        disabled={busy === `ind-${s.id}`}
                        aria-pressed={state === key}
                        onClick={() => setInd(s, key)}
                        className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                          state === key ? on : "text-muted hover:text-navy"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
            {students.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-muted">Нет активных учеников.</li>
            ) : null}
          </ul>
          <p className="mt-3 px-1 text-xs text-muted">
            Повторное нажатие снимает отметку («не назначена»). Отметка сразу попадает в журнал ученика и в его баллы.
          </p>
        </section>

        <section className="sp-glass min-w-0 flex-[2_1_0%] rounded-3xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium text-navy">Групповая встреча</h3>
              <p className="mt-0.5 text-xs text-muted">
                {groupWeekly
                  ? "каждую неделю (с 10 октября)"
                  : "раз в 2 недели — у тех, у кого на этой неделе нет индивидуальной"}
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm text-muted">
                Дата
                <input
                  type="date"
                  min={monday}
                  max={sunday}
                  value={pendingGroupDate ?? groupDate}
                  onChange={(e) => setPendingGroupDate(e.target.value)}
                  onBlur={() => {
                    const d = pendingGroupDate;
                    setPendingGroupDate(null);
                    if (d && d !== groupDate && groupRows.length > 0) {
                      void run("grp-date", () => moveGroupSession(groupRows.map((m) => m.id), d));
                    }
                  }}
                  className="rounded-xl border border-white/10 bg-field px-2 py-1 text-navy"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy === "grp-all" || groupExpected.length === 0}
              onClick={allCame}
              className="rounded-full border border-gold/50 px-4 py-2 text-sm text-gold transition hover:bg-gold/10 disabled:opacity-50"
            >
              Все пришли
            </button>
          </div>
          <p className="mb-3 mt-3 text-xs text-muted">
            Нажатие: пришёл → не пришёл → снять отметку.
          </p>
          <div className="flex flex-wrap gap-2">
            {groupExpected.map((s, i) => {
              const st = grpStates[i];
              const on = st === "present" || st === "late";
              const off = st === "absent";
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy === `grp-${s.id}` || busy === "grp-all"}
                  aria-pressed={on}
                  onClick={() => cycleGroup(s)}
                  className={`rounded-full border px-3.5 py-2 text-sm transition hover:-translate-y-px ${
                    on
                      ? "border-navy-soft/60 bg-navy-soft/20 text-navy"
                      : off
                        ? "border-burgundy/50 text-burgundy line-through decoration-1"
                        : "border-white/12 text-muted hover:text-navy"
                  }`}
                >
                  {on ? "✓ " : off ? "× " : ""}
                  {s.lastName} {s.firstName.charAt(0)}.
                </button>
              );
            })}
          </div>
          {groupOthers.length > 0 ? (
            <p className="mt-3 text-xs text-muted">
              На этой неделе у них индивидуальная: {groupOthers.map((s) => `${s.lastName} ${s.firstName.charAt(0)}.`).join(", ")}
            </p>
          ) : null}
          <p className="mt-4 rounded-2xl bg-navy-soft/10 px-4 py-3 text-xs leading-relaxed text-muted">
            Групповая встреча записывается в журнал каждого ученика с форматом «Групповая» и учитывается в посещаемости.
          </p>
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="sp-glass rounded-3xl border px-5 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-4xl font-light leading-none text-navy">
        {value}
        <span className="text-lg text-muted"> / {total}</span>
      </p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DueTag({ due }: { due: ReturnType<typeof individualDue> }) {
  if (due === "scheduled") return null;
  const map = {
    due: ["по графику на этой неделе", "text-gold"],
    overdue: ["давно не было — пора", "text-burgundy"],
    off: ["по графику через неделю", "text-muted"],
    new: ["ещё не было индивидуальных", "text-muted"],
  } as const;
  const [text, cls] = map[due];
  return <span className={cls}> · {text}</span>;
}
