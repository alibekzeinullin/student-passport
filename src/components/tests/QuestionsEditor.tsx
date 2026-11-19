"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import { MathText } from "@/components/tests/MathText";
import type { TopicRow } from "@/lib/results";
import {
  compressImage,
  deleteQuestion,
  deleteSection,
  rescoreTest,
  saveQuestion,
  saveSection,
  swapQuestions,
  updateTest,
  type QuestionRow,
  type SectionRow,
  type TestFull,
} from "@/lib/tests";

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Что не так с вопросом — для подсветки и проверки перед публикацией. */
export function questionIssues(q: Pick<QuestionRow, "kind" | "options" | "answer" | "topic_id" | "topic_label" | "stem" | "passage">): string[] {
  const out: string[] = [];
  if (!q.stem.trim() && !q.passage.trim()) out.push("пустой текст");
  if (!q.answer.trim()) out.push("нет ответа");
  else if (q.kind === "choice" && !LETTERS.slice(0, q.options.length).includes(q.answer.trim().toUpperCase())) out.push("ответа нет среди вариантов");
  if (q.kind === "choice" && q.options.length < 2) out.push("меньше 2 вариантов");
  if (!q.topic_id && !q.topic_label.trim()) out.push("нет темы");
  return out;
}

function topicName(q: QuestionRow, topics: TopicRow[]): string {
  return q.topic_id ? (topics.find((t) => t.id === q.topic_id)?.name ?? "") : q.topic_label;
}

