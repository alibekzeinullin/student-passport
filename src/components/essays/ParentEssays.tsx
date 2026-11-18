"use client";

import { useEffect, useMemo, useState } from "react";
import { TOPICS_GOAL, essayScore, fetchSubmissionsByParentToken, fetchTopics, type EssaySubmission, type EssayTopic } from "@/lib/essays";
import { ReviewCard } from "@/components/essays/StudentEssays";
import { StatusPill, formatScore } from "@/components/essays/EssayBits";

/**
 * Эссе для родителя: проверенные работы — текст, оценки по критериям и комментарий ментора.
 * По теме показываем последнюю проверенную версию, прошлые — под ней.
 */
export function ParentEssays({ token }: { token: string }) {
  const [subs, setSubs] = useState<EssaySubmission[] | null>(null);
  const [topics, setTopics] = useState<EssayTopic[]>([]);
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSubmissionsByParentToken(token), fetchTopics().catch(() => [] as EssayTopic[])])
      .then(([s, t]) => {
        if (cancelled) return;
        setSubs(s);
        setTopics(t);
      })
      .catch(() => {
        if (!cancelled) setSubs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // по ссылке из отчёта (#essays) — прокрутить сюда, когда загрузилось
  useEffect(() => {
    if (subs && window.location.hash === "#essays") {
      window.setTimeout(() => document.getElementById("essays")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [subs]);

  const groups = useMemo(() => {
    const reviewed = (subs ?? []).filter((s) => s.reviewedAt && (s.status === "accepted" || s.status === "revision"));
    const byTopic = new Map<string, EssaySubmission[]>();
    reviewed.forEach((s) => byTopic.set(s.topicId, [...(byTopic.get(s.topicId) ?? []), s]));
    return Array.from(byTopic.entries())
      .map(([topicId, list]) => {
        const sorted = [...list].sort((a, b) => b.version - a.version);
        return { topicId, latest: sorted[0], earlier: sorted.slice(1) };
      })
      .sort((a, b) => (b.latest.reviewedAt ?? "").localeCompare(a.latest.reviewedAt ?? ""));
  }, [subs]);

  if (!subs || groups.length === 0) return null;

  const accepted = groups.filter((g) => g.latest.status === "accepted" || g.earlier.some((e) => e.status === "accepted")).length;
  const scores = groups.map((g) => (g.latest.status === "accepted" ? essayScore(g.latest) : null)).filter((v): v is number => v !== null);
  const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const goal = Math.max(TOPICS_GOAL, topics.length);
  const topicOf = (id: string) => topics.find((t) => t.id === id);

  return (
    <section id="essays" aria-labelledby="essays-h" className="scroll-mt-24">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">Эссе</p>
      <h3 id="essays-h" className="mt-1 text-2xl font-light text-navy">Эссе и комментарии ментора</h3>
      <p className="mb-4 mt-1 text-sm text-muted">
        Принято тем: <span className="text-navy">{accepted}</span> из {goal}
        {average !== null ? (
          <>
            {" "}
            · средняя оценка <span className="text-gold">{formatScore(average)}</span>/10
          </>
        ) : null}
        . Нажмите на тему, чтобы прочитать эссе и отзыв.
      </p>
      <ul className="space-y-2">
        {groups.map(({ topicId, latest, earlier }) => {
          const t = topicOf(topicId);
          const open = openTopic === topicId;
          return (
            <li key={topicId} className="sp-glass overflow-hidden rounded-3xl border">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenTopic(open ? null : topicId)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-navy">{t ? `${t.number}. ${t.title}` : "Тема"}</span>
                  <span className="block text-xs text-muted">
                    проверено {latest.reviewedAt ? new Date(latest.reviewedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : ""}
                    {latest.version > 1 ? ` · версия ${latest.version}` : ""}
                  </span>
                </span>
                <StatusPill status={latest.status} />
                {latest.status === "accepted" ? <span className="w-12 text-right text-lg font-light text-gold">{formatScore(essayScore(latest))}</span> : null}
                <span aria-hidden className={`text-[10px] text-muted ${open ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>
              {open ? (
                <div className="border-t border-white/[0.07] px-4 pb-5 sm:px-5">
                  {t?.prompt ? <p className="mt-3 text-sm text-muted">{t.prompt}</p> : null}
                  <ReviewCard sub={latest} />
                  {latest.body ? (
                    <>
                      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Текст эссе</p>
                      <div className="mt-2 max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/15 px-4 py-3 text-sm leading-relaxed text-navy">{latest.body}</div>
                    </>
                  ) : null}
                  {earlier.length ? (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-muted hover:text-navy">Прошлые версии ({earlier.length})</summary>
                      <div className="mt-2 space-y-2">
                        {earlier.map((e) => (
                          <ReviewCard key={e.id} sub={e} compact />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
