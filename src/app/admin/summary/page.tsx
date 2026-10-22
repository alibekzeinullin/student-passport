"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useStudents } from "@/context/StudentsContext";
import { fetchMeetingsWithNotes, peekFetchMeetingsWithNotes, type MeetingWithNotes } from "@/lib/meetings";
import { fetchDeadlines, peekFetchDeadlines, type Deadline } from "@/lib/deadlines";
import { fetchAllTermGrades, type TermGrade } from "@/lib/term-grades";
import { fetchSubmissions, peekSubmissions, type EssaySubmission } from "@/lib/essays";
import { buildGroupSummary, previousRange, type Range } from "@/lib/group-summary";
import { currentMonthYearLabel } from "@/lib/monthly-progress";
import { Button } from "@/components/ui/Button";

type Span = 1 | 3;

function monthRange(offset: number, span: Span): Range {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const start = new Date(now.getFullYear(), now.getMonth() + offset - span + 1, 1);
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: f(start), to: f(end) };
}

function rangeLabel(r: Range, span: Span): string {
  const [fy, fm] = r.from.split("-").map(Number);
  const [ty, tm] = r.to.split("-").map(Number);
  if (span === 1) return currentMonthYearLabel(new Date(fy, fm - 1, 1));
  const a = new Date(fy, fm - 1, 1).toLocaleDateString("ru-RU", { month: "long" });
  return `${a} – ${currentMonthYearLabel(new Date(ty, tm - 1, 1)).toLowerCase()}`;
}

const num = (v: number | null, d = 1) => (v === null ? "—" : v.toFixed(d).replace(/\.0+$/, ""));

function Delta({ now, before, unit = "", digits = 1 }: { now: number | null; before: number | null; unit?: string; digits?: number }) {
  if (now === null || before === null) return null;
  const d = now - before;
  if (Math.abs(d) < 0.05) return <span className="text-xs text-muted">= как раньше</span>;
  return (
    <span className={`text-xs ${d > 0 ? "text-emerald-300" : "text-burgundy"}`}>
      {d > 0 ? "▲" : "▼"} {num(Math.abs(d), digits)}
      {unit} к прошлому периоду
    </span>
  );
}

