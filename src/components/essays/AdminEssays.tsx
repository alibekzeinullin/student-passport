"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStudents } from "@/context/StudentsContext";
import {
  CRITERIA,
  TOPICS_GOAL,
  deleteTopic,
  essaySummary,
  fetchSubmissions,
  fetchTopics,
  parseTopicsText,
  peekSubmissions,
  peekTopics,
  reviewEssay,
  updateTopic,
  upsertTopics,
  type CriterionKey,
  type EssaySubmission,
  type EssayTopic,
} from "@/lib/essays";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { VoiceButton, appendText } from "@/components/ui/VoiceButton";
import { ReviewCard } from "@/components/essays/StudentEssays";
import { StatusPill, WordCounter, formatScore } from "@/components/essays/EssayBits";

type Tab = "review" | "rating" | "topics";

export function AdminEssays() {
  const { students } = useStudents();
  const [tab, setTab] = useState<Tab>("review");
  const [topics, setTopics] = useState<EssayTopic[]>(() => peekTopics() ?? []);
  const [subs, setSubs] = useState<EssaySubmission[]>(() => peekSubmissions() ?? []);
  const [error, setError] = useState("");

  const reload = useCallback(
    () =>
      Promise.all([fetchTopics(), fetchSubmissions()]).then(
        ([t, s]) => {
          setTopics(t);
          setSubs(s);
          setError("");
        },
        (err: unknown) => {
          console.error(err);
          setError("Раздел эссе ещё не подключён: выполните supabase/setup-all.sql в Supabase → SQL Editor.");
        },
      ),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const queue = useMemo(
    () => subs.filter((s) => s.status === "submitted").sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "")),
    [subs],
  );

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "review", label: "Проверка", badge: queue.length },
    { key: "rating", label: "Рейтинг" },
    { key: "topics", label: `Темы (${topics.length})` },
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
              tab === t.key ? "border-gold bg-gold text-gold-ink" : "border-white/10 text-muted hover:text-navy"
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === t.key ? "bg-gold-ink/15" : "bg-burgundy text-white"}`}>{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? <p className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</p> : null}

      {tab === "review" ? (
        <ReviewQueue queue={queue} subs={subs} topics={topics} students={students} onDone={reload} />
      ) : tab === "rating" ? (
        <Rating subs={subs} students={students} topicsCount={topics.length} />
      ) : (
        <Topics topics={topics} subs={subs} onChange={reload} />
      )}
    </div>
  );
}

type StudentLite = ReturnType<typeof useStudents>["students"][number];

function studentName(students: StudentLite[], id: string): string {
  const s = students.find((x) => x.id === id);
  return s ? `${s.lastName} ${s.firstName}`.trim() : "Ученик";
}

// ---------- Проверка ----------

function ReviewQueue({
  queue,
  subs,
  topics,
  students,
  onDone,
}: {
  queue: EssaySubmission[];
  subs: EssaySubmission[];
  topics: EssayTopic[];
  students: StudentLite[];
  onDone: () => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const current = queue.find((q) => q.id === openId) ?? queue[0] ?? null;
  const recent = useMemo(
    () => subs.filter((s) => s.reviewedAt).sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? "")).slice(0, 8),
    [subs],
  );

  if (!current) {
    return (
      <div className="space-y-4">
        <p className="rounded-3xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted">
          Всё проверено — новых работ нет ✓
        </p>
        {recent.length ? (
          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Недавно проверены</h3>
            <ul className="space-y-1 text-sm">
              {recent.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 text-muted">
                  <span className="text-navy">{studentName(students, s.studentId)}</span>· тема {topics.find((t) => t.id === s.topicId)?.number ?? "?"}
                  <StatusPill status={s.status} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <ul className="sp-glass max-h-[70vh] overflow-y-auto rounded-3xl border p-1.5">
        {queue.map((q) => {
          const t = topics.find((x) => x.id === q.topicId);
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => setOpenId(q.id)}
                className={`w-full rounded-2xl px-3 py-2.5 text-left text-sm transition hover:bg-white/[0.04] ${q.id === current.id ? "bg-white/[0.06]" : ""}`}
              >
                <span className="block text-navy">{studentName(students, q.studentId)}</span>
                <span className="block truncate text-xs text-muted">
                  {t ? `${t.number}. ${t.title}` : "Тема"} {q.version > 1 ? `· v${q.version}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <ReviewForm
        key={current.id}
        sub={current}
        topic={topics.find((t) => t.id === current.topicId)}
        previous={subs.filter((s) => s.studentId === current.studentId && s.topicId === current.topicId && s.version < current.version && s.reviewedAt)}
        student={studentName(students, current.studentId)}
        onDone={async () => {
          setOpenId(null);
          await onDone();
        }}
      />
    </div>
  );
}

