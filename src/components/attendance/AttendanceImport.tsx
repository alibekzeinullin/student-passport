"use client";

import { useMemo, useState } from "react";
import { useStudents } from "@/context/StudentsContext";
import { Button } from "@/components/ui/Button";
import type { Attendance } from "@/lib/meetings";
import {
  matchStudent,
  parseAttendanceSheet,
  type ParsedSheet,
} from "@/lib/attendance-import";
import {
  addDays,
  fetchAttendance,
  findCell,
  insertMeetings,
  mondayOf,
  newSessionKey,
  weekLabel,
  type AttendanceMeeting,
} from "@/lib/attendance";

const SKIP = "__skip";

export function AttendanceImport({ onImported }: { onImported: () => void }) {
  const { students, updateStudent, refreshStudents } = useStudents();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [existing, setExisting] = useState<AttendanceMeeting[]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [pauseIds, setPauseIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...students].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "ru")),
    [students],
  );

  const handleFile = async (file: File) => {
    setError("");
    setDone(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseAttendanceSheet(text);
    if (parsed.weeks.length === 0) {
      setSheet(null);
      setError(
        "Не нашёл колонки недель вида «14-20 сен инд». Проверьте, что скачан CSV нужного листа (Файл → Скачать → CSV).",
      );
      return;
    }
    const auto: Record<number, string> = {};
    parsed.students.forEach((s) => {
      const m = matchStudent(s.name, students);
      auto[s.row] = m ? m.id : SKIP;
    });
    const matched = new Set(Object.values(auto));
    setPauseIds(
      new Set(students.filter((s) => s.status !== "paused" && !matched.has(s.id)).map((s) => s.id)),
    );
    setMapping(auto);
    setSheet(parsed);
    const mondays = parsed.weeks.map((w) => w.monday).sort();
    try {
      setExisting(await fetchAttendance(mondays[0], addDays(mondays[mondays.length - 1], 6)));
    } catch (err) {
      console.error(err);
      setExisting([]);
    }
  };

  const plan = useMemo(() => {
    if (!sheet) return null;
    const rows: { studentId: string; date: string; format: "individual" | "group"; attendance: Attendance; monday: string }[] = [];
    let skippedExisting = 0;
    for (const s of sheet.students) {
      const id = mapping[s.row];
      if (!id || id === SKIP) continue;
      for (const m of s.marks) {
        if (findCell(existing, id, m.monday, m.format)) {
          skippedExisting += 1;
          continue;
        }
        rows.push({
          studentId: id,
          date: m.format === "group" ? addDays(m.monday, 2) : m.monday,
          format: m.format,
          attendance: m.attendance,
          monday: m.monday,
        });
      }
    }
    return { rows, skippedExisting };
  }, [sheet, mapping, existing]);

  const runImport = async () => {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      // Групповые встречи одной недели — одна сессия
      const keys = new Map<string, string | null>();
      for (const m of existing) {
        if (m.format === "group" && m.sessionKey) keys.set(mondayOf(m.meetingDate), m.sessionKey);
      }
      const rows = plan.rows.map((r) => {
        if (r.format !== "group") return r;
        if (!keys.has(r.monday)) keys.set(r.monday, newSessionKey());
        return { ...r, sessionKey: keys.get(r.monday) ?? null };
      });
      await insertMeetings(rows);
      for (const id of pauseIds) {
        await updateStudent(id, { status: "paused", pausedAt: new Date().toISOString() });
      }
      await refreshStudents();
      setDone(
        `Импортировано встреч: ${rows.length}.${pauseIds.size ? ` На паузу: ${pauseIds.size}.` : ""}`,
      );
      setSheet(null);
      onImported();
    } catch (err) {
      console.error(err);
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
      setError(
        msg.includes("session_key")
          ? "Сначала выполните supabase/migration-attendance.sql в Supabase → SQL Editor."
          : msg.includes("status")
            ? "Сначала выполните supabase/migration-pause.sql в Supabase → SQL Editor."
            : `Импорт не удался: ${msg || "неизвестная ошибка"}. Часть встреч могла сохраниться — повторный импорт не создаст дублей.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const unmatched = sheet?.students.filter((s) => mapping[s.row] === SKIP) ?? [];
  const matchedCount = (sheet?.students.length ?? 0) - unmatched.length;
  const mondays = sheet ? [...new Set(sheet.weeks.map((w) => w.monday))].sort() : [];
  const notes = sheet?.students.reduce((a, s) => a + s.notes, 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
        <h3 className="text-lg font-medium text-navy">Перенести историю из Google Sheets</h3>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Откройте таблицу посещаемости → <span className="text-navy">Файл → Скачать → CSV</span> (текущий лист).</li>
          <li>Загрузите файл сюда. Сайт найдёт недели («14-20 сен инд», «5-11 окт груп») и отметки: 1 — был, 0 — пропуск, пусто — встречи не было.</li>
          <li>Проверьте сопоставление учеников и нажмите «Импортировать». Уже существующие встречи не дублируются.</li>
        </ol>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-3 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition hover:bg-[#d9c18a]">
          Выбрать CSV-файл
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {fileName ? <span className="ml-3 text-sm text-muted">{fileName}</span> : null}
      </section>

      {error ? (
        <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div>
      ) : null}
      {done ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">{done}</div>
      ) : null}

      {sheet && plan ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Недель найдено" value={String(mondays.length)} note={`${weekLabel(mondays[0])} — ${weekLabel(mondays[mondays.length - 1])}`} />
            <Stat label="Учеников сопоставлено" value={`${matchedCount}/${sheet.students.length}`} note={unmatched.length ? `${unmatched.length} не найдено` : "все найдены"} />
            <Stat label="Встреч будет создано" value={String(plan.rows.length)} note={plan.skippedExisting ? `${plan.skippedExisting} уже есть — пропущу` : "дублей нет"} />
            <Stat label="Заметки в клетках" value={String(notes)} note="текст вместо 1/0 — пропущу" />
          </div>

          <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
            <h3 className="text-base font-medium text-navy">Сопоставление учеников</h3>
            <p className="mt-1 text-sm text-muted">Если имя не нашлось автоматически, выберите ученика вручную или оставьте «пропустить».</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {sheet.students.map((s) => {
                const id = mapping[s.row];
                const ok = id && id !== SKIP;
                return (
                  <li key={s.row} className={`flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 ${ok ? "border-white/[0.07] bg-white/[0.02]" : "border-gold/40 bg-gold/[0.06]"}`}>
                    <span className="min-w-0 flex-1 text-sm text-navy">
                      {s.name}
                      <span className="ml-2 text-xs text-muted">{s.marks.length} отметок</span>
                    </span>
                    <select
                      aria-label={`Ученик для «${s.name}»`}
                      value={id ?? SKIP}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [s.row]: e.target.value }))}
                      className="max-w-[14rem] rounded-xl border border-white/10 bg-field px-2 py-1.5 text-sm text-navy"
                    >
                      <option value={SKIP}>— пропустить —</option>
                      {sorted.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.lastName} {st.firstName}
                          {st.status === "paused" ? " (пауза)" : ""}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </section>

          {(() => {
            const used = new Set(Object.values(mapping));
            const missing = students.filter((s) => !used.has(s.id) && s.status !== "paused");
            if (missing.length === 0) return null;
            return (
              <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
                <h3 className="text-base font-medium text-navy">Есть на сайте, но нет в таблице</h3>
                <p className="mt-1 text-sm text-muted">Отмеченных поставлю на паузу — их данные сохранятся, вернуть можно в реестре.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {missing.map((s) => {
                    const on = pauseIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setPauseIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          })
                        }
                        className={`rounded-full border px-3.5 py-1.5 text-sm transition ${on ? "border-gold bg-gold/15 text-navy" : "border-white/10 text-muted"}`}
                      >
                        {on ? "на паузу: " : ""}
                        {s.lastName} {s.firstName}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          <div>
            <Button type="button" onClick={() => void runImport()} disabled={busy || (plan.rows.length === 0 && pauseIds.size === 0)}>
              {busy ? "Импортирую…" : `Импортировать ${plan.rows.length} встреч`}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="sp-glass rounded-3xl border px-5 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-3xl font-light text-navy">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}
