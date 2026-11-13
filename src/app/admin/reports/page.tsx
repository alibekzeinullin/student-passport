"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export default function ParentReportsPage() {
  const [month, setMonth] = useState(defaultReportMonth());
  const [students, setStudents] = useState<StudentData[] | null>(null);
  const [bot, setBot] = useState<BotStatus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [groupText, setGroupText] = useState("");
  const [filter, setFilter] = useState<"all" | "todo" | "sent">("all");
  const loadedMonth = useRef("");

  const load = useCallback(async () => {
    try {
      const data = await callApi<{ students: StudentData[]; bot: BotStatus }>(`${API}?month=${month}`, "GET");
      setStudents(data.students);
      setBot(data.bot);
      // несохранённые правки других учеников не теряем; при смене месяца — берём из базы
      const keep = loadedMonth.current === month;
      loadedMonth.current = month;
      setDrafts((prev) =>
        Object.fromEntries(
          data.students.map((s) => [
            s.studentId,
            (keep && prev[s.studentId]) || { overall: s.report?.overall ?? "", groupNote: s.report?.group_note ?? "", help: s.report?.help ?? "" },
          ]),
        ),
      );
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const post = async (body: Record<string, unknown>, done?: string, reload = true) => {
    setError("");
    setNotice("");
    try {
      const res = await callApi<Record<string, unknown>>(API, "POST", body);
      if (done) setNotice(done);
      if (reload) await load();
      return res;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  };

  const list = useMemo(
    () =>
      (students ?? []).filter((s) =>
        filter === "all" ? true : filter === "sent" ? s.report?.status === "sent" : s.report?.status !== "sent",
      ),
    [students, filter],
  );
  const sentCount = (students ?? []).filter((s) => s.report?.status === "sent").length;
  const readCount = (students ?? []).filter((s) => s.report?.read_at).length;
  const linkedCount = (students ?? []).filter((s) => s.telegram.linked).length;
  const readyToSend = (students ?? []).filter((s) => s.telegram.linked && s.report?.status !== "sent");

  const sendAll = async () => {
    if (!window.confirm(`Отправить отчёт за ${monthNominative(month)} в ${readyToSend.length} групп(ы)? Перед этим проверьте тексты.`)) return;
    setBusy("all");
    let ok = 0;
    for (const s of readyToSend) {
      const d = drafts[s.studentId] ?? { overall: "", groupNote: "", help: "" };
      const res = await post({ action: "send", studentId: s.studentId, month, ...d }, undefined, false);
      if (res) ok += 1;
      else break;
    }
    setBusy(null);
    setNotice(`Отправлено: ${ok} из ${readyToSend.length}`);
    await load();
  };

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
            <Select id="rep-month" value={month} onChange={(e) => setMonth(e.target.value)}>
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

        {bot ? <BotCard bot={bot} onSetup={() => post({ action: "setup-bot" }, "Бот подключён к сайту")} /> : null}

        {students ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Учеников" value={String(students.length)} />
              <Stat label="Группа подключена" value={`${linkedCount}`} />
              <Stat label="Отправлено" value={`${sentCount}`} />
              <Stat label="Прочитали" value={`${readCount}`} />
            </div>

            <section className="sp-glass space-y-3 rounded-3xl border px-5 py-5 sm:px-6">
              <Label htmlFor="group-all">Групповые встречи за месяц — общий текст</Label>
              <FieldTools value={groupText} onChange={setGroupText} />
              <Textarea
                id="group-all"
                value={groupText}
                onChange={(e) => setGroupText(e.target.value)}
                placeholder={"Каждая строка — отдельный пункт. Например:\nРазбирали, как выбрать тему проекта\nПотренировали короткие выступления по 2 минуты"}
                className="min-h-24"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!groupText.trim()}
                  onClick={() =>
                    setDrafts((prev) =>
                      Object.fromEntries(
                        Object.entries(prev).map(([id, d]) => [
                          id,
                          students.find((s) => s.studentId === id)?.report?.status === "sent" || d.groupNote.trim() ? d : { ...d, groupNote: groupText },
                        ]),
                      ),
                    )
                  }
                >
                  Вставить всем, у кого пусто
                </Button>
                <p className="text-xs text-muted">Потом у каждого можно поправить. Не забудьте сохранить или отправить.</p>
              </div>
            </section>

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
                    className={`rounded-full px-4 py-1.5 transition ${filter === id ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {readyToSend.length && bot?.webhook ? (
                <Button type="button" className="ml-auto" disabled={busy !== null} onClick={() => void sendAll()}>
                  {busy === "all" ? "Отправляю…" : `Отправить всем подключённым · ${readyToSend.length}`}
                </Button>
              ) : null}
            </div>

            <div className="space-y-4">
              {list.map((s) => (
                <StudentCard
                  key={s.studentId}
                  s={s}
                  month={month}
                  draft={drafts[s.studentId] ?? { overall: "", groupNote: "", help: "" }}
                  setDraft={(d) => setDrafts((prev) => ({ ...prev, [s.studentId]: d }))}
                  busy={busy === s.studentId}
                  botReady={Boolean(bot?.webhook)}
                  botName={bot?.username ?? null}
                  onSave={async () => {
                    setBusy(s.studentId);
                    await post({ action: "save", studentId: s.studentId, month, ...drafts[s.studentId] }, `${s.name}: черновик сохранён`);
                    setBusy(null);
                  }}
                  onSend={async () => {
                    if (!window.confirm(`Отправить отчёт в группу «${s.telegram.title || s.name}»?`)) return;
                    setBusy(s.studentId);
                    await post({ action: "send", studentId: s.studentId, month, ...drafts[s.studentId] }, `${s.name}: отчёт отправлен в Telegram`);
                    setBusy(null);
                  }}
                  onLinkCode={() => post({ action: "link-code", studentId: s.studentId })}
                  onUnlink={() => {
                    if (!window.confirm("Отвязать Telegram-группу от ученика?")) return;
                    void post({ action: "unlink", studentId: s.studentId }, "Группа отвязана");
                  }}
                />
              ))}
              {list.length === 0 ? <p className="text-sm text-muted">Никого под этот фильтр.</p> : null}
            </div>
          </>
        ) : !error ? (
          <p className="text-muted">Загрузка…</p>
        ) : null}
      </div>
    </RequireAuth>
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

function StudentCard({
  s,
  month,
  draft,
  setDraft,
  busy,
  botReady,
  botName,
  onSave,
  onSend,
  onLinkCode,
  onUnlink,
}: {
  s: StudentData;
  month: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  busy: boolean;
  botReady: boolean;
  botName: string | null;
  onSave: () => Promise<void>;
  onSend: () => Promise<void>;
  onLinkCode: () => Promise<unknown>;
  onUnlink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const message = buildReportMessage({
    firstName: s.firstName,
    month,
    overall: draft.overall,
    groupNote: draft.groupNote,
    help: draft.help,
    facts: s.facts,
    notes: s.notes,
    link: s.parentLink,
  });
  const filledNotes = s.notes.filter((n) => n.win || n.focus || n.help);
  const sent = s.report?.status === "sent";

  return (
    <section className={`sp-glass rounded-3xl border ${sent ? "border-emerald-400/20" : ""}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 text-left sm:px-6">
        <span className="min-w-0 flex-1">
          <span className="text-lg text-navy">{s.name}</span>
          <span className="ml-2 text-sm text-muted">{s.className}</span>
          <span className="mt-1 block text-xs text-muted">
            Отчётов о встречах: {filledNotes.length} из {s.notes.length}
            {draft.overall.trim() ? " · впечатление есть" : " · впечатление не написано"}
          </span>
        </span>
        <span className="flex flex-wrap gap-1.5 text-xs">
          <span className={`rounded-full px-2.5 py-1 ${s.telegram.linked ? "bg-sky-300/10 text-sky-200" : "border border-white/15 text-muted"}`}>
            {s.telegram.linked ? `Telegram: ${s.telegram.title || "группа"}` : "Группа не подключена"}
          </span>
          {sent ? <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-emerald-300">отправлено {s.report?.sent_at ? fmtStamp(s.report.sent_at) : ""}</span> : null}
          {s.report?.read_at ? <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-emerald-300">прочитали</span> : null}
          {s.report?.question_at ? <span className="rounded-full bg-gold/15 px-2.5 py-1 text-gold">есть вопрос</span> : null}
        </span>
        <span aria-hidden className={`text-[10px] text-muted transition ${open ? "rotate-180" : ""}`}>
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

            <DraftField
              label="Общее впечатление за месяц"
              value={draft.overall}
              onChange={(v) => setDraft({ ...draft, overall: v })}
              placeholder="Месяц сильный — стала самостоятельнее, сама выходит с идеями…"
            />
            <DraftField
              label="Групповые встречи"
              value={draft.groupNote}
              onChange={(v) => setDraft({ ...draft, groupNote: v })}
              placeholder="Каждая строка — пункт"
            />
            <DraftField
              label="Чем помочь дома — дополнительно"
              value={draft.help}
              onChange={(v) => setDraft({ ...draft, help: v })}
              placeholder="Необязательно"
            />

            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Telegram-группа</p>
              {s.telegram.linked ? (
                <p className="mt-1 text-sm text-navy">
                  {s.telegram.title || "Группа подключена"}{" "}
                  <button type="button" onClick={onUnlink} className="ml-2 text-xs text-burgundy hover:underline">
                    отвязать
                  </button>
                </p>
              ) : s.telegram.code ? (
                <div className="mt-1 rounded-2xl bg-white/[0.04] px-3 py-2 text-sm text-navy">
                  <p>
                    1. Добавьте бота {botName ? <span className="font-mono text-gold">@{botName}</span> : "TODAY Scholars"} в группу ученика.
                  </p>
                  <p>
                    2. Отправьте в группе: <span className="select-all font-mono text-gold">/connect {s.telegram.code}</span>
                  </p>
                  <p className="text-xs text-muted">Потом обновите эту страницу.</p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!botReady}
                  onClick={() => void onLinkCode()}
                  className="mt-1 rounded-full border border-white/15 px-3 py-1.5 text-xs text-navy hover:border-gold/60 disabled:opacity-50"
                >
                  {botReady ? "Подключить группу — получить код" : "Сначала подключите бота (выше)"}
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Так увидят родители</p>
            <pre className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-sans text-sm leading-relaxed text-navy">{message}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void onSave()}>
                Сохранить
              </Button>
              {s.telegram.linked && botReady ? (
                <Button type="button" disabled={busy} onClick={() => void onSend()}>
                  {busy ? "Отправляю…" : sent ? "Отправить ещё раз" : "Отправить в группу"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(message).then(() => setCopied(true));
                }}
              >
                {copied ? "Скопировано ✓" : "Скопировать текст"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
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