export function QuestionsEditor({ full, topics, canEdit, run, hasAttempts }: { full: TestFull; topics: TopicRow[]; canEdit: boolean; run: Run; hasAttempts: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState(full.test.title);

  return (
    <div className="space-y-5">
      {!canEdit ? <p className="text-sm text-muted">Править тест может автор или руководитель SAT. Вы можете его опубликовать для своих групп и смотреть результаты.</p> : null}
      {hasAttempts && canEdit ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold/40 bg-gold/[0.07] px-4 py-3 text-sm text-navy">
          Тест уже проходили. Если исправили ключ или баллы — пересчитайте результаты.
          <Button type="button" variant="secondary" onClick={() => void run(async () => rescoreTest(full.test.id), "Результаты пересчитаны")}>
            Пересчитать результаты
          </Button>
        </div>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <Label htmlFor="t-title">Название</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <Button type="button" variant="secondary" disabled={title.trim() === full.test.title || !title.trim()} onClick={() => void run(() => updateTest(full.test.id, { title: title.trim() }), "Название сохранено")}>
            Сохранить
          </Button>
        </div>
      ) : null}

      {full.sections.map((s) => {
        const qs = full.questions.filter((q) => q.section_id === s.id).sort((a, b) => a.position - b.position);
        return (
          <section key={s.id} className="sp-glass rounded-3xl border px-4 py-4 sm:px-5">
            <SectionHeader section={s} count={qs.length} points={qs.reduce((a, q) => a + q.points, 0)} canEdit={canEdit} run={run} />
            <ul className="mt-3 space-y-1.5">
              {qs.map((q, i) => {
                const issues = questionIssues(q);
                const open = openId === q.id;
                return (
                  <li key={q.id} className={`rounded-2xl border ${issues.length ? "border-burgundy/40" : "border-white/10"}`}>
                    <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : q.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm">
                      <span className="w-7 shrink-0 text-muted">{q.position}.</span>
                      <span className="min-w-0 flex-1 truncate text-navy">{(q.stem || q.passage).replace(/\s+/g, " ").slice(0, 140) || "—"}</span>
                      {q.image ? <span className="text-xs text-muted">🖼</span> : null}
                      <span className="w-24 shrink-0 truncate text-right text-xs text-muted">{topicName(q, topics) || "—"}</span>
                      <span className="w-16 shrink-0 text-right text-xs text-navy">{q.kind === "choice" ? `ответ ${q.answer || "?"}` : "ввод"}</span>
                      <span className="w-12 shrink-0 text-right text-xs text-gold">{q.points} б.</span>
                      {issues.length ? <span className="text-xs text-burgundy" title={issues.join(", ")}>⚠</span> : null}
                    </button>
                    {open ? (
                      <QuestionForm
                        key={q.id}
                        q={q}
                        section={s}
                        topics={topics}
                        canEdit={canEdit}
                        run={run}
                        prev={qs[i - 1] ?? null}
                        next={qs[i + 1] ?? null}
                        onClose={() => setOpenId(null)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {canEdit ? (
              <button
                type="button"
                className="mt-3 rounded-full border border-gold/50 px-3 py-1.5 text-xs text-gold hover:bg-gold/10"
                onClick={() =>
                  void run(
                    () =>
                      saveQuestion({
                        section_id: s.id,
                        position: (qs.at(-1)?.position ?? 0) + 1,
                        kind: s.section === "math" ? "input" : "choice",
                        options: s.section === "math" ? [] : ["", "", "", ""],
                        stem: "Новый вопрос",
                        answer: "",
                        points: 1,
                      }),
                    "Вопрос добавлен в конец модуля",
                  )
                }
              >
                + Вопрос
              </button>
            ) : null}
          </section>
        );
      })}

      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            void run(
              () => saveSection({ test_id: full.test.id, position: (full.sections.at(-1)?.position ?? 0) + 1, title: `Модуль ${full.sections.length + 1}`, section: "math", minutes: 35, calculator: true }),
              "Модуль добавлен",
            )
          }
        >
          + Модуль
        </Button>
      ) : null}
    </div>
  );
}

function SectionHeader({ section, count, points, canEdit, run }: { section: SectionRow; count: number; points: number; canEdit: boolean; run: Run }) {
  const [s, setS] = useState(section);
  const dirty = s.title !== section.title || s.section !== section.section || s.minutes !== section.minutes || s.calculator !== section.calculator;
  if (!canEdit) {
    return (
      <p className="text-navy">
        {section.title} <span className="text-xs text-muted">· {section.section === "math" ? "Math" : "Verbal"} · {section.minutes} мин · вопросов {count} · баллов {points}</span>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <Label>Модуль {section.position}</Label>
        <Input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} aria-label={`Название модуля ${section.position}`} />
      </div>
      <Select value={s.section} onChange={(e) => setS({ ...s, section: e.target.value as "verbal" | "math" })} aria-label="Раздел" className="!w-28">
        <option value="verbal">Verbal</option>
        <option value="math">Math</option>
      </Select>
      <Input value={String(s.minutes)} inputMode="numeric" onChange={(e) => setS({ ...s, minutes: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0 })} aria-label="Минут" className="!w-20" />
      <span className="pb-2 text-xs text-muted">мин</span>
      <label className="flex items-center gap-1.5 pb-2 text-xs text-navy">
        <input type="checkbox" checked={s.calculator} onChange={(e) => setS({ ...s, calculator: e.target.checked })} /> калькулятор
      </label>
      <Button type="button" variant="secondary" disabled={!dirty || s.minutes < 1} onClick={() => void run(() => saveSection(s), "Модуль сохранён")}>
        Сохранить
      </Button>
      <span className="pb-2 text-xs text-muted">
        вопросов {count} · баллов {points}
      </span>
      <button
        type="button"
        className="pb-2 text-xs text-burgundy hover:underline"
        onClick={() => {
          if (window.confirm(`Удалить модуль «${section.title}» со всеми вопросами?`)) void run(() => deleteSection(section.id), "Модуль удалён");
        }}
      >
        удалить
      </button>
    </div>
  );
}

function QuestionForm({
  q,
  section,
  topics,
  canEdit,
  run,
  prev,
  next,
  onClose,
}: {
  q: QuestionRow;
  section: SectionRow;
  topics: TopicRow[];
  canEdit: boolean;
  run: Run;
  prev: QuestionRow | null;
  next: QuestionRow | null;
  onClose: () => void;
}) {
  const [d, setD] = useState<QuestionRow>({ ...q, options: [...q.options] });
  const [busy, setBusy] = useState(false);
  const sectionTopics = topics.filter((t) => t.section === section.section);
  const issues = questionIssues(d);
  const dis = !canEdit;

  return (
    <div className="space-y-3 border-t border-white/[0.07] px-3 py-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          {section.section === "verbal" || d.passage ? (
            <div>
              <Label>Отрывок (текст для чтения)</Label>
              <Textarea value={d.passage} onChange={(e) => setD({ ...d, passage: e.target.value })} disabled={dis} className="min-h-20" aria-label="Отрывок" />
            </div>
          ) : null}
          <div>
            <Label>Вопрос · формулы между $…$</Label>
            <Textarea value={d.stem} onChange={(e) => setD({ ...d, stem: e.target.value })} disabled={dis} className="min-h-16" aria-label="Текст вопроса" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={d.kind}
              disabled={dis}
              onChange={(e) => {
                const kind = e.target.value as "choice" | "input";
                setD({ ...d, kind, options: kind === "choice" && d.options.length < 2 ? ["", "", "", ""] : kind === "input" ? [] : d.options, answer: "" });
              }}
              aria-label="Тип ответа"
              className="!w-48"
            >
              <option value="choice">Выбор варианта</option>
              <option value="input">Ученик вписывает ответ</option>
            </Select>
            <label className="text-xs text-muted">
              Картинка{" "}
              <input
                type="file"
                accept="image/*"
                disabled={dis}
                className="text-xs"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const raw = await new Promise<string>((res) => {
                    const r = new FileReader();
                    r.onload = () => res(String(r.result));
                    r.readAsDataURL(f);
                  });
                  setD({ ...d, image: await compressImage(raw) });
                }}
              />
            </label>
            {d.image ? (
              <button type="button" disabled={dis} className="text-xs text-burgundy hover:underline" onClick={() => setD({ ...d, image: "" })}>
                убрать картинку
              </button>
            ) : null}
          </div>
          {d.kind === "choice" ? (
            <div className="space-y-1.5">
              {d.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={dis}
                    onClick={() => setD({ ...d, answer: LETTERS[i] })}
                    aria-pressed={d.answer.toUpperCase() === LETTERS[i]}
                    title="Сделать правильным"
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${d.answer.toUpperCase() === LETTERS[i] ? "border-emerald-500 bg-emerald-500 text-white" : "border-white/20 text-navy hover:border-emerald-500/60"}`}
                  >
                    {LETTERS[i]}
                  </button>
                  <Input value={o} disabled={dis} onChange={(e) => setD({ ...d, options: d.options.map((x, k) => (k === i ? e.target.value : x)) })} aria-label={`Вариант ${LETTERS[i]}`} />
                  {d.options.length > 2 && !dis ? (
                    <button type="button" className="text-xs text-muted hover:text-burgundy" onClick={() => setD({ ...d, options: d.options.filter((_, k) => k !== i), answer: "" })} aria-label={`Убрать вариант ${LETTERS[i]}`}>
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
              {d.options.length < 6 && !dis ? (
                <button type="button" className="text-xs text-gold hover:underline" onClick={() => setD({ ...d, options: [...d.options, ""] })}>
                  + вариант
                </button>
              ) : null}
              <p className="text-xs text-muted">Нажмите на букву, чтобы отметить правильный ответ.</p>
            </div>
          ) : (
            <div>
              <Label>Правильный ответ · несколько через «;»</Label>
              <Input value={d.answer} disabled={dis} onChange={(e) => setD({ ...d, answer: e.target.value })} placeholder="3/4; 0.75" aria-label="Правильный ответ" />
              <p className="mt-1 text-xs text-muted">Дроби и десятичные засчитываются как одно: 3/4 = 0.75 = ,75</p>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Label>Тема</Label>
              <Select
                value={d.topic_id ?? (d.topic_label ? "__label" : "")}
                disabled={dis}
                onChange={(e) => setD({ ...d, topic_id: e.target.value && e.target.value !== "__label" ? e.target.value : null, topic_label: e.target.value === "__label" ? d.topic_label || "Другая тема" : "" })}
                aria-label="Тема"
              >
                <option value="">— выберите —</option>
                {sectionTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value="__label">Своя тема…</option>
              </Select>
            </div>
            {!d.topic_id && d.topic_label ? <Input value={d.topic_label} disabled={dis} onChange={(e) => setD({ ...d, topic_label: e.target.value })} aria-label="Своя тема" className="!w-56" /> : null}
            <div>
              <Label>Баллы</Label>
              <Input
                value={String(d.points)}
                disabled={dis}
                inputMode="decimal"
                onChange={(e) => setD({ ...d, points: Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")) || 0 })}
                aria-label="Баллы"
                className="!w-20"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Как увидит ученик</p>
          {d.passage ? <MathText text={d.passage} className="mt-2 block leading-relaxed text-navy" /> : null}
          {d.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.image} alt="Иллюстрация к вопросу" className="mt-2 max-h-64 rounded-lg" />
          ) : null}
          <MathText text={d.stem} className="mt-2 block font-semibold text-navy" />
          {d.kind === "choice" ? (
            <ul className="mt-2 space-y-1">
              {d.options.map((o, i) => (
                <li key={i} className="flex gap-2 text-navy">
                  <span className="font-semibold">{LETTERS[i]})</span>
                  <MathText text={o} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">[поле для ввода ответа]</p>
          )}
        </div>
      </div>

      {issues.length ? <p className="text-xs text-burgundy">Проверьте: {issues.join(", ")}</p> : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const { id, section_id, kind, passage, stem, image, options, answer, topic_id, topic_label, points } = d;
              const ok = await run(
                () => saveQuestion({ id, section_id, kind, passage, stem, image, options, answer: kind === "choice" ? answer.trim().toUpperCase() : answer.trim(), topic_id, topic_label, points }),
                `Вопрос ${q.position} сохранён`,
              );
              setBusy(false);
              if (ok) onClose();
            }}
          >
            Сохранить вопрос
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          {prev ? (
            <button type="button" className="text-xs text-muted hover:text-navy" onClick={() => void run(() => swapQuestions(q, prev), "Порядок изменён")}>
              ↑ выше
            </button>
          ) : null}
          {next ? (
            <button type="button" className="text-xs text-muted hover:text-navy" onClick={() => void run(() => swapQuestions(q, next), "Порядок изменён")}>
              ↓ ниже
            </button>
          ) : null}
          <button
            type="button"
            className="ml-auto text-xs text-burgundy hover:underline"
            onClick={() => {
              if (window.confirm(`Удалить вопрос ${q.position}?`)) void run(() => deleteQuestion(q.id), "Вопрос удалён");
            }}
          >
            удалить вопрос
          </button>
        </div>
      ) : null}
    </div>
  );
}
