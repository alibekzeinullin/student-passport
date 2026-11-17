"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Label, Select, Textarea } from "@/components/ui/Field";
import { FieldTools } from "@/components/FieldTools";
import { callApi } from "@/lib/api-client";
import { buildReportMessage, defaultReportMonth, monthNominative, type MeetingParentNote, type ReportFacts } from "@/lib/parent-report";

const API = "/api/admin/parent-reports";

interface ReportRow {
  id: string;
  overall: string;
  group_note: string;
  help: string;
  status: "draft" | "sent";
  sent_at: string | null;
  read_at: string | null;
  question_at: string | null;
}

interface StudentData {
  studentId: string;
  name: string;
  firstName: string;
  className: string;
  parentLink: string;
  telegram: { linked: boolean; title: string; code: string | null };
  facts: ReportFacts;
  notes: MeetingParentNote[];
  next: string | null;
  report: ReportRow | null;
}

interface BotStatus {
  configured: boolean;
  username: string | null;
  webhook: boolean;
  error: string | null;
}

interface Draft {
  overall: string;
  groupNote: string;
  help: string;
}

const EMPTY: Draft = { overall: "", groupNote: "", help: "" };

function savedDraft(s: StudentData): Draft {
  return { overall: s.report?.overall ?? "", groupNote: s.report?.group_note ?? "", help: s.report?.help ?? "" };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.overall.trim() === b.overall.trim() && a.groupNote.trim() === b.groupNote.trim() && a.help.trim() === b.help.trim();
}

