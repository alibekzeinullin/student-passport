"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  WORK_KIND_LABELS,
  WORK_STATUS_LABELS,
  currentStage,
  deleteWork,
  emptyWork,
  fetchWorks,
  fetchWorksByParentToken,
  newStage,
  peekWorks,
  peekWorksByParentToken,
  saveWork,
  stageProgress,
  type StudentWork,
  type WorkKind,
  type WorkStage,
  type WorkStatus,
} from "@/lib/works";
import { daysLeft, formatDueDate } from "@/lib/deadlines";
import { useStudents } from "@/context/StudentsContext";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import { VoiceButton, appendText } from "@/components/ui/VoiceButton";

type Mode = "student" | "admin" | "parent";

const STATUS_PILL: Record<WorkStatus, string> = {
  idea: "border-navy-soft/40 text-navy-soft",
  active: "border-gold/50 text-gold",
  paused: "border-white/15 text-muted",
  done: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
};

export function WorksBoard({
  studentId,
  mode,
  parentToken,
}: {
  studentId: string;
  mode: Mode;
  parentToken?: string;
}) {
  const peeked = mode === "parent" ? peekWorksByParentToken(parentToken ?? "") : peekWorks(studentId);
  const [works, setWorks] = useState<StudentWork[]>(() => peeked ?? []);
  const [loaded, setLoaded] = useState(() => peeked !== undefined);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudentWork | null>(null);
  const { refreshStudents } = useStudents();
  // Сводка проектов в профиле (и балл «Академ успехи») обновляется в базе — подтягиваем тихо
  const synced = () => void refreshStudents();

  const load = useCallback(
    () => (mode === "parent" ? fetchWorksByParentToken(parentToken ?? "") : fetchWorks(studentId)),
    [mode, parentToken, studentId],
  );

  useEffect(() => {
    let cancelled = false;
    load().then(
      (list) => {
        if (cancelled) return;
        setWorks(list);
        setLoaded(true);
      },
      (err: unknown) => {
        if (cancelled) return;
        console.error(err);
        setError("Раздел ещё не подключён: ментору нужно запустить supabase/setup-all.sql в Supabase.");
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  const editable = mode !== "parent";

  const add = (kind: WorkKind) => {
    const w = emptyWork(studentId, kind, works.length + 1);
    setDraft(w);
    setOpenId(w.id);
  };

  const sections: { kind: WorkKind; title: string; hint: string }[] = [
    { kind: "project", title: "Проекты", hint: "Своё дело, которое решает реальную проблему: клуб, сайт, мероприятие, бизнес, волонтёрство." },
    { kind: "research", title: "Исследования", hint: "Научная работа: вопрос, гипотеза, данные, выводы и защита." },
  ];

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</p> : null}
      {sections.map((sec) => {
        const list = works.filter((w) => w.kind === sec.kind);
        const isDraft = draft?.kind === sec.kind;
        return (
          <section key={sec.kind}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-xl font-light text-navy">
                  {sec.title} <span className="text-sm text-muted">{list.length}</span>
                </h3>
                {mode !== "parent" ? <p className="mt-0.5 max-w-xl text-xs text-muted">{sec.hint}</p> : null}
              </div>
              {editable && !draft && !error ? (
                <Button type="button" variant="secondary" onClick={() => add(sec.kind)}>
                  + {sec.kind === "project" ? "Проект" : "Исследование"}
                </Button>
              ) : null}
            </div>
            <ul className="mt-3 flex flex-col gap-3">
              {isDraft && draft ? (
                <li>
                  <WorkEditor
                    work={draft}
                    isNew
                    mode={mode}
                    onCancel={() => {
                      setDraft(null);
                      setOpenId(null);
                    }}
                    onSaved={(w) => {
                      setWorks((l) => [...l, w]);
                      setDraft(null);
                      setOpenId(w.id);
                      synced();
                    }}
                    onDeleted={() => undefined}
                  />
                </li>
              ) : null}
              {list.map((w) =>
                openId === w.id ? (
                  <li key={w.id}>
                    {editable ? (
                      <WorkEditor
                        work={w}
                        mode={mode}
                        onCancel={() => setOpenId(null)}
                        onSaved={(saved) => {
                          setWorks((l) => l.map((x) => (x.id === saved.id ? saved : x)));
                          synced();
                        }}
                        onDeleted={() => {
                          setWorks((l) => l.filter((x) => x.id !== w.id));
                          setOpenId(null);
                          synced();
                        }}
                      />
                    ) : (
                      <WorkView work={w} onClose={() => setOpenId(null)} />
                    )}
                  </li>
                ) : (
                  <li key={w.id}>
                    <WorkCard work={w} onOpen={() => setOpenId(w.id)} />
                  </li>
                ),
              )}
              {loaded && list.length === 0 && !isDraft ? (
                <li className="rounded-3xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-muted">
                  {mode === "parent"
                    ? "Пока нет."
                    : sec.kind === "project"
                      ? "Пока нет проектов. Нажми «+ Проект» — этапы для старта уже подготовлены."
                      : "Пока нет исследований. Нажми «+ Исследование» — этапы от темы до защиты уже подготовлены."}
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: WorkStatus }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_PILL[status]}`}>{WORK_STATUS_LABELS[status]}</span>;
}

function StageDue({ stage }: { stage: WorkStage }) {
  if (!stage.due) return null;
  const left = daysLeft(stage.due);
  const tone = stage.done ? "text-muted" : left < 0 ? "text-burgundy" : left <= 7 ? "text-gold" : "text-muted";
  return (
    <span className={`text-xs tabular-nums ${tone}`}>
      {formatDueDate(stage.due)}
      {!stage.done && left < 0 ? " · срок прошёл" : ""}
    </span>
  );
}

function WorkCard({ work, onOpen }: { work: StudentWork; onOpen: () => void }) {
  const { done, total } = stageProgress(work);
  const cur = currentStage(work);
  const comments = work.stages.filter((s) => s.mentorComment).length + (work.mentorComment ? 1 : 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="sp-glass w-full rounded-3xl border px-5 py-4 text-left transition hover:border-gold/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-gold">{WORK_KIND_LABELS[work.kind]}</span>
        <StatusPill status={work.status} />
        {comments ? <span className="text-[11px] text-gold">💬 {comments}</span> : null}
      </div>
      <p className="mt-1.5 text-lg text-navy">{work.title || "Без названия"}</p>
      {(work.kind === "research" ? work.question : work.problem) ? (
        <p className="mt-0.5 line-clamp-1 text-sm text-muted">{work.kind === "research" ? work.question : work.problem}</p>
      ) : null}
      {total ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 gap-1">
            {work.stages.map((s) => (
              <span key={s.id} className={`h-1.5 flex-1 rounded-full ${s.done ? "bg-gold" : "bg-white/10"}`} />
            ))}
          </div>
          <span className="text-xs tabular-nums text-muted">
            {done}/{total}
          </span>
        </div>
      ) : null}
      {cur && work.status !== "done" ? (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-muted">Сейчас:</span>
          <span className="text-navy">{cur.title}</span>
          <StageDue stage={cur} />
        </p>
      ) : null}
    </button>
  );
}

// ---------- Просмотр (родитель) ----------

function WorkView({ work, onClose }: { work: StudentWork; onClose: () => void }) {
  const rows: [string, string][] =
    work.kind === "project"
      ? [
          ["Проблема", work.problem],
          ["Цель", work.goal],
          ["Команда", work.team],
          ["Роль", work.myRole],
          ["Результат", work.results],
        ]
      : [
          ["Вопрос", work.question],
          ["Гипотеза", work.hypothesis],
          ["Руководитель", work.supervisor],
          ["Конкурс", work.competition],
          ["Результат", work.results],
        ];
  return (
    <div className="sp-glass rounded-3xl border border-gold/30 px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-gold">{WORK_KIND_LABELS[work.kind]}</span>{" "}
          <StatusPill status={work.status} />
          <h4 className="mt-1 text-xl font-light text-navy">{work.title}</h4>
        </div>
        <button type="button" onClick={onClose} className="text-xl text-muted hover:text-navy" aria-label="Свернуть">
          ×
        </button>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
        {rows
          .filter(([, v]) => v.trim())
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="m-0 whitespace-pre-wrap text-navy">{v}</dd>
            </div>
          ))}
      </dl>
      <StagesList stages={work.stages} />
      <Links links={work.links} />
      {work.mentorComment ? <MentorBubble text={work.mentorComment} /> : null}
    </div>
  );
}

function StagesList({ stages }: { stages: WorkStage[] }) {
  if (!stages.length) return null;
  return (
    <ol className="mt-4 space-y-2">
      {stages.map((s) => (
        <li key={s.id} className="flex flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className={s.done ? "text-emerald-300" : "text-muted"}>{s.done ? "✓" : "○"}</span>
            <span className={s.done ? "text-navy" : "text-muted"}>{s.title}</span>
            <StageDue stage={s} />
          </span>
          {s.mentorComment ? <MentorBubble text={s.mentorComment} small /> : null}
        </li>
      ))}
    </ol>
  );
}

function Links({ links }: { links: StudentWork["links"] }) {
  if (!links.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {links.map((l, i) => (
        <a key={i} href={l.url} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-3 py-1 text-xs text-gold hover:border-gold/50">
          {l.label || "Ссылка"} ↗
        </a>
      ))}
    </div>
  );
}

function MentorBubble({ text, small }: { text: string; small?: boolean }) {
  return (
    <div className={`${small ? "ml-5" : "mt-4"} rounded-2xl border border-gold/25 bg-gold/[0.07] px-3 py-2 text-sm text-navy`}>
      <span className="text-[11px] uppercase tracking-[0.12em] text-gold">Ментор: </span>
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  );
}

// ---------- Редактор (ученик и ментор) ----------

function WorkEditor({
  work,
  isNew = false,
  mode,
  onCancel,
  onSaved,
  onDeleted,
}: {
  work: StudentWork;
  isNew?: boolean;
  mode: Mode;
  onCancel: () => void;
  onSaved: (w: StudentWork) => void;
  onDeleted: () => void;
}) {
  const [w, setW] = useState(work);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const isAdmin = mode === "admin";
  const dirty = JSON.stringify(w) !== JSON.stringify(work);
  const patch = (p: Partial<StudentWork>) => setW((prev) => ({ ...prev, ...p }));
  const patchStage = (id: string, p: Partial<WorkStage>) =>
    setW((prev) => ({ ...prev, stages: prev.stages.map((s) => (s.id === id ? { ...s, ...p } : s)) }));

  const save = async () => {
    if (!w.title.trim()) {
      setMsg(w.kind === "research" ? "Напиши тему исследования" : "Напиши название проекта");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      // Отметка времени для изменённых комментариев ментора
      const now = new Date().toISOString();
      const stages = w.stages.map((s) => {
        const before = work.stages.find((x) => x.id === s.id);
        return isAdmin && (s.mentorComment ?? "") !== (before?.mentorComment ?? "") ? { ...s, commentAt: now } : s;
      });
      const saved = await saveWork({ ...w, stages }, isNew);
      onSaved(saved);
      setW(saved);
      setMsg("Сохранено ✓");
    } catch (err) {
      console.error(err);
      setMsg("Не удалось сохранить. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const fields: { key: keyof StudentWork; label: string; placeholder: string; area?: boolean }[] =
    w.kind === "project"
      ? [
          { key: "problem", label: "Проблема", placeholder: "Какую проблему решает и для кого?", area: true },
          { key: "goal", label: "Цель", placeholder: "Чего хочешь добиться? Лучше с цифрой: 50 участников, 3 мероприятия…", area: true },
          { key: "team", label: "Команда", placeholder: "Кто ещё участвует (или «один»)" },
          { key: "myRole", label: "Моя роль", placeholder: "Основатель, организатор, разработчик…" },
          { key: "results", label: "Результат", placeholder: "Что получилось в цифрах: охват, участники, деньги, отзывы. И чему научился.", area: true },
        ]
      : [
          { key: "question", label: "Исследовательский вопрос", placeholder: "Что именно хочешь выяснить?", area: true },
          { key: "hypothesis", label: "Гипотеза", placeholder: "Что ожидаешь получить и почему?", area: true },
          { key: "supervisor", label: "Научный руководитель", placeholder: "ФИО, школа / вуз" },
          { key: "competition", label: "Конкурс / куда подаю", placeholder: "Конкурс научных проектов Дарын, ISEF…" },
          { key: "results", label: "Результаты и выводы", placeholder: "Что показали данные, подтвердилась ли гипотеза", area: true },
        ];

  return (
    <div className="sp-glass sp-rise space-y-5 rounded-3xl border border-gold/30 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-gold">
          {isNew ? "Новый " : ""}
          {WORK_KIND_LABELS[w.kind].toLowerCase()}
        </span>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-navy">
          Свернуть
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <Label>{w.kind === "research" ? "Тема исследования" : "Название проекта"}</Label>
          <Input value={w.title} onChange={(e) => patch({ title: e.target.value })} placeholder={w.kind === "research" ? "Влияние сна на оценки девятиклассников" : "Школьный подкаст о профессиях"} />
        </div>
        <div>
          <Label>Статус</Label>
          <Select value={w.status} onChange={(e) => patch({ status: e.target.value as WorkStatus })}>
            {(Object.keys(WORK_STATUS_LABELS) as WorkStatus[]).map((s) => (
              <option key={s} value={s}>
                {WORK_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.area ? "sm:col-span-2" : ""}>
            <Label>{f.label}</Label>
            {f.area ? (
              <Textarea
                value={w[f.key] as string}
                onChange={(e) => patch({ [f.key]: e.target.value } as Partial<StudentWork>)}
                placeholder={f.placeholder}
                className="!min-h-16"
              />
            ) : (
              <Input value={w[f.key] as string} onChange={(e) => patch({ [f.key]: e.target.value } as Partial<StudentWork>)} placeholder={f.placeholder} />
            )}
          </div>
        ))}
      </div>

      {/* Этапы */}
      <Block title="Этапы и сроки" hint="Отмечай выполненные — ментор видит, на каком ты этапе">
        <ol className="space-y-2.5">
          {w.stages.map((s, i) => (
            <li key={s.id} className="rounded-2xl bg-white/[0.03] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={(e) => patchStage(s.id, { done: e.target.checked })}
                  aria-label={`Этап выполнен: ${s.title}`}
                  className="size-4 shrink-0 accent-[#cbb073]"
                />
                <span className="w-5 text-xs tabular-nums text-muted">{i + 1}</span>
                <input
                  value={s.title}
                  onChange={(e) => patchStage(s.id, { title: e.target.value })}
                  aria-label="Название этапа"
                  className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${s.done ? "text-muted line-through decoration-white/30" : "text-navy"}`}
                />
                <input
                  type="date"
                  value={s.due ?? ""}
                  onChange={(e) => patchStage(s.id, { due: e.target.value || null })}
                  aria-label="Срок этапа"
                  className="rounded-lg border border-white/10 bg-field px-2 py-1 text-xs text-navy"
                />
                <button
                  type="button"
                  onClick={() => setW((prev) => ({ ...prev, stages: prev.stages.filter((x) => x.id !== s.id) }))}
                  aria-label="Удалить этап"
                  className="px-1 text-muted hover:text-burgundy"
                >
                  ×
                </button>
              </div>
              {isAdmin ? (
                <div className="mt-2 flex items-start gap-2 pl-6">
                  <Textarea
                    value={s.mentorComment ?? ""}
                    onChange={(e) => patchStage(s.id, { mentorComment: e.target.value })}
                    placeholder="Комментарий ментора к этапу (ученик увидит)"
                    className="!min-h-10 text-sm"
                  />
                  <VoiceButton onText={(t) => patchStage(s.id, { mentorComment: appendText(s.mentorComment ?? "", t) })} />
                </div>
              ) : s.mentorComment ? (
                <MentorBubble text={s.mentorComment} small />
              ) : null}
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setW((prev) => ({ ...prev, stages: [...prev.stages, newStage("")] }))}
          className="mt-2 text-sm text-gold hover:underline"
        >
          + Этап
        </button>
      </Block>

      {/* Ссылки */}
      <Block title="Ссылки" hint="Google Drive, Notion, презентация, соцсети проекта, фото">
        <div className="space-y-2">
          {w.links.map((l, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <Input
                value={l.label}
                onChange={(e) => patch({ links: w.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                placeholder="Название"
                className="sm:!w-48"
              />
              <Input
                value={l.url}
                onChange={(e) => patch({ links: w.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })}
                placeholder="https://…"
                className="min-w-0 flex-1"
              />
              <button type="button" onClick={() => patch({ links: w.links.filter((_, j) => j !== i) })} className="px-2 text-muted hover:text-burgundy" aria-label="Удалить ссылку">
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => patch({ links: [...w.links, { label: "", url: "" }] })} className="mt-2 text-sm text-gold hover:underline">
          + Ссылка
        </button>
      </Block>

      {/* Общий комментарий ментора */}
      {isAdmin ? (
        <Block title="Комментарий ментора" hint="Ученик и родители увидят">
          <div className="mb-1.5 flex justify-end">
            <VoiceButton onText={(t) => patch({ mentorComment: appendText(w.mentorComment, t) })} />
          </div>
          <Textarea value={w.mentorComment} onChange={(e) => patch({ mentorComment: e.target.value })} placeholder="Что получается, что улучшить, следующий шаг" />
        </Block>
      ) : w.mentorComment ? (
        <MentorBubble text={w.mentorComment} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy || (!dirty && !isNew)}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </Button>
        {!isNew ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Удалить «${work.title || "без названия"}»? Это нельзя отменить.`)) return;
              void deleteWork(work.id).then(onDeleted, (err: unknown) => {
                console.error(err);
                setMsg("Не удалось удалить.");
              });
            }}
          >
            Удалить
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        )}
        {msg ? <span className="text-sm text-muted">{msg}</span> : dirty && !isNew ? <span className="text-xs text-gold">есть несохранённые изменения</span> : null}
      </div>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-navy">{title}</p>
      {hint ? <p className="mb-2 text-xs text-muted">{hint}</p> : null}
      {children}
    </div>
  );
}
