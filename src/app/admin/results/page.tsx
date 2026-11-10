"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import { useAuth } from "@/context/AuthContext";
import { friendly, loadGroupsData, type GroupsData, type RosterRow } from "@/lib/groups";
import { fmtDay, isoDate, loadRosterStats, type RosterStat } from "@/lib/lessons";
import {
  addComment,
  createMock,
  createPractice,
  deleteComment,
  deleteMock,
  deletePractice,
  loadComments,
  loadResults,
  MAX_ATTEMPTS,
  parsePaste,
  pathToTarget,
  pctOf,
  pctTone,
  saveMockResults,
  savePracticeResults,
  SECTION_LABELS,
  STATUS_LABELS,
  studentMocks,
  studentPractices,
  studentStatus,
  weakTopics,
  type CommentRow,
  type ResultsData,
  type Status,
} from "@/lib/results";
import { canManageSat, canOpenGroups } from "@/lib/staff";

type Run = (fn: () => Promise<void>, done?: string) => Promise<boolean>;
type Tab = "overview" | "mocks" | "practices";

const TONE_CLASS = {
  low: "bg-burgundy/80",
  mid: "bg-gold",
  high: "bg-emerald-400/80",
} as const;

const STATUS_CLASS: Record<Status, string> = {
  growing: "bg-emerald-400/15 text-emerald-300",
  flat: "bg-gold/15 text-gold",
  risk: "bg-burgundy/20 text-burgundy",
  none: "text-muted",
};

