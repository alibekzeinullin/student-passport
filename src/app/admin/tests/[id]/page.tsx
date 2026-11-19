"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { canManageSat, canOpenGroups } from "@/lib/staff";
import { todayLocal } from "@/lib/api-client";
import { loadGroupsData, type GroupsData } from "@/lib/groups";
import { loadResults, type TopicRow } from "@/lib/results";
import { deleteTest, loadAttempts, loadTest, type AnswerRow, type AttemptRow, type TestFull } from "@/lib/tests";
import { QuestionsEditor, questionIssues } from "@/components/tests/QuestionsEditor";
import { PublishPanel } from "@/components/tests/PublishPanel";
import { TestReport } from "@/components/tests/TestReport";

type Tab = "questions" | "publish" | "report";

export default function TestEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("questions");
  const [full, setFull] = useState<TestFull | null>(null);
  const [groups, setGroups] = useState<GroupsData | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [attempts, setAttempts] = useState<{ attempts: AttemptRow[]; answers: AnswerRow[] }>({ attempts: [], answers: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [f, g, r, a] = await Promise.all([loadTest(id), loadGroupsData(), loadResults().catch(() => null), loadAttempts(id)]);
      setFull(f);
      setGroups(g);
      setTopics(r?.topics ?? []);
      setAttempts(a);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, done?: string): Promise<boolean> => {
      setError("");
      setNotice("");
      try {
        await fn();
        if (done) setNotice(done);
        await load();
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      }
    },
    [load],
  );

  const today = todayLocal();
  const manager = canManageSat(user);
  const myGroupIds = useMemo(
    () => new Set((groups?.staffLinks ?? []).filter((l) => l.user_id === user?.id && (!l.ends_on || l.ends_on >= today)).map((l) => l.group_id)),
    [groups, user?.id, today],
  );
  const canEdit = Boolean(full && (manager || full.test.created_by === user?.id));
  const issues = full ? full.questions.filter((q) => questionIssues(q).length).length : 0;
  const finished = attempts.attempts.filter((a) => a.finished_at).length;

  return (
    <RequireAuth role={["admin", "staff"]} allow={canOpenGroups}>
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/admin/tests" className="text-sm text-muted hover:text-navy">
          ← Все тесты
        </Link>
        {error ? <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">{notice}</div> : null}

        {full && groups ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Тест</p>
                <h2 className="mt-1 text-3xl font-light tracking-tight text-navy">{full.test.title}</h2>
                <p className="mt-1 text-sm text-muted">
                  Вопросов: {full.questions.length} · баллов: {full.questions.reduce((s, q) => s + q.points, 0)} · модулей: {full.sections.length}
                  {issues ? <span className="text-burgundy"> · требуют внимания: {issues}</span> : null}
                </p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="text-xs text-burgundy hover:underline"
                  onClick={async () => {
                    if (!window.confirm(`Удалить тест «${full.test.title}» со всеми результатами учеников?`)) return;
                    if (await run(() => deleteTest(full.test.id))) router.push("/admin/tests");
                  }}
                >
                  удалить тест
                </button>
              ) : null}
            </div>

            <div role="tablist" className="flex w-fit flex-wrap rounded-full border border-white/10 p-1">
              {(
                [
                  ["questions", `Вопросы${issues ? ` · ⚠ ${issues}` : ""}`],
                  ["publish", `Публикация · ${full.assignments.length}`],
                  ["report", `Результаты · ${finished}`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`rounded-full px-4 py-2 text-sm ${tab === k ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "questions" ? (
              <QuestionsEditor full={full} topics={topics} canEdit={canEdit} run={run} hasAttempts={finished > 0} />
            ) : tab === "publish" ? (
              <PublishPanel full={full} groups={groups} canEditGroup={(g) => manager || myGroupIds.has(g)} issues={issues} attempts={attempts.attempts} run={run} />
            ) : (
              <TestReport full={full} groups={groups} topics={topics} attempts={attempts.attempts} answers={attempts.answers} canEditGroup={(g) => manager || myGroupIds.has(g)} canEdit={canEdit} run={run} />
            )}
          </>
        ) : !error ? (
          <p className="text-muted">Загрузка…</p>
        ) : null}
      </div>
    </RequireAuth>
  );
}