function ReviewForm({
  sub,
  topic,
  previous,
  student,
  onDone,
}: {
  sub: EssaySubmission;
  topic?: EssayTopic;
  previous: EssaySubmission[];
  student: string;
  onDone: () => Promise<void>;
}) {
  const [scores, setScores] = useState<Record<CriterionKey, number | null>>({
    scoreStructure: null,
    scoreContent: null,
    scoreLanguage: null,
    scoreTopic: null,
  });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const filled = CRITERIA.every((c) => scores[c.key] !== null);
  const avg = filled ? CRITERIA.reduce((s, c) => s + (scores[c.key] ?? 0), 0) / CRITERIA.length : null;

  const submit = async (status: "accepted" | "revision") => {
    if (status === "accepted" && !filled) {
      setMsg("Поставьте оценки по всем 4 критериям.");
      return;
    }
    if (status === "revision" && !comment.trim()) {
      setMsg("Напишите, что исправить.");
      return;
    }
    setBusy(true);
    try {
      await reviewEssay(sub.id, scores, comment, status);
      await onDone();
    } catch (err) {
      console.error(err);
      setMsg("Не удалось сохранить проверку.");
      setBusy(false);
    }
  };

  return (
    <section className="sp-glass min-w-0 rounded-3xl border px-5 py-5 sm:px-6">
      <p className="text-xs text-gold">
        {student} · тема {topic?.number ?? "?"} · версия {sub.version}
      </p>
      <h3 className="mt-1 text-xl font-light text-navy">{topic?.title ?? "Тема"}</h3>
      {topic?.prompt ? <p className="mt-1 text-sm text-muted">{topic.prompt}</p> : null}

      <div className="mt-4 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/15 px-4 py-3 text-sm leading-relaxed text-navy">
        {sub.body}
      </div>
      <div className="mt-2">
        <WordCounter words={sub.wordCount} />
      </div>

      {previous.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted hover:text-navy">Прошлые проверки этой темы ({previous.length})</summary>
          <div className="mt-2 space-y-2">
            {[...previous].reverse().map((p) => (
              <ReviewCard key={p.id} sub={p} compact />
            ))}
          </div>
        </details>
      ) : null}

      <div className="mt-5 space-y-3">
        {CRITERIA.map((c) => (
          <div key={c.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="sm:w-40">
              <p className="text-sm text-navy">{c.label}</p>
              <p className="text-[11px] text-muted">{c.hint}</p>
            </div>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={c.label}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={scores[c.key] === n}
                  onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                  className={`size-8 rounded-full border text-sm tabular-nums transition ${
                    scores[c.key] === n
                      ? "border-gold bg-gold text-gold-ink"
                      : (scores[c.key] ?? 0) > n
                        ? "border-gold/40 bg-gold/15 text-navy"
                        : "border-white/10 text-muted hover:border-gold/50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-sm text-muted">
          Итог: <span className="text-2xl font-light text-gold">{formatScore(avg)}</span>/10
        </p>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm text-navy">Комментарий ученику</span>
            <VoiceButton onText={(t) => setComment((c) => appendText(c, t))} />
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что получилось, что исправить…" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={busy} onClick={() => void submit("accepted")}>
            Принять
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => void submit("revision")}>
            На доработку
          </Button>
          {msg ? <span className="text-sm text-burgundy">{msg}</span> : null}
        </div>
      </div>
    </section>
  );
}

// ---------- Рейтинг ----------

function Rating({ subs, students, topicsCount }: { subs: EssaySubmission[]; students: StudentLite[]; topicsCount: number }) {
  const goal = Math.max(TOPICS_GOAL, topicsCount);
  const rows = useMemo(() => {
    const active = students.filter((s) => s.status !== "paused");
    return active
      .map((s) => ({ student: s, sum: essaySummary(subs.filter((x) => x.studentId === s.id)) }))
      .sort((a, b) => b.sum.accepted - a.sum.accepted || (b.sum.average ?? 0) - (a.sum.average ?? 0));
  }, [subs, students]);

  const total = rows.reduce((s, r) => s + r.sum.accepted, 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Всего сдано по группе: <span className="text-navy">{total}</span> эссе · в среднем {rows.length ? (total / rows.length).toFixed(1) : 0} на ученика. Ученики видят только своё место, без чужих имён.
      </p>
      <ol className="sp-glass rounded-3xl border px-2 py-1">
        {rows.map((r) => {
          const place = rows.findIndex((x) => x.sum.accepted === r.sum.accepted) + 1;
          return (
            <li key={r.student.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.05] px-3 py-2.5 first:border-t-0">
              <span className={`w-6 text-sm tabular-nums ${place <= 3 && r.sum.accepted > 0 ? "text-gold" : "text-muted"}`}>{place}</span>
              <Link href={`/admin/students/${r.student.id}`} className="min-w-0 flex-1 truncate text-sm text-navy hover:text-gold sm:max-w-[14rem]">
                {r.student.lastName} {r.student.firstName}
              </Link>
              <span className="order-last h-1.5 w-full overflow-hidden rounded-full bg-white/10 sm:order-none sm:w-auto sm:flex-1">
                <span className="block h-full rounded-full bg-gold/70" style={{ width: `${(r.sum.accepted / goal) * 100}%` }} />
              </span>
              <span className="w-16 text-right text-sm tabular-nums text-navy">
                {r.sum.accepted}
                <span className="text-xs text-muted">/{goal}</span>
              </span>
              <span className="w-14 text-right text-xs tabular-nums text-gold" title="Средняя оценка">
                {formatScore(r.sum.average)}
              </span>
              <span className="w-28 text-right text-[11px] text-muted">
                {r.sum.submitted ? `${r.sum.submitted} на проверке` : r.sum.revision ? `${r.sum.revision} на доработке` : r.sum.lastActivity ? new Date(r.sum.lastActivity).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "не начинал"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------- Темы ----------

function Topics({ topics, subs, onChange }: { topics: EssayTopic[]; subs: EssaySubmission[]; onChange: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const parsed = useMemo(() => parseTopicsText(text, topics), [text, topics]);
  const used = useMemo(() => new Set(subs.map((s) => s.topicId)), [subs]);

  const doImport = async () => {
    setBusy(true);
    setMsg("");
    try {
      await upsertTopics(parsed);
      setText("");
      setMsg(`Добавлено / обновлено тем: ${parsed.length}`);
      await onChange();
    } catch (err) {
      console.error(err);
      setMsg("Не удалось сохранить темы.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
        <h3 className="text-lg font-medium text-navy">Добавить темы списком</h3>
        <p className="mt-1 text-sm text-muted">
          Вставьте список — по теме на строку. Можно с номером («12. Тема») и пояснением через тире («Тема — пояснение»). Тема с тем же номером обновится.
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-3 !min-h-40 font-mono text-xs"
          placeholder={"1. Describe a person who inspired you — why and how\n2. What would you change in your school?\nA place you love"}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" disabled={busy || parsed.length === 0} onClick={() => void doImport()}>
            {parsed.length ? `Сохранить ${parsed.length} тем` : "Сохранить"}
          </Button>
          {parsed.length ? (
            <span className="text-xs text-muted">
              Номера: {parsed[0].number}
              {parsed.length > 1 ? `–${parsed[parsed.length - 1].number}` : ""}
            </span>
          ) : null}
          {msg ? <span className="text-sm text-muted">{msg}</span> : null}
        </div>
      </section>

      <ul className="sp-glass rounded-3xl border px-2 py-1">
        {topics.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">Тем пока нет.</li> : null}
        {topics.map((t) =>
          editId === t.id ? (
            <TopicEdit key={t.id} topic={t} onClose={() => setEditId(null)} onSaved={onChange} />
          ) : (
            <li key={t.id} className="flex items-start gap-3 border-t border-white/[0.05] px-3 py-2.5 first:border-t-0">
              <span className="w-8 shrink-0 text-sm tabular-nums text-muted">{t.number}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="text-navy">{t.title}</span>
                {t.prompt ? <span className="block text-xs text-muted">{t.prompt}</span> : null}
              </span>
              <button type="button" onClick={() => setEditId(t.id)} className="text-xs text-muted hover:text-gold">
                изменить
              </button>
              {!used.has(t.id) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Удалить тему ${t.number}?`)) void deleteTopic(t.id).then(onChange);
                  }}
                  className="text-xs text-muted hover:text-burgundy"
                >
                  удалить
                </button>
              ) : null}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function TopicEdit({ topic, onClose, onSaved }: { topic: EssayTopic; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(topic.title);
  const [prompt, setPrompt] = useState(topic.prompt);
  return (
    <li className="space-y-2 border-t border-white/[0.05] px-3 py-3 first:border-t-0">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Тема" />
      <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Пояснение (необязательно)" aria-label="Пояснение" />
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!title.trim()}
          onClick={() => void updateTopic(topic.id, { title: title.trim(), prompt: prompt.trim() }).then(onSaved).then(onClose)}
        >
          Сохранить
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </li>
  );
}
