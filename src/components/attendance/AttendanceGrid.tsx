"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StudentProfile } from "@/lib/types";
import type { MeetingFormat } from "@/lib/meetings";
import { downloadTextFile } from "@/lib/meetings";
import {
  addDays,
  attendancePercent,
  cellState,
  defaultDateInWeek,
  fetchAttendance,
  peekFetchAttendance,
  findCell,
  GROUP_WEEKLY_FROM,
  mondayOf,
  newSessionKey,
  nextState,
  setAttendance,
  todayLocalIso,
  weekLabel,
  weeksBetween,
  type AttendanceMeeting,
  type CellState,
} from "@/lib/attendance";
import { CELL_CLASS, CELL_MARK, CELL_WORD } from "@/components/attendance/cell-styles";

const WINDOW = 8;
type Filter = "all" | "individual" | "group";

export function AttendanceGrid({ students }: { students: StudentProfile[] }) {
  const [endMonday, setEndMonday] = useState(() => mondayOf(todayLocalIso()));
  const [filter, setFilter] = useState<Filter>("all");
  const [meetings, setMeetings] = useState<AttendanceMeeting[]>(() => {
    const end = mondayOf(todayLocalIso());
    return peekFetchAttendance(addDays(end, -7 * (WINDOW - 1)), addDays(end, 6)) ?? [];
  });
  const [loaded, setLoaded] = useState(() => {
    const end = mondayOf(todayLocalIso());
    return peekFetchAttendance(addDays(end, -7 * (WINDOW - 1)), addDays(end, 6)) !== undefined;
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const startMonday = addDays(endMonday, -7 * (WINDOW - 1));
  const weeks = useMemo(() => weeksBetween(startMonday, endMonday), [startMonday, endMonday]);
  const formats: MeetingFormat[] =
    filter === "all" ? ["individual", "group"] : [filter];

  const fetchRange = useCallback(
    () => fetchAttendance(startMonday, addDays(endMonday, 6)),
    [startMonday, endMonday],
  );

  useEffect(() => {
    let cancelled = false;
    fetchRange().then(
      (rows) => {
        if (!cancelled) {
          setMeetings(rows);
          setLoaded(true);
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          console.error(err);
          setError("Не удалось загрузить посещаемость.");
          setLoaded(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchRange]);

  const click = (student: StudentProfile, monday: string, format: MeetingFormat) => {
    const existing = findCell(meetings, student.id, monday, format);
    const next = nextState(cellState(existing));
    const groupInWeek =
      format === "group"
        ? meetings.find(
            (m) => m.format === "group" && m.meetingDate >= monday && m.meetingDate <= addDays(monday, 6),
          )
        : undefined;
    const key = `${student.id}-${monday}-${format}`;
    setBusy(key);
    setError("");
    setAttendance({
      existing,
      studentId: student.id,
      format,
      date: existing?.meetingDate ?? groupInWeek?.meetingDate ?? defaultDateInWeek(monday, format),
      state: next,
      sessionKey: groupInWeek?.sessionKey ?? (format === "group" ? newSessionKey() : null),
    })
      .then(fetchRange)
      .then(setMeetings)
      .catch((err: unknown) => {
        console.error(err);
        const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
        setError(
          msg.includes("session_key")
            ? "Выполните supabase/migration-attendance.sql в Supabase → SQL Editor."
            : "Не удалось сохранить отметку.",
        );
      })
      .finally(() => setBusy(null));
  };

  const rows = students.map((s) => {
    const cells = weeks.map((wk) =>
      formats.map((f) => ({ format: f, state: cellState(findCell(meetings, s.id, wk, f)) })),
    );
    const pct = attendancePercent(cells.flat().map((c) => c.state));
    return { student: s, cells, pct };
  });

  const totals = weeks.map((wk, wi) =>
    formats.map((f, fi) => {
      const states = rows.map((r) => r.cells[wi][fi].state);
      const sched = states.filter((s) => s !== "none").length;
      const came = states.filter((s) => s === "present" || s === "late").length;
      return sched ? `${came}/${sched}` : "—";
    }),
  );
  const pcts = rows.map((r) => r.pct).filter((p): p is number => p !== null);
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;

  const exportCsv = () => {
    const header = ["Ученик", "Класс", ...weeks.flatMap((wk) => formats.map((f) => `${weekLabel(wk)} ${f === "individual" ? "инд" : "груп"}`)), "Посещаемость %"];
    const code: Record<CellState, string> = { present: "1", late: "опоздал", absent: "0", unmarked: "?", none: "" };
    const lines = rows.map((r) => [
      `${r.student.lastName} ${r.student.firstName}`.trim(),
      r.student.className,
      ...r.cells.flat().map((c) => code[c.state]),
      r.pct === null ? "" : String(r.pct),
    ]);
    const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    downloadTextFile(
      `посещаемость_${weeks[0]}_${weeks[weeks.length - 1]}.csv`,
      "﻿" + [header, ...lines].map((l) => l.map(esc).join(";")).join("\r\n"),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEndMonday((m) => addDays(m, -7 * 4))}
            className="rounded-full border border-white/15 px-3 py-2 text-sm text-navy transition hover:bg-white/5"
            aria-label="Раньше на 4 недели"
          >
            ← раньше
          </button>
          <span className="px-2 text-sm text-navy">
            {weekLabel(weeks[0])} — {weekLabel(weeks[weeks.length - 1])}
          </span>
          <button
            type="button"
            onClick={() => setEndMonday((m) => addDays(m, 7 * 4))}
            className="rounded-full border border-white/15 px-3 py-2 text-sm text-navy transition hover:bg-white/5"
            aria-label="Позже на 4 недели"
          >
            позже →
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Тип встреч" className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
            {(
              [
                ["all", "Все"],
                ["individual", "Инд"],
                ["group", "Груп"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={filter === k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-3.5 py-1.5 transition ${filter === k ? "bg-gold text-gold-ink" : "text-muted hover:text-navy"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-full border border-white/20 px-4 py-2 text-sm text-navy transition hover:border-gold/60 hover:bg-white/5"
          >
            Выгрузить в Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted">
        {(["present", "late", "absent", "unmarked", "none"] as CellState[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-2">
            <span className={`size-4 rounded-[5px] ${CELL_CLASS[s]}`} />
            {CELL_WORD[s]}
          </span>
        ))}
        <span className="text-white/40">клик: был → опоздал → не пришёл → снять</span>
      </div>

      {error ? (
        <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div>
      ) : null}

      <div className="sp-glass overflow-x-auto rounded-3xl border">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-xs text-muted">
              <th scope="col" className="sticky left-0 z-10 bg-[#18233a] px-4 py-3 text-left font-normal uppercase tracking-[0.12em]">
                Ученик
              </th>
              {weeks.map((wk) => (
                <th key={wk} scope="col" colSpan={formats.length} className="px-1 py-3 text-center font-normal">
                  <span className="whitespace-nowrap text-navy">{weekLabel(wk)}</span>
                  {wk === GROUP_WEEKLY_FROM ? (
                    <span className="mt-0.5 block whitespace-nowrap text-[10px] text-gold" title="С этой недели групповые встречи каждую неделю, до неё — раз в 2 недели">
                      груп. еженедельно →
                    </span>
                  ) : null}
                  {formats.length > 1 ? (
                    <span className="mt-1 flex justify-center gap-1.5 text-[10px] text-white/40">
                      <span className="w-8">инд</span>
                      <span className="w-8">груп</span>
                    </span>
                  ) : null}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-right font-normal uppercase tracking-[0.12em]">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const name = `${r.student.lastName} ${r.student.firstName}`.trim();
              const pctColor =
                r.pct === null ? "text-muted" : r.pct >= 80 ? "text-navy" : r.pct >= 50 ? "text-gold" : "text-burgundy";
              return (
                <tr key={r.student.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] ${r.student.status === "paused" ? "opacity-60" : ""}`}>
                  <th scope="row" className="sticky left-0 z-10 bg-[#18233a] px-4 py-1.5 text-left font-normal">
                    <Link href={`/admin/students/${r.student.id}`} className="whitespace-nowrap text-navy underline-offset-2 hover:underline">
                      {name}
                    </Link>
                    <span className="block text-[11px] text-white/40">{r.student.className}</span>
                  </th>
                  {r.cells.map((week, wi) => (
                    <td key={weeks[wi]} colSpan={formats.length} className="px-1 py-1.5">
                      <div className="flex justify-center gap-1.5">
                        {week.map((c) => {
                          const key = `${r.student.id}-${weeks[wi]}-${c.format}`;
                          return (
                            <button
                              key={c.format}
                              type="button"
                              disabled={busy === key || !loaded}
                              onClick={() => click(r.student, weeks[wi], c.format)}
                              aria-label={`${name}, ${weekLabel(weeks[wi])}, ${c.format === "individual" ? "индивидуальная" : "групповая"}: ${CELL_WORD[c.state]}`}
                              className={`flex size-8 items-center justify-center rounded-[10px] text-sm font-semibold transition hover:scale-110 hover:ring-2 hover:ring-gold/40 disabled:opacity-60 ${CELL_CLASS[c.state]}`}
                            >
                              {busy === key ? "·" : CELL_MARK[c.state]}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  ))}
                  <td className={`px-4 py-1.5 text-right text-lg font-light ${pctColor}`}>
                    {r.pct === null ? "—" : `${r.pct}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="text-xs text-muted">
              <th scope="row" className="sticky left-0 z-10 bg-[#18233a] px-4 py-3 text-left font-normal">
                Пришли
              </th>
              {totals.map((t, wi) => (
                <td key={weeks[wi]} colSpan={formats.length} className="px-1 py-3">
                  <div className="flex justify-center gap-1.5">
                    {t.map((v, i) => (
                      <span key={i} className="w-8 text-center">{v}</span>
                    ))}
                  </div>
                </td>
              ))}
              <td className="px-4 py-3 text-right text-navy">{avg === null ? "—" : `ср. ${avg}%`}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