function monthOptions(): string[] {
  const now = new Date();
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Action = "save" | "send" | "link-code" | "unlink";

export default function ParentReportsPage() {
  const [month, setMonth] = useState(defaultReportMonth());
  const [students, setStudents] = useState<StudentData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [bot, setBot] = useState<BotStatus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "todo" | "sent">("all");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const req = useRef(0);
  const draftsRef = useRef(drafts);
  const studentsRef = useRef(students);
  useEffect(() => {
    draftsRef.current = drafts;
    studentsRef.current = students;
  }, [drafts, students]);

  // Данные месяца. Ответ на старый запрос (если месяц успели сменить) отбрасываем.
  const load = useCallback(async (m: string) => {
    const id = ++req.current;
    setLoading(true);
    setError("");
    try {
      const data = await callApi<{ students: StudentData[] }>(`${API}?month=${m}`, "GET");
      if (id !== req.current) return;
      setStudents(data.students);
      setDrafts(Object.fromEntries(data.students.map((s) => [s.studentId, savedDraft(s)])));
    } catch (err) {
      if (id === req.current) setError((err as Error).message);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, []);

  const loadBot = useCallback(async () => {
    try {
      const data = await callApi<{ bot: BotStatus }>(`${API}?month=${month}&bot=1`, "GET");
      setBot(data.bot);
    } catch {
      setBot({ configured: false, username: null, webhook: false, error: "Не удалось проверить бота" });
    }
    // статус бота нужен один раз при открытии страницы
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadBot());
  }, [loadBot]);

  useEffect(() => {
    void Promise.resolve().then(() => load(month));
  }, [load, month]);

  const dirtyIds = useMemo(
    () => (students ?? []).filter((s) => drafts[s.studentId] && !sameDraft(drafts[s.studentId], savedDraft(s))).map((s) => s.studentId),
    [students, drafts],
  );

  // не потерять несохранённое при закрытии вкладки
  useEffect(() => {
    if (!dirtyIds.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds.length]);

  const changeMonth = (m: string) => {
    if (dirtyIds.length && !window.confirm(`Есть несохранённые правки (${dirtyIds.length}). Перейти на другой месяц без сохранения?`)) return;
    setOpenIds(new Set());
    setMonth(m);
  };

  /** Обновить одного ученика из ответа сервера, не трогая остальных. */
  const replaceStudent = useCallback((fresh: StudentData) => {
    setStudents((prev) => (prev ?? []).map((s) => (s.studentId === fresh.studentId ? fresh : s)));
    setDrafts((prev) => ({ ...prev, [fresh.studentId]: savedDraft(fresh) }));
  }, []);

  const act = useCallback(
    async (kind: Action, studentId: string) => {
      const s = studentsRef.current?.find((x) => x.studentId === studentId);
      if (!s) return;
      if (kind === "send" && !window.confirm(`Отправить отчёт в группу «${s.telegram.title || s.name}»?`)) return;
      if (kind === "unlink" && !window.confirm("Отвязать Telegram-группу от ученика?")) return;
      setBusy(studentId);
      setError("");
      setNotice("");
      try {
        const body = { action: kind, studentId, month, ...(draftsRef.current[studentId] ?? EMPTY) };
        const res = await callApi<{ student?: StudentData; code?: string }>(API, "POST", body);
        if (res.student) replaceStudent(res.student);
        if (kind === "link-code" && res.code) {
          setStudents((prev) => (prev ?? []).map((x) => (x.studentId === studentId ? { ...x, telegram: { ...x.telegram, code: res.code ?? null } } : x)));
        }
        if (kind === "unlink") {
          setStudents((prev) => (prev ?? []).map((x) => (x.studentId === studentId ? { ...x, telegram: { linked: false, title: "", code: null } } : x)));
        }
        setNotice(
          kind === "save" ? `${s.name}: черновик сохранён` : kind === "send" ? `${s.name}: отчёт отправлен в Telegram` : kind === "unlink" ? "Группа отвязана" : "",
        );
      } catch (err) {
        setError(`${s.name}: ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [month, replaceStudent],
  );

  const setDraft = useCallback((id: string, d: Draft) => setDrafts((prev) => ({ ...prev, [id]: d })), []);
  const toggleOpen = useCallback(
    (id: string) =>
      setOpenIds((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );

  const fillGroup = async (text: string): Promise<boolean> => {
    setError("");
    setNotice("");
    setBusy("fill");
    try {
      const res = await callApi<{ filled: string[] }>(API, "POST", { action: "fill-group", month, groupNote: text });
      const filled = new Set(res.filled);
      setStudents((prev) =>
        (prev ?? []).map((s) =>
          filled.has(s.studentId)
            ? { ...s, report: { ...(s.report ?? { id: "", overall: "", help: "", status: "draft", sent_at: null, read_at: null, question_at: null }), group_note: text } }
            : s,
        ),
      );
      // в открытых правках, где поле было пустым, тоже подставляем
      setDrafts((prev) => {
        const n = { ...prev };
        filled.forEach((id) => {
          n[id] = { ...(n[id] ?? EMPTY), groupNote: n[id]?.groupNote.trim() ? n[id].groupNote : text };
        });
        return n;
      });
      const skipped = (studentsRef.current?.length ?? 0) - res.filled.length;
      setNotice(
        res.filled.length
          ? `Текст про групповые встречи сохранён у ${res.filled.length} учеников${skipped ? `. Пропущено ${skipped}: уже отправлено или текст уже есть` : ""}.`
          : "Все уже заполнены или отправлены — ничего не изменено.",
      );
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const list = useMemo(
    () =>
      (students ?? []).filter((s) =>
        filter === "all" ? true : filter === "sent" ? s.report?.status === "sent" : s.report?.status !== "sent",
      ),
    [students, filter],
  );
  const all = students ?? [];
  const sentCount = all.filter((s) => s.report?.status === "sent").length;
  const linkedCount = all.filter((s) => s.telegram.linked).length;
  const readyToSend = all.filter((s) => s.telegram.linked && s.report?.status !== "sent");

  const sendAll = async () => {
    if (!window.confirm(`Отправить отчёт за ${monthNominative(month)} в ${readyToSend.length} групп(ы)? Перед этим проверьте тексты.`)) return;
    setBusy("all");
    setError("");
    let ok = 0;
    for (const s of readyToSend) {
      try {
        const res = await callApi<{ student?: StudentData }>(API, "POST", { action: "send", studentId: s.studentId, month, ...(draftsRef.current[s.studentId] ?? EMPTY) });
        if (res.student) replaceStudent(res.student);
        ok += 1;
      } catch (err) {
        setError(`${s.name}: ${(err as Error).message}`);
        break;
      }
    }
    setBusy(null);
    setNotice(`Отправлено: ${ok} из ${readyToSend.length}`);
  };

  const locked = loading || busy !== null;

  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Менторство</p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Отчёты родителям</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Отчёт за месяц собирается из ваших «отчётов о встрече» в журнале и цифр. Допишите общее впечатление и про групповые встречи — бот отправит в Telegram-группу ученика.
            </p>
          </div>
          <div className="w-48">
            <Label htmlFor="rep-month">Месяц</Label>
            <Select id="rep-month" value={month} disabled={busy !== null} onChange={(e) => changeMonth(e.target.value)}>
              {monthOptions().map((m) => (
                <option key={m} value={m}>
                  {monthNominative(m)} {m.slice(0, 4)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">{notice}</div> : null}

        {bot ? (
          <BotCard
            bot={bot}
            onSetup={async () => {
              setError("");
              try {
                await callApi(API, "POST", { action: "setup-bot" });
                setNotice("Бот подключён к сайту");
                await loadBot();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        ) : null}

        {students ? (
          <div className={`space-y-6 transition-opacity ${loading ? "pointer-events-none opacity-50" : ""}`} aria-busy={loading}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Учеников" value={String(all.length)} />
              <Stat label="Группа подключена" value={`${linkedCount}`} />
              <Stat label="Отправлено" value={`${sentCount}`} />
            </div>

            <GroupAllBox key={month} month={month} disabled={locked} busy={busy === "fill"} onFill={fillGroup} />

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-full border border-white/10 p-1 text-sm">
                {(
                  [
                    ["all", "Все"],
                    ["todo", "Не отправлено"],
                    ["sent", "Отправлено"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                    className={`rounded-full px-4 py-1.5 ${filter === id ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {dirtyIds.length ? <span className="text-xs text-gold">Не сохранено: {dirtyIds.length}</span> : null}
              {readyToSend.length && bot?.webhook ? (
                <Button type="button" className="ml-auto" disabled={locked} onClick={() => void sendAll()}>
                  {busy === "all" ? "Отправляю…" : `Отправить всем подключённым · ${readyToSend.length}`}
                </Button>
              ) : null}
            </div>

            <div className="space-y-3">
              {list.map((s) => (
                <StudentCard
                  key={s.studentId}
                  s={s}
                  month={month}
                  draft={drafts[s.studentId] ?? EMPTY}
                  dirty={dirtyIds.includes(s.studentId)}
                  open={openIds.has(s.studentId)}
                  busy={busy === s.studentId}
                  locked={locked}
                  botReady={Boolean(bot?.webhook)}
                  botName={bot?.username ?? null}
                  onToggle={toggleOpen}
                  onDraft={setDraft}
                  onAction={act}
                />
              ))}
              {list.length === 0 ? <p className="text-sm text-muted">Никого под этот фильтр.</p> : null}
            </div>
          </div>
        ) : loading ? (
          <p className="text-muted">Загрузка…</p>
        ) : null}
      </div>
    </RequireAuth>
  );
}

/** Общий текст про групповые встречи — своё состояние, чтобы набор текста не перерисовывал всех учеников. */
function GroupAllBox({ month, disabled, busy, onFill }: { month: string; disabled: boolean; busy: boolean; onFill: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  return (
    <section className="sp-glass space-y-3 rounded-3xl border px-5 py-5 sm:px-6">
      <Label htmlFor="group-all">Групповые встречи за {monthNominative(month)} — общий текст</Label>
      <FieldTools value={text} onChange={setText} />
      <Textarea
        id="group-all"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Каждая строка — отдельный пункт. Например:\nРазбирали, как выбрать тему проекта\nПотренировали короткие выступления по 2 минуты"}
        className="min-h-24"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={!text.trim() || disabled} onClick={() => void onFill(text.trim())}>
          {busy ? "Сохраняю…" : "Вставить всем, у кого пусто"}
        </Button>
        <p className="text-xs text-muted">Сразу сохраняется в черновики. Отправленные и уже заполненные не трогаем — у каждого потом можно поправить.</p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sp-glass rounded-2xl border px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-3xl font-light text-navy">{value}</p>
    </div>
  );
}

function BotCard({ bot, onSetup }: { bot: BotStatus; onSetup: () => void }) {
  if (bot.configured && bot.webhook) {
    return (
      <p className="text-sm text-muted">
        Бот <span className="text-navy">@{bot.username}</span> подключён.
        {bot.error ? <span className="text-burgundy"> Последняя ошибка Telegram: {bot.error}</span> : null}
      </p>
    );
  }
  return (
    <section className="rounded-3xl border border-gold/30 bg-gold/[0.06] px-5 py-5 sm:px-6">
      <h3 className="text-lg text-navy">Подключите Telegram-бота — один раз</h3>
      {!bot.configured ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-navy">
          <li>
            В Telegram откройте <span className="font-mono text-gold">@BotFather</span> → <span className="font-mono">/newbot</span> → название «TODAY Scholars» → имя, например{" "}
            <span className="font-mono">todayscholars_bot</span>.
          </li>
          <li>BotFather пришлёт токен вида <span className="font-mono">123456:ABC…</span>. Никому его не показывайте.</li>
          <li>
            Vercel → проект → Settings → Environment Variables → <span className="font-mono text-gold">TELEGRAM_BOT_TOKEN</span> = токен → Save → Deployments → Redeploy.
          </li>
          <li>Вернитесь сюда и нажмите «Подключить бота к сайту».</li>
        </ol>
      ) : (
        <p className="mt-2 text-sm text-navy">Токен есть{bot.username ? ` (@${bot.username})` : ""}. Осталось связать бота с сайтом.</p>
      )}
      {bot.error ? <p className="mt-2 text-sm text-burgundy">{bot.error}</p> : null}
      {bot.configured ? (
        <Button type="button" className="mt-3" onClick={onSetup}>
          Подключить бота к сайту
        </Button>
      ) : null}
    </section>
  );
}

const StudentCard = memo(function StudentCard({
  s,
  month,
  draft,
  dirty,
  open,
  busy,
  locked,
  botReady,
  botName,
  onToggle,
  onDraft,
  onAction,
}: {
  s: StudentData;
  month: string;
  draft: Draft;
  dirty: boolean;
  open: boolean;
  busy: boolean;
  locked: boolean;
  botReady: boolean;
  botName: string | null;
  onToggle: (id: string) => void;
  onDraft: (id: string, d: Draft) => void;
  onAction: (kind: Action, id: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const filledNotes = s.notes.filter((n) => n.win || n.focus || n.help);
  const sent = s.report?.status === "sent";
  const set = (patch: Partial<Draft>) => onDraft(s.studentId, { ...draft, ...patch });

  return (
    <section className={`sp-glass rounded-3xl border ${sent ? "border-emerald-400/20" : dirty ? "border-gold/40" : ""}`}>
      <button type="button" onClick={() => onToggle(s.studentId)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 text-left sm:px-6">
        <span className="min-w-0 flex-1">
          <span className="text-lg text-navy">{s.name}</span>
          <span className="ml-2 text-sm text-muted">{s.className}</span>
          <span className="mt-1 block text-xs text-muted">
            Отчётов о встречах: {filledNotes.length} из {s.notes.length}
            {draft.overall.trim() ? " · впечатление есть" : " · впечатление не написано"}
            {draft.groupNote.trim() ? " · групповые есть" : " · групповые пусто"}
            {dirty ? <span className="text-gold"> · не сохранено</span> : null}
          </span>
        </span>
        <span className="flex flex-wrap gap-1.5 text-xs">
          <span className={`rounded-full px-2.5 py-1 ${s.telegram.linked ? "bg-sky-300/10 text-sky-200" : "border border-white/15 text-muted"}`}>
            {s.telegram.linked ? `Telegram: ${s.telegram.title || "группа"}` : "Группа не подключена"}
          </span>
          {sent ? <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-emerald-300">отправлено {s.report?.sent_at ? fmtStamp(s.report.sent_at) : ""}</span> : null}
        </span>
        <span aria-hidden className={`text-[10px] text-muted ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {open ? (
        <div className="grid gap-5 border-t border-white/[0.07] px-5 py-5 sm:px-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Отчёты о встречах за месяц</p>
              {s.notes.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Индивидуальных встреч в этом месяце в журнале нет.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {s.notes.map((n) => (
                    <li key={n.date} className="rounded-2xl bg-white/[0.03] px-3 py-2 text-sm">
                      <p className="text-xs text-gold">{fmtDate(n.date)}</p>
                      {n.win || n.focus || n.help ? (
                        <>
                          {n.win ? <p className="text-navy">Получилось: {n.win}</p> : null}
                          {n.focus ? <p className="text-navy">Работаем над: {n.focus}</p> : null}
                          {n.help ? <p className="text-navy">Помочь дома: {n.help}</p> : null}
                        </>
                      ) : (
                        <p className="text-muted">Отчёт о встрече не заполнен — откройте встречу в журнале ученика.</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DraftField label="Общее впечатление за месяц" value={draft.overall} onChange={(v) => set({ overall: v })} placeholder="Месяц сильный — стала самостоятельнее, сама выходит с идеями…" />
            <DraftField label="Групповые встречи" value={draft.groupNote} onChange={(v) => set({ groupNote: v })} placeholder="Каждая строка — пункт" />
            <DraftField label="Чем помочь дома — дополнительно" value={draft.help} onChange={(v) => set({ help: v })} placeholder="Необязательно" />

            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Telegram-группа</p>
              {s.telegram.linked ? (
                <p className="mt-1 text-sm text-navy">
                  {s.telegram.title || "Группа подключена"}{" "}
                  <button type="button" disabled={locked} onClick={() => void onAction("unlink", s.studentId)} className="ml-2 text-xs text-burgundy hover:underline">
                    отвязать
                  </button>
                </p>
              ) : s.telegram.code ? (
                <div className="mt-1 rounded-2xl bg-white/[0.04] px-3 py-2 text-sm text-navy">
                  <p>1. Добавьте бота {botName ? <span className="font-mono text-gold">@{botName}</span> : "TODAY Scholars"} в группу ученика.</p>
                  <p>
                    2. Отправьте в группе: <span className="select-all font-mono text-gold">/connect {s.telegram.code}</span>
                  </p>
                  <p className="text-xs text-muted">Потом обновите эту страницу.</p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!botReady || locked}
                  onClick={() => void onAction("link-code", s.studentId)}
                  className="mt-1 rounded-full border border-white/15 px-3 py-1.5 text-xs text-navy hover:border-gold/60 disabled:opacity-50"
                >
                  {botReady ? "Подключить группу — получить код" : "Сначала подключите бота (выше)"}
                </button>
              )}
            </div>
          </div>

          <Preview s={s} month={month} draft={draft}>
            {(message) => (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={locked || !dirty} onClick={() => void onAction("save", s.studentId)}>
                  {dirty ? "Сохранить" : "Сохранено"}
                </Button>
                {s.telegram.linked && botReady ? (
                  <Button type="button" disabled={locked} onClick={() => void onAction("send", s.studentId)}>
                    {busy ? "Отправляю…" : sent ? "Отправить ещё раз" : "Отправить в группу"}
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" onClick={() => void navigator.clipboard.writeText(message).then(() => setCopied(true))}>
                  {copied ? "Скопировано ✓" : "Скопировать текст"}
                </Button>
              </div>
            )}
          </Preview>
        </div>
      ) : null}
    </section>
  );
});

/** Текст отчёта собирается только у раскрытой карточки. */
function Preview({ s, month, draft, children }: { s: StudentData; month: string; draft: Draft; children: (message: string) => React.ReactNode }) {
  const message = useMemo(
    () =>
      buildReportMessage({
        firstName: s.firstName,
        month,
        overall: draft.overall,
        groupNote: draft.groupNote,
        help: draft.help,
        facts: s.facts,
        notes: s.notes,
        link: s.parentLink,
        next: s.next,
      }),
    [s, month, draft],
  );
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.12em] text-muted">Так увидят родители</p>
      <pre className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-sans text-sm leading-relaxed text-navy">{message}</pre>
      {children(message)}
    </div>
  );
}

function DraftField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <FieldTools value={value} onChange={onChange} />
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-16" aria-label={label} />
    </div>
  );
}
