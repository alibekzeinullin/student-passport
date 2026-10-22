"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CRITERIA,
  ESSAY_STATUS_LABELS,
  TOPICS_GOAL,
  countWords,
  deleteDraft,
  essayScore,
  essaySummary,
  fetchMyRank,
  fetchSubmissions,
  fetchTopics,
  peekSubmissions,
  peekTopics,
  saveEssay,
  topicStates,
  type EssaySubmission,
  type EssayTopic,
  type MyRank,
  type TopicState,
} from "@/lib/essays";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { VoiceButton, appendText } from "@/components/ui/VoiceButton";
import { ProgressRing, StatusPill, WordCounter, formatScore } from "@/components/essays/EssayBits";

type Filter = "all" | "todo" | "work" | "submitted" | "accepted";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "todo", label: "Не начаты" },
  { key: "work", label: "Черновики и доработка" },
  { key: "submitted", label: "На проверке" },
  { key: "accepted", label: "Сданы" },
];

function matches(f: Filter, s: TopicState): boolean {
  if (f === "all") return true;
  if (f === "todo") return s.status === "none";
  if (f === "work") return s.status === "draft" || s.status === "revision";
  return s.status === f;
}

export function StudentEssays({ studentId }: { studentId: string }) {
  const [topics, setTopics] = useState<EssayTopic[] | null>(() => peekTopics() ?? null);
  const [subs, setSubs] = useState<EssaySubmission[]>(() => peekSubmissions(studentId) ?? []);
  const [rank, setRank] = useState<MyRank | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      Promise.all([fetchTopics(), fetchSubmissions(studentId), fetchMyRank().catch(() => null)]).then(
        ([t, s, r]) => {
          setTopics(t);
          setSubs(s);
          setRank(r);
          setError("");
        },
        (err: unknown) => {
          console.error(err);
          setTopics((t) => t ?? []);
          setError("Не удалось загрузить эссе. Если раздел новый — ментору нужно обновить базу (supabase/setup-all.sql).");
        },
      ),
    [studentId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const states = useMemo(() => topicStates(topics ?? [], subs), [topics, subs]);
  const summary = useMemo(() => essaySummary(subs), [subs]);
  const shown = states.filter((s) => matches(filter, s));
  const open = states.find((s) => s.topic.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <section className="sp-glass flex flex-col items-center gap-6 rounded-3xl border px-5 py-6 sm:flex-row sm:px-8">
        <ProgressRing value={summary.accepted} goal={Math.max(TOPICS_GOAL, topics?.length ?? 0)} animKey={`essays-${studentId}`} />
        <div className="grid w-full flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Место в рейтинге" value={rank && rank.accepted > 0 ? `${rank.place}` : "—"} sub={rank ? `из ${rank.totalStudents}` : ""} accent />
          <Mini label="Средняя оценка" value={formatScore(summary.average)} sub="из 10" />
          <Mini label="На проверке" value={String(summary.submitted)} />
          <Mini label="На доработке" value={String(summary.revision)} warn={summary.revision > 0} />
        </div>
      </section>

      {error ? <p className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</p> : null}

      {open ? (
        <EssayEditor
          key={open.topic.id}
          state={open}
          studentId={studentId}
          onClose={() => setOpenId(null)}
          onSaved={(s) => {
            setSubs((list) => [...list.filter((x) => x.id !== s.id), s]);
            void reload();
          }}
          onDeleted={(id) => setSubs((list) => list.filter((x) => x.id !== id))}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              filter === f.key ? "border-gold bg-gold text-gold-ink" : "border-white/10 text-muted hover:text-navy"
            }`}
          >
            {f.label}
            <span className="ml-1.5 tabular-nums opacity-70">{states.filter((s) => matches(f.key, s)).length}</span>
          </button>
        ))}
      </div>

      {topics && topics.length === 0 && !error ? (
        <p className="rounded-3xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted">
          Ментор ещё не добавил темы. Загляни позже.
        </p>
      ) : null}

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((s) => (
          <li key={s.topic.id}>
            <button
              type="button"
              onClick={() => {
                setOpenId(s.topic.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`flex h-full w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition hover:border-gold/40 hover:bg-white/[0.04] ${
                openId === s.topic.id ? "border-gold/60 bg-white/[0.05]" : "border-white/[0.07] bg-white/[0.02]"
              }`}
            >
              <span className="w-7 shrink-0 pt-0.5 text-sm tabular-nums text-muted">{s.topic.number}</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm text-navy">{s.topic.title}</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <StatusPill status={s.status} />
                  {s.score !== null ? <span className="text-xs text-gold">{formatScore(s.score)}/10</span> : null}
                  {s.versions.length > 1 ? <span className="text-[11px] text-muted">v{s.latest?.version}</span> : null}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Mini({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-light tabular-nums ${accent ? "text-gold" : warn ? "text-burgundy" : "text-navy"}`}>
        {value}
        {sub ? <span className="ml-1 text-xs text-muted">{sub}</span> : null}
      </p>
    </div>
  );
}

function EssayEditor({
  state,
  studentId,
  onClose,
  onSaved,
  onDeleted,
}: {
  state: TopicState;
  studentId: string;
  onClose: () => void;
  onSaved: (s: EssaySubmission) => void;
  onDeleted: (id: string) => void;
}) {
  const latest = state.latest;
  const editingDraft = latest?.status === "draft" ? latest : null;
  // Новая версия возможна, если ничего нет или работу вернули на доработку
  const canStartNew = !latest || latest.status === "revision";
  const [body, setBody] = useState(editingDraft?.body ?? (latest?.status === "revision" ? latest.body : ""));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [lang, setLang] = useState<"en-US" | "ru-RU">("en-US");
  const ref = useRef<HTMLDivElement>(null);
  const writable = Boolean(editingDraft) || canStartNew;
  const words = countWords(body);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const save = async (submit: boolean) => {
    if (submit && words < 50) {
      setMsg("Слишком коротко для сдачи — допиши эссе.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const saved = await saveEssay({
        id: editingDraft?.id,
        studentId,
        topicId: state.topic.id,
        version: editingDraft ? editingDraft.version : (latest?.version ?? 0) + 1,
        body,
        submit,
      });
      onSaved(saved);
      setMsg(submit ? "Сдано! Ментор проверит и поставит оценку." : "Черновик сохранён.");
    } catch (err) {
      console.error(err);
      setMsg("Не удалось сохранить. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const reviewed = [...state.versions].reverse().filter((v) => v.reviewedAt);

  return (
    <section ref={ref} className="sp-glass scroll-mt-24 rounded-3xl border px-5 py-5 sm:px-7 sm:py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gold">Тема {state.topic.number}</p>
          <h3 className="mt-1 text-xl font-light text-navy sm:text-2xl">{state.topic.title}</h3>
          {state.topic.prompt ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{state.topic.prompt}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-full px-2 text-xl text-muted hover:text-navy" aria-label="Закрыть">
          ×
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill status={state.status} />
        {latest ? <span className="text-xs text-muted">версия {latest.version}</span> : null}
      </div>

      {reviewed[0] ? <ReviewCard sub={reviewed[0]} /> : null}

      {writable ? (
        <div className="mt-4 space-y-3">
          {latest?.status === "revision" && !editingDraft ? (
            <p className="text-sm text-muted">Исправь текст по комментарию ментора и сдай новую версию.</p>
          ) : null}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="!min-h-72 leading-relaxed"
            placeholder="Пиши здесь… Черновик можно сохранять сколько угодно раз."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <WordCounter words={words} />
            <span className="flex items-center gap-2">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as "en-US" | "ru-RU")}
                aria-label="Язык диктовки"
                className="rounded-full border border-white/10 bg-field px-2 py-1 text-xs text-muted"
              >
                <option value="en-US">EN</option>
                <option value="ru-RU">RU</option>
              </select>
              <VoiceButton lang={lang} onText={(t) => setBody((b) => appendText(b, t))} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" disabled={busy || !body.trim()} onClick={() => void save(false)}>
              Сохранить черновик
            </Button>
            <Button type="button" disabled={busy || !body.trim()} onClick={() => void save(true)}>
              Сдать на проверку
            </Button>
            {editingDraft ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Удалить черновик?")) return;
                  void deleteDraft(editingDraft.id).then(() => {
                    onDeleted(editingDraft.id);
                    setBody("");
                  });
                }}
              >
                Удалить черновик
              </Button>
            ) : null}
            {msg ? <span className="text-sm text-muted">{msg}</span> : null}
          </div>
        </div>
      ) : latest ? (
        <div className="mt-4">
          {latest.status === "submitted" ? (
            <p className="mb-3 text-sm text-gold">Работа на проверке у ментора. Менять её уже нельзя — дождись оценки.</p>
          ) : null}
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/15 px-4 py-3 text-sm leading-relaxed text-navy">
            {latest.body}
          </div>
          <p className="mt-2 text-xs text-muted">{latest.wordCount} слов</p>
          {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}
        </div>
      ) : null}

      {reviewed.length > 1 ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted hover:text-navy">Прошлые проверки ({reviewed.length - 1})</summary>
          <div className="mt-2 space-y-2">
            {reviewed.slice(1).map((v) => (
              <ReviewCard key={v.id} sub={v} compact />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function ReviewCard({ sub, compact }: { sub: EssaySubmission; compact?: boolean }) {
  const avg = essayScore(sub);
  return (
    <div className={`${compact ? "" : "mt-4"} rounded-2xl border px-4 py-3 ${sub.status === "accepted" ? "border-emerald-400/25 bg-emerald-400/[0.05]" : "border-burgundy/30 bg-burgundy/[0.06]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-navy">
          Версия {sub.version}: <span className={sub.status === "accepted" ? "text-emerald-300" : "text-burgundy"}>{ESSAY_STATUS_LABELS[sub.status]}</span>
        </p>
        {avg !== null ? <p className="text-2xl font-light text-gold">{formatScore(avg)}<span className="text-xs text-muted">/10</span></p> : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {CRITERIA.map((c) => (
          <span key={c.key} className="text-muted">
            {c.label}: <span className="text-navy">{sub[c.key] ?? "—"}</span>
          </span>
        ))}
      </div>
      {sub.mentorComment ? <p className="mt-2 whitespace-pre-wrap text-sm text-navy">{sub.mentorComment}</p> : null}
    </div>
  );
}