export default function GroupSummaryPage() {
  const { students } = useStudents();
  const [offset, setOffset] = useState(() => (new Date().getDate() <= 7 ? -1 : 0));
  const [span, setSpan] = useState<Span>(1);
  const [showSelf, setShowSelf] = useState(true);
  const [meetings, setMeetings] = useState<MeetingWithNotes[]>(() => peekFetchMeetingsWithNotes() ?? []);
  const [deadlines, setDeadlines] = useState<Deadline[]>(() => peekFetchDeadlines() ?? []);
  const [grades, setGrades] = useState<TermGrade[]>([]);
  const [essays, setEssays] = useState<EssaySubmission[]>(() => peekSubmissions() ?? []);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([fetchMeetingsWithNotes(), fetchDeadlines(), fetchAllTermGrades(), fetchSubmissions()]).then(([m, d, g, e]) => {
      if (cancelled) return;
      if (m.status === "fulfilled") setMeetings(m.value);
      if (d.status === "fulfilled") setDeadlines(d.value);
      if (g.status === "fulfilled") setGrades(g.value);
      if (e.status === "fulfilled") setEssays(e.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const range = useMemo(() => monthRange(offset, span), [offset, span]);
  const prev = useMemo(() => previousRange(range), [range]);
  const { rows, totals } = useMemo(
    () => buildGroupSummary(students, meetings, deadlines, grades, essays, range),
    [students, meetings, deadlines, grades, essays, range],
  );
  const before = useMemo(
    () => buildGroupSummary(students, meetings, deadlines, grades, essays, prev).totals,
    [students, meetings, deadlines, grades, essays, prev],
  );

  const wins = rows.flatMap((r) => r.deadlinesSubmitted.map((d) => `${r.name} — ${d.title}`));
  const topEssays = [...rows].filter((r) => r.essaysInPeriod > 0).sort((a, b) => b.essaysInPeriod - a.essaysInPeriod).slice(0, 3);
  const risks = rows
    .map((r) => {
      const why: string[] = [];
      if (r.absences >= 2) why.push(`${r.absences} пропуска`);
      if (r.hwAvg !== null && r.hwAvg < 6) why.push(`домашка ${num(r.hwAvg)}/10`);
      if (r.deadlinesMissed.length) why.push(`не подал: ${r.deadlinesMissed.map((d) => d.title).join(", ")}`);
      if (r.gpaDiff !== null && r.gpaDiff <= -0.3) why.push(`GPA ${num(r.gpaDiff, 2)}`);
      return { name: r.name, why };
    })
    .filter((r) => r.why.length);

  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:space-y-4 print:py-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Отчёт по группе · TODAY Scholars</p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy first-letter:uppercase sm:text-4xl">{rangeLabel(range, span)}</h2>
            <p className="mt-1 text-sm text-muted">
              Учеников: {totals.students}
              {totals.paused ? ` · на паузе: ${totals.paused}` : ""} · сформирован {new Date().toLocaleDateString("ru-RU")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
              {([1, 3] as Span[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={span === s}
                  onClick={() => setSpan(s)}
                  className={`rounded-full px-3 py-1.5 transition ${span === s ? "bg-gold text-gold-ink" : "text-muted hover:text-navy"}`}
                >
                  {s === 1 ? "Месяц" : "3 месяца"}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setOffset((o) => o - span)} className="rounded-full border border-white/10 px-3 py-1.5 text-muted hover:text-navy" aria-label="Раньше">
              ←
            </button>
            <button
              type="button"
              disabled={offset >= 0}
              onClick={() => setOffset((o) => Math.min(0, o + span))}
              className="rounded-full border border-white/10 px-3 py-1.5 text-muted hover:text-navy disabled:opacity-30"
              aria-label="Позже"
            >
              →
            </button>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={showSelf} onChange={(e) => setShowSelf(e.target.checked)} className="accent-[var(--gold)]" />
              моя самооценка
            </label>
            <Button type="button" onClick={() => window.print()}>
              Скачать PDF
            </Button>
          </div>
        </div>

        <div className={`grid grid-cols-2 gap-3 ${showSelf ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          <Kpi label="Посещаемость" value={totals.attendancePct === null ? "—" : `${totals.attendancePct}%`}>
            <Delta now={totals.attendancePct} before={before.attendancePct} unit="%" digits={0} />
          </Kpi>
          <Kpi label="Домашка, ср." value={`${num(totals.hwAvg)}/10`}>
            <Delta now={totals.hwAvg} before={before.hwAvg} />
          </Kpi>
          <Kpi label="Встречи" value={`${totals.indSessions} + ${totals.grpSessions}`} sub="индивид. + групповые" />
          <Kpi label="Эссе сдано" value={String(totals.essays)} sub={`всего по группе ${totals.essaysTotal}`}>
            <Delta now={totals.essays} before={before.essays} digits={0} />
          </Kpi>
          <Kpi label="Подали заявки" value={String(totals.deadlinesSubmitted)} sub={totals.deadlinesMissed ? `пропущено ${totals.deadlinesMissed}` : "олимпиады и конкурсы"} />
          {showSelf ? (
            <Kpi label="Моя самооценка" value={`${num(totals.reflectionAvg)}/10`} sub={`по ${totals.reflectionCount} встречам`}>
              <Delta now={totals.reflectionAvg} before={before.reflectionAvg} />
            </Kpi>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <ListBlock title="Достижения" tone="ok" empty="За период заявок не подавали" items={wins} />
          <ListBlock
            title="Лидеры по эссе"
            tone="gold"
            empty="Эссе за период не сдавали"
            items={topEssays.map((r) => `${r.name} — ${r.essaysInPeriod} (всего ${r.essaysTotal}/100)`)}
          />
          <ListBlock title="Зона риска" tone="warn" empty="Рисков нет" items={risks.map((r) => `${r.name}: ${r.why.join("; ")}`)} />
        </div>

        <section className="sp-glass overflow-x-auto rounded-3xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-3 font-medium">Ученик</th>
                <th className="px-2 py-3 text-center font-medium">Индивид.</th>
                <th className="px-2 py-3 text-center font-medium">Групп.</th>
                <th className="px-2 py-3 text-center font-medium">Домашка</th>
                <th className="px-2 py-3 text-center font-medium">Эссе</th>
                <th className="px-2 py-3 text-center font-medium">Заявки</th>
                <th className="px-4 py-3 text-right font-medium">GPA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student.id} className="border-t border-white/[0.06] print:border-[#e3e6ea]">
                  <td className="px-4 py-2.5 text-navy">{r.name}</td>
                  <td className={`px-2 py-2.5 text-center tabular-nums ${r.indHeld && r.indAttended < r.indHeld ? "text-burgundy" : "text-navy"}`}>
                    {r.indHeld ? `${r.indAttended}/${r.indHeld}` : "—"}
                  </td>
                  <td className={`px-2 py-2.5 text-center tabular-nums ${r.grpHeld && r.grpAttended < r.grpHeld ? "text-burgundy" : "text-navy"}`}>
                    {r.grpHeld ? `${r.grpAttended}/${r.grpHeld}` : "—"}
                  </td>
                  <td className={`px-2 py-2.5 text-center tabular-nums ${r.hwAvg !== null && r.hwAvg < 6 ? "text-burgundy" : "text-navy"}`}>{num(r.hwAvg)}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-navy">
                    {r.essaysInPeriod ? `+${r.essaysInPeriod}` : "0"}
                    <span className="text-xs text-muted"> · {r.essaysTotal}</span>
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-navy">
                    {r.deadlinesSubmitted.length}
                    {r.deadlinesMissed.length ? <span className="text-xs text-burgundy"> / −{r.deadlinesMissed.length}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-navy">
                    {num(r.gpa, 2)}
                    {r.gpaDiff !== null && Math.abs(r.gpaDiff) >= 0.01 ? (
                      <span className={`ml-1 text-xs ${r.gpaDiff > 0 ? "text-emerald-300" : "text-burgundy"}`}>
                        {r.gpaDiff > 0 ? "+" : ""}
                        {r.gpaDiff.toFixed(2)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <p className="text-xs text-muted">
          Посещаемость: был — 100%, опоздал — 50%, не пришёл — 0%. Домашка — среднее «понимание + качество» по журналу. Эссе: «+N» — сдано за период, после точки — всего из 100. Ученики на паузе не учитываются.
        </p>
      </div>
    </RequireAuth>
  );
}

function Kpi({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="sp-glass rounded-3xl border px-4 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-3xl font-light tabular-nums text-navy">{value}</p>
      {sub ? <p className="text-[11px] text-muted">{sub}</p> : null}
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}

function ListBlock({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "ok" | "warn" | "gold" }) {
  const color = tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-burgundy" : "text-gold";
  return (
    <section className="sp-glass rounded-3xl border px-5 py-4">
      <h3 className={`text-[11px] font-medium uppercase tracking-[0.16em] ${color}`}>{title}</h3>
      {items.length ? (
        <ul className="mt-2 space-y-1.5 text-sm text-navy">
          {items.slice(0, 8).map((t) => (
            <li key={t}>· {t}</li>
          ))}
          {items.length > 8 ? <li className="text-xs text-muted">и ещё {items.length - 8}</li> : null}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}
