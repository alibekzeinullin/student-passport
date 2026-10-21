"use client";

import { useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useStudents } from "@/context/StudentsContext";
import { AttendanceWeek } from "@/components/attendance/AttendanceWeek";
import { AttendanceGrid } from "@/components/attendance/AttendanceGrid";
import { AttendanceImport } from "@/components/attendance/AttendanceImport";

type View = "week" | "grid" | "import";

export default function AttendancePage() {
  const { students, loading } = useStudents();
  const [view, setView] = useState<View>("week");
  const [showPaused, setShowPaused] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const list = useMemo(
    () =>
      [...students]
        .filter((s) => showPaused || s.status !== "paused")
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "ru"),
        ),
    [students, showPaused],
  );
  const pausedCount = students.filter((s) => s.status === "paused").length;

  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
              Посещаемость
            </p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">
              Встречи с учениками
            </h2>
          </div>
          <div
            role="tablist"
            aria-label="Вид"
            className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 sm:rounded-full"
          >
            {(
              [
                ["week", "Неделя"],
                ["grid", "Вся таблица"],
                ["import", "Импорт из Google Sheets"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  view === key ? "bg-gold text-gold-ink" : "text-muted hover:text-navy"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Загрузка учеников…</p>
        ) : view === "import" ? (
          <AttendanceImport
            onImported={() => {
              setRefreshKey((k) => k + 1);
              setView("grid");
            }}
          />
        ) : (
          <>
            {view === "week" ? (
              <AttendanceWeek key={`w-${refreshKey}`} students={list} />
            ) : (
              <AttendanceGrid key={`g-${refreshKey}`} students={list} />
            )}
            {pausedCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowPaused((v) => !v)}
                className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline"
              >
                {showPaused
                  ? "Скрыть учеников на паузе"
                  : `Ученики на паузе скрыты · показать (${pausedCount})`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </RequireAuth>
  );
}