function toInt(v: string): number | null {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export default function ResultsPage() {
  const { user } = useAuth();
  const manager = canManageSat(user);
  const today = isoDate(new Date());
  const [tab, setTab] = useState<Tab>("overview");
  const [groupsData, setGroupsData] = useState<GroupsData | null>(null);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [stats, setStats] = useState<Map<string, RosterStat>>(() => new Map());
  const [groupChoice, setGroupChoice] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [g, r, s] = await Promise.all([loadGroupsData(), loadResults(), loadRosterStats()]);
      setGroupsData(g);
      setResults(r);
      setStats(s);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const run: Run = useCallback(
    async (fn, done) => {
      setError("");
      setNotice("");
      try {
        await fn();
        if (done) setNotice(done);
        await load();
        return true;
      } catch (err) {
        setError(friendly((err as Error).message));
        return false;
      }
    },
    [load],
  );

  const userId = user?.id ?? "";
  const myGroupIds = useMemo(
    () => new Set((groupsData?.staffLinks ?? []).filter((l) => l.user_id === userId && (!l.ends_on || l.ends_on >= today)).map((l) => l.group_id)),
    [groupsData, userId, today],
  );
  const activeGroups = (groupsData?.groups ?? []).filter((g) => !g.archived);
  const sortedGroups = [...activeGroups].sort((a, b) => Number(myGroupIds.has(b.id)) - Number(myGroupIds.has(a.id)) || a.name.localeCompare(b.name, "ru"));
  const groupId = groupChoice && activeGroups.some((g) => g.id === groupChoice) ? groupChoice : (sortedGroups[0]?.id ?? "");
  const canEditGroup = (id: string | null) => manager || (id !== null && myGroupIds.has(id));

  return (
    <RequireAuth role={["admin", "staff"]} allow={canOpenGroups}>
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">SAT</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Результаты</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Прогресс каждого ученика относительно его собственной цели. Рейтинга между учениками нет.
          </p>
        </div>

        <div role="tablist" className="flex w-fit gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(
            [
              ["overview", "Таблица группы"],
              ["mocks", "Пробные экзамены"],
              ["practices", "Практисы"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-full px-4 py-2 text-sm transition ${tab === id ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">{notice}</div> : null}

        {!groupsData || !results ? (
          !error ? <p className="text-muted">Загрузка…</p> : null
        ) : activeGroups.length === 0 ? (
          <div className="sp-glass rounded-3xl border px-5 py-8 text-center text-sm text-muted">Групп пока нет — создайте их на странице «SAT · группы».</div>
        ) : (
          <>
            {tab !== "mocks" ? (
              <div className="w-64">
                <Label htmlFor="res-group">Группа</Label>
                <Select id="res-group" value={groupId} onChange={(e) => setGroupChoice(e.target.value)}>
                  {sortedGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {myGroupIds.has(g.id) ? " · моя" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {tab === "overview" ? (
              <Overview groupId={groupId} groupsData={groupsData} results={results} stats={stats} run={run} />
            ) : tab === "mocks" ? (
              <Mocks groupsData={groupsData} results={results} manager={manager} canEditGroup={canEditGroup} run={run} today={today} />
            ) : (
              <Practices groupId={groupId} groupsData={groupsData} results={results} canEdit={canEditGroup(groupId)} run={run} today={today} />
            )}
          </>
        )}
      </div>
    </RequireAuth>
  );
}

// ---------------- Таблица группы ----------------

function Overview({
  groupId,
  groupsData,
  results,
  stats,
  run,
}: {
  groupId: string;
  groupsData: GroupsData;
  results: ResultsData;
  stats: Map<string, RosterStat>;
  run: Run;
}) {
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const group = groupsData.groups.find((g) => g.id === groupId);
  const roster = groupsData.roster.filter((r) => r.group_id === groupId);
  const streamMocks = results.mocks.filter((m) => m.stream_id === group?.stream_id).slice(-4);
  const open = roster.find((r) => r.student_id === openStudent) ?? null;

  if (roster.length === 0) return <p className="text-sm text-muted">В группе пока нет учеников.</p>;

  return (
    <>
      <div className="sp-glass overflow-x-auto rounded-3xl border">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-left text-xs uppercase tracking-[0.12em] text-muted">
              <th className="px-4 py-3 font-normal">Ученик</th>
              {streamMocks.map((m) => (
                <th key={m.id} className="px-3 py-3 font-normal">
                  {m.title}
                </th>
              ))}
              <th className="px-3 py-3 font-normal">Цель</th>
              <th className="px-3 py-3 font-normal">Путь к цели</th>
              <th className="px-3 py-3 font-normal">ДЗ</th>
              <th className="px-3 py-3 font-normal">Посещ.</th>
              <th className="px-3 py-3 font-normal">Статус</th>
              <th className="px-3 py-3 font-normal">Слабое место</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => {
              const mocks = studentMocks(r.student_id, results);
              const totals = mocks.map((m) => m.result.total as number);
              const st = stats.get(r.student_id);
              const path = pathToTarget(totals[0] ?? null, totals.at(-1) ?? null, r.target_score);
              const status = studentStatus(totals, st?.attendance_pct ?? null, st?.homework_pct ?? null);
              const weak = weakTopics(studentPractices(r.student_id, results)).find((t) => t.pct < 80);
              return (
                <tr
                  key={r.student_id}
                  onClick={() => setOpenStudent((id) => (id === r.student_id ? null : r.student_id))}
                  className={`cursor-pointer border-b border-white/[0.04] transition hover:bg-white/[0.03] ${openStudent === r.student_id ? "bg-gold/[0.06]" : ""}`}
                >
                  <td className="px-4 py-3 text-navy">{r.full_name}</td>
                  {streamMocks.map((m) => (
                    <td key={m.id} className="px-3 py-3 text-navy">
                      {results.mockResults.find((x) => x.mock_id === m.id && x.student_id === r.student_id)?.total ?? "—"}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-navy">{r.target_score ?? "—"}</td>
                  <td className="px-3 py-3">
                    {path === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-white/10">
                          <div className="h-1.5 rounded-full bg-gold" style={{ width: `${path}%` }} />
                        </div>
                        <span className="text-xs text-muted">{path}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-navy">{st?.homework_pct != null ? `${st.homework_pct}%` : "—"}</td>
                  <td className="px-3 py-3 text-navy">{st?.attendance_pct != null ? `${st.attendance_pct}%` : "—"}</td>
                  <td className="px-3 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>
                  </td>
                  <td className="px-3 py-3 text-muted">{weak ? `${weak.name} · ${weak.pct}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Статус: «риск» — посещаемость ниже 75%, ДЗ ниже 60% или балл упал между моками; «растёт» — +30 и больше между последними моками. Нажмите на ученика — комментарии.
      </p>
      {open ? <StudentPanel key={open.student_id} student={open} results={results} run={run} onClose={() => setOpenStudent(null)} /> : null}
    </>
  );
}

function StudentPanel({ student, results, run, onClose }: { student: RosterRow; results: ResultsData; run: Run; onClose: () => void }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"team" | "family">("team");
  const [version, setVersion] = useState(0);
  const mocks = studentMocks(student.student_id, results);
  const weak = weakTopics(studentPractices(student.student_id, results)).filter((t) => t.pct < 80).slice(0, 3);

  useEffect(() => {
    let cancelled = false;
    void loadComments(student.student_id)
      .then((c) => {
        if (!cancelled) setComments(c);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [student.student_id, version]);

  return (
    <section className="sp-rise sp-glass rounded-3xl border border-gold/30 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-light text-navy">{student.full_name}</h3>
          <p className="mt-1 text-sm text-muted">
            Цель {student.target_score ?? "—"}
            {mocks.length ? ` · сейчас ${mocks.at(-1)?.result.total} (${mocks.at(-1)?.mock.title}: Verbal ${mocks.at(-1)?.result.verbal}, Math ${mocks.at(-1)?.result.math})` : " · моков пока нет"}
          </p>
          {weak.length ? <p className="mt-1 text-sm text-muted">Слабые темы: {weak.map((w) => `${w.name} ${w.pct}%`).join(", ")}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-navy">
          Закрыть
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Комментарий к ученику" className="min-h-20" aria-label="Комментарий" />
        <div className="flex flex-col gap-2">
          <div role="group" aria-label="Кто увидит" className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2 text-navy">
              <input type="radio" className="accent-[#cbb073]" checked={visibility === "team"} onChange={() => setVisibility("team")} />
              только команда
            </label>
            <label className="flex items-center gap-2 text-navy">
              <input type="radio" className="accent-[#cbb073]" checked={visibility === "family"} onChange={() => setVisibility("family")} />
              увидят ученик и родитель
            </label>
          </div>
          <Button
            type="button"
            disabled={!body.trim()}
            onClick={async () => {
              if (await run(() => addComment(student.student_id, visibility, body), "Комментарий добавлен")) {
                setBody("");
                setVersion((v) => v + 1);
              }
            }}
          >
            Добавить
          </Button>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {(comments ?? []).map((c) => (
          <li key={c.id} className={`rounded-2xl px-4 py-3 text-sm ${c.visibility === "team" ? "bg-gold/[0.08]" : "bg-sky-300/[0.06]"}`}>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
              {c.visibility === "team" ? "Только для команды" : "Увидят ученик и родитель"} · {c.author_name || "—"} ·{" "}
              {new Date(c.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-navy">{c.body}</p>
            {c.author_id === user?.id ? (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Удалить комментарий?")) return;
                  if (await run(() => deleteComment(c.id), "Комментарий удалён")) setVersion((v) => v + 1);
                }}
                className="mt-1 text-xs text-burgundy hover:underline"
              >
                удалить
              </button>
            ) : null}
          </li>
        ))}
        {comments && comments.length === 0 ? <li className="text-sm text-muted">Комментариев пока нет.</li> : null}
      </ul>
    </section>
  );
}

// ---------------- Моки ----------------

function Mocks({
  groupsData,
  results,
  manager,
  canEditGroup,
  run,
  today,
}: {
  groupsData: GroupsData;
  results: ResultsData;
  manager: boolean;
  canEditGroup: (id: string | null) => boolean;
  run: Run;
  today: string;
}) {
  const streams = groupsData.streams;
  const [streamChoice, setStreamChoice] = useState<string | null>(null);
  const streamId = streamChoice ?? streams.at(-1)?.id ?? "";
  const [openMock, setOpenMock] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const mocks = results.mocks.filter((m) => m.stream_id === streamId);
  const streamGroups = new Set(groupsData.groups.filter((g) => g.stream_id === streamId).map((g) => g.id));
  const roster = groupsData.roster.filter((r) => r.group_id && streamGroups.has(r.group_id));
  const open = mocks.find((m) => m.id === openMock) ?? null;
  const groupName = (id: string | null) => groupsData.groups.find((g) => g.id === id)?.name ?? "";

  if (streams.length === 0) return <p className="text-sm text-muted">Сначала создайте поток на странице «SAT · группы».</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
        <Label htmlFor="mock-stream">Поток</Label>
        <Select id="mock-stream" value={streamId} onChange={(e) => setStreamChoice(e.target.value)}>
          {streams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        </div>
        {manager ? (
          <Button type="button" variant={creating ? "secondary" : "primary"} onClick={() => setCreating((v) => !v)} className="ml-auto">
            {creating ? "Отмена" : "+ Пробный экзамен"}
          </Button>
        ) : null}
      </div>

      {creating ? (
        <NewMockForm
          defaultTitle={`Mock ${mocks.length + 1}`}
          today={today}
          onSubmit={async (title, date) => {
            if (await run(() => createMock({ streamId, title, date }), `${title} добавлен`)) setCreating(false);
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {mocks.map((m) => {
          const n = results.mockResults.filter((r) => r.mock_id === m.id).length;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={openMock === m.id}
              onClick={() => setOpenMock((id) => (id === m.id ? null : m.id))}
              className={`rounded-2xl border px-4 py-2.5 text-left text-sm transition ${openMock === m.id ? "border-gold bg-gold/15" : "border-white/10 hover:border-white/30"}`}
            >
              <span className="block text-navy">{m.title}</span>
              <span className="block text-xs text-muted">
                {fmtDay(m.mock_date)} · {n} из {roster.length}
              </span>
            </button>
          );
        })}
        {mocks.length === 0 ? <p className="text-sm text-muted">Пробных экзаменов в этом потоке пока нет.</p> : null}
      </div>

      {open ? (
        <ScoreEditor
          key={open.id}
          title={`${open.title} · ${fmtDay(open.mock_date)}`}
          roster={roster}
          groupName={groupName}
          columns={["Verbal", "Math"]}
          min={200}
          max={800}
          initial={(studentId) => {
            const r = results.mockResults.find((x) => x.mock_id === open.id && x.student_id === studentId);
            return [r?.verbal ?? null, r?.math ?? null];
          }}
          canEdit={(r) => canEditGroup(r.group_id)}
          extra={(values) => (values[0] !== null && values[1] !== null ? String((values[0] ?? 0) + (values[1] ?? 0)) : "—")}
          extraLabel="Итог"
          onSave={(rows) =>
            run(
              () => saveMockResults(open.id, rows.map((r) => ({ studentId: r.studentId, verbal: r.values[0], math: r.values[1] }))),
              `${open.title}: баллы сохранены`,
            )
          }
          onDelete={
            manager
              ? () => {
                  if (!window.confirm(`Удалить «${open.title}» вместе со всеми баллами?`)) return;
                  void run(async () => {
                    await deleteMock(open.id);
                    setOpenMock(null);
                  }, "Пробный экзамен удалён");
                }
              : undefined
          }
          pasteHint="ФИО; Verbal; Math — по строке на ученика"
        />
      ) : null}
    </div>
  );
}

function NewMockForm({ defaultTitle, today, onSubmit }: { defaultTitle: string; today: string; onSubmit: (title: string, date: string) => Promise<void> }) {
  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  return (
    <section className="sp-rise flex flex-wrap items-end gap-3 rounded-3xl border border-gold/25 bg-[#162030] px-5 py-5 sm:px-6">
      <div>
        <Label htmlFor="nm-title">Название</Label>
        <Input id="nm-title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-48" />
      </div>
      <div>
        <Label htmlFor="nm-date">Дата</Label>
        <Input id="nm-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </div>
      <Button
        type="button"
        disabled={busy || !title.trim() || !date}
        onClick={async () => {
          setBusy(true);
          await onSubmit(title, date);
          setBusy(false);
        }}
      >
        Создать
      </Button>
      <p className="text-xs text-muted">Пробный экзамен общий для всего потока: баллы вносят учителя групп.</p>
    </section>
  );
}

// ---------------- Практисы ----------------

function Practices({
  groupId,
  groupsData,
  results,
  canEdit,
  run,
  today,
}: {
  groupId: string;
  groupsData: GroupsData;
  results: ResultsData;
  canEdit: boolean;
  run: Run;
  today: string;
}) {
  const [openPractice, setOpenPractice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [attempt, setAttempt] = useState(1);
  const roster = groupsData.roster.filter((r) => r.group_id === groupId);
  const practices = results.practices.filter((p) => p.group_id === groupId).slice().reverse();
  const topicName = (id: string | null) => results.topics.find((t) => t.id === id);
  const open = practices.find((p) => p.id === openPractice) ?? null;

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="button" variant={creating ? "secondary" : "primary"} onClick={() => setCreating((v) => !v)}>
            {creating ? "Отмена" : "+ Практис"}
          </Button>
        </div>
      ) : null}

      {creating ? (
        <NewPracticeForm
          topics={results.topics}
          today={today}
          onSubmit={async (input) => {
            if (await run(() => createPractice({ groupId, ...input }), "Практис добавлен")) setCreating(false);
          }}
        />
      ) : null}

      {practices.length === 0 ? <p className="text-sm text-muted">Практисов в этой группе пока нет.</p> : null}
      <div className="space-y-2">
        {practices.map((p) => {
          const t = topicName(p.topic_id);
          const best = roster
            .map((r) => {
              const rs = results.practiceResults.filter((x) => x.practice_id === p.id && x.student_id === r.student_id);
              return rs.length ? Math.max(...rs.map((x) => x.correct)) : null;
            })
            .filter((x): x is number => x !== null);
          const avg = best.length ? Math.round(best.reduce((a, b) => a + pctOf(b, p.max_score), 0) / best.length) : null;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={openPractice === p.id}
              onClick={() => {
                setOpenPractice((id) => (id === p.id ? null : p.id));
                setAttempt(1);
              }}
              className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                openPractice === p.id ? "border-gold bg-gold/10" : "border-white/10 hover:border-white/30"
              }`}
            >
              <span className="w-28 text-muted">{fmtDay(p.practice_date)}</span>
              <span className="min-w-0 flex-1 text-navy">
                {t ? `${SECTION_LABELS[t.section]} · ${t.name}` : p.title || "Практис"} <span className="text-muted">· {p.max_score} задач</span>
              </span>
              <span className="text-muted">
                сдали {best.length} из {roster.length}
              </span>
              {avg !== null ? (
                <span className="flex w-28 items-center gap-2">
                  <span className="h-1.5 flex-1 rounded-full bg-white/10">
                    <span className={`block h-1.5 rounded-full ${TONE_CLASS[pctTone(avg)]}`} style={{ width: `${avg}%` }} />
                  </span>
                  <span className="text-navy">{avg}%</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {open ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Попытка:</span>
            {Array.from({ length: MAX_ATTEMPTS }, (_, i) => i + 1).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={attempt === a}
                onClick={() => setAttempt(a)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${attempt === a ? "bg-gold text-gold-ink" : "border border-white/15 text-muted hover:text-navy"}`}
              >
                {a === 1 ? "1 · основная" : `${a} · перерешивание`}
              </button>
            ))}
          </div>
          <ScoreEditor
            key={`${open.id}-${attempt}`}
            title={`${topicName(open.topic_id)?.name ?? (open.title || "Практис")} · ${fmtDay(open.practice_date)} · попытка ${attempt}`}
            roster={roster}
            groupName={() => ""}
            columns={[`Верно из ${open.max_score}`]}
            min={0}
            max={open.max_score}
            initial={(studentId) => [results.practiceResults.find((x) => x.practice_id === open.id && x.student_id === studentId && x.attempt === attempt)?.correct ?? null]}
            canEdit={() => canEdit}
            extra={(values) => (values[0] !== null ? `${pctOf(values[0] ?? 0, open.max_score)}%` : "—")}
            extraLabel="%"
            onSave={(rows) =>
              run(
                () => savePracticeResults(open.id, rows.map((r) => ({ studentId: r.studentId, attempt, correct: r.values[0] }))),
                `Практис: результаты сохранены (попытка ${attempt})`,
              )
            }
            onDelete={
              canEdit
                ? () => {
                    if (!window.confirm("Удалить практис вместе с результатами?")) return;
                    void run(async () => {
                      await deletePractice(open.id);
                      setOpenPractice(null);
                    }, "Практис удалён");
                  }
                : undefined
            }
            pasteHint="ФИО; верных ответов — по строке на ученика"
          />
        </>
      ) : null}
    </div>
  );
}

function NewPracticeForm({
  topics,
  today,
  onSubmit,
}: {
  topics: ResultsData["topics"];
  today: string;
  onSubmit: (input: { date: string; topicId: string | null; title: string; maxScore: number }) => Promise<void>;
}) {
  const [date, setDate] = useState(today);
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [max, setMax] = useState("15");
  const [busy, setBusy] = useState(false);
  return (
    <section className="sp-rise flex flex-wrap items-end gap-3 rounded-3xl border border-gold/25 bg-[#162030] px-5 py-5 sm:px-6">
      <div>
        <Label htmlFor="np-date">Дата</Label>
        <Input id="np-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </div>
      <div>
        <Label htmlFor="np-topic">Тема</Label>
        <Select id="np-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)} className="w-80">
          {(["math", "verbal"] as const).map((section) => (
            <optgroup key={section} label={SECTION_LABELS[section]}>
              {topics
                .filter((t) => t.section === section)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="np-max">Задач</Label>
        <Input id="np-max" value={max} inputMode="numeric" onChange={(e) => setMax(e.target.value.replace(/\D/g, "").slice(0, 3))} className="w-24" />
      </div>
      <Button
        type="button"
        disabled={busy || !date || !topicId || Number(max) < 1}
        onClick={async () => {
          setBusy(true);
          await onSubmit({ date, topicId: topicId || null, title: "", maxScore: Number(max) });
          setBusy(false);
        }}
      >
        Создать
      </Button>
    </section>
  );
}

// ---------------- Ввод баллов (общий для моков и практисов) ----------------

function ScoreEditor({
  title,
  roster,
  groupName,
  columns,
  min,
  max,
  initial,
  canEdit,
  extra,
  extraLabel,
  onSave,
  onDelete,
  pasteHint,
}: {
  title: string;
  roster: RosterRow[];
  groupName: (id: string | null) => string;
  columns: string[];
  min: number;
  max: number;
  initial: (studentId: string) => (number | null)[];
  canEdit: (r: RosterRow) => boolean;
  extra: (values: (number | null)[]) => string;
  extraLabel: string;
  onSave: (rows: { studentId: string; values: (number | null)[] }[]) => Promise<boolean>;
  onDelete?: () => void;
  pasteHint: string;
}) {
  const [values, setValues] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(roster.map((r) => [r.student_id, initial(r.student_id).map((v) => (v === null ? "" : String(v)))])),
  );
  const [paste, setPaste] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const editable = roster.filter(canEdit);
  const parsed = paste.trim() ? parsePaste(paste, editable, columns.length) : [];
  const bad = (v: string) => v !== "" && (toInt(v) === null || (toInt(v) as number) < min || (toInt(v) as number) > max);
  const invalid = editable.some((r) => {
    const vals = values[r.student_id] ?? [];
    const filled = vals.filter((v) => v !== "").length;
    return vals.some(bad) || (filled > 0 && filled < columns.length);
  });

  return (
    <section className="sp-rise sp-glass rounded-3xl border border-gold/30 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-xl font-light text-navy">{title}</h3>
        <div className="flex gap-2">
          {editable.length ? (
            <button type="button" onClick={() => setPasteOpen((v) => !v)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-navy hover:border-gold/60">
              Вставить из таблицы
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" onClick={onDelete} className="rounded-full border border-burgundy/40 px-3 py-1.5 text-xs text-burgundy hover:bg-burgundy/10">
              Удалить
            </button>
          ) : null}
        </div>
      </div>

      {pasteOpen ? (
        <div className="mt-3 space-y-2">
          <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} className="min-h-28 font-mono" placeholder={pasteHint} aria-label="Вставка из таблицы" />
          {parsed.length ? (
            <p className="text-xs text-muted">
              Найдено {parsed.filter((p) => !p.problem).length} из {parsed.length}.
              {parsed
                .filter((p) => p.problem)
                .map((p) => ` Строка ${p.line} (${p.name || "пусто"}): ${p.problem}.`)
                .join("")}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={!parsed.some((p) => !p.problem)}
            onClick={() => {
              setValues((prev) => {
                const next = { ...prev };
                parsed.filter((p) => !p.problem && p.studentId).forEach((p) => (next[p.studentId as string] = p.values.map(String)));
                return next;
              });
              setPasteOpen(false);
              setPaste("");
            }}
          >
            Подставить в таблицу
          </Button>
        </div>
      ) : null}

      {roster.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Учеников нет.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] text-left text-xs uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-2.5 font-normal">Ученик</th>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2.5 font-normal">
                    {c}
                  </th>
                ))}
                <th className="px-3 py-2.5 font-normal">{extraLabel}</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => {
                const vals = values[r.student_id] ?? columns.map(() => "");
                const ok = canEdit(r);
                return (
                  <tr key={r.student_id} className="border-b border-white/[0.04]">
                    <td className="px-4 py-2 text-navy">
                      {r.full_name}
                      {groupName(r.group_id) ? <span className="block text-xs text-muted">{groupName(r.group_id)}</span> : null}
                    </td>
                    {columns.map((c, i) => (
                      <td key={c} className="px-3 py-2">
                        <Input
                          value={vals[i] ?? ""}
                          disabled={!ok}
                          inputMode="numeric"
                          aria-label={`${c}: ${r.full_name}`}
                          onChange={(e) =>
                            setValues((prev) => {
                              const row = [...(prev[r.student_id] ?? columns.map(() => ""))];
                              row[i] = e.target.value.replace(/\D/g, "").slice(0, 3);
                              return { ...prev, [r.student_id]: row };
                            })
                          }
                          className={`w-24 ${bad(vals[i] ?? "") ? "border-burgundy/60" : ""}`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-navy">{extra(vals.map((v) => toInt(v)))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {invalid ? <p className="mt-2 text-xs text-burgundy">Проверьте числа: от {min} до {max}{columns.length > 1 ? ", заполните все разделы" : ""}.</p> : null}
      {editable.length ? (
        <Button
          type="button"
          className="mt-4"
          disabled={busy || invalid}
          onClick={async () => {
            setBusy(true);
            await onSave(editable.map((r) => ({ studentId: r.student_id, values: (values[r.student_id] ?? []).map((v) => (v === "" ? null : toInt(v))) })));
            setBusy(false);
          }}
        >
          {busy ? "Сохраняю…" : "Сохранить"}
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted">Вносить баллы могут учителя этих групп, старший учитель и руководитель.</p>
      )}
    </section>
  );
}
