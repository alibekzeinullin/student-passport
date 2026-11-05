"use client";

import { useState } from "react";
import type { Skill, SkillStatus } from "@/lib/types";

const NEXT: Record<SkillStatus, SkillStatus> = {
  "К освоению": "В процессе",
  "В процессе": "Освоен",
  Освоен: "К освоению",
};

const LABEL: Record<SkillStatus, string> = {
  "К освоению": "не начал",
  "В процессе": "прокачиваю",
  Освоен: "освоил",
};

function Dot({ status }: { status: SkillStatus }) {
  // ○ не начал · ◐ прокачиваю · ● освоил
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {status === "В процессе" ? <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" /> : null}
      {status === "Освоен" ? <circle cx="8" cy="8" r="6.5" fill="currentColor" /> : null}
    </svg>
  );
}

/** Навыки одной строкой плашек: нажатие меняет уровень ○ → ◐ → ●. */
export function SkillChips({
  skills,
  editable = false,
  canManage = false,
  onChange,
}: {
  skills: Skill[];
  editable?: boolean;
  /** Ментор: добавлять и удалять навыки */
  canManage?: boolean;
  onChange?: (skills: Skill[]) => void;
}) {
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState("");
  const done = skills.filter((s) => s.status === "Освоен").length;
  const active = skills.filter((s) => s.status === "В процессе").length;

  const cycle = (id: string) =>
    onChange?.(skills.map((s) => (s.id === id ? { ...s, status: NEXT[s.status] } : s)));

  const add = () => {
    const name = draft.trim();
    if (!name || !onChange) return;
    onChange([...skills, { id: `sk-${Date.now().toString(36)}`, name, status: "К освоению", notes: "" }]);
    setDraft("");
  };

  return (
    <div className="sp-glass rounded-3xl border px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-muted">
          {editable ? "Нажми на навык, чтобы поменять уровень: " : ""}○ не начал · ◐ прокачиваю · ● освоил
        </p>
        <span className="text-xs text-muted">
          освоено {done} · в процессе {active} · всего {skills.length}
        </span>
      </div>

      {skills.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Навыков пока нет.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {skills.map((s) => {
            const tone =
              s.status === "Освоен"
                ? "border-gold/60 bg-gold/15 text-gold"
                : s.status === "В процессе"
                  ? "border-gold/40 text-navy"
                  : "border-white/10 text-muted";
            return (
              <li key={s.id} className="flex items-center">
                {editable && !managing ? (
                  <button
                    type="button"
                    onClick={() => cycle(s.id)}
                    title={`${s.name}: ${LABEL[s.status]} — нажми, чтобы поменять`}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition hover:border-gold/70 ${tone}`}
                  >
                    <Dot status={s.status} />
                    {s.name}
                  </button>
                ) : (
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${tone}`} title={LABEL[s.status]}>
                    <Dot status={s.status} />
                    {s.name}
                    {managing ? (
                      <button
                        type="button"
                        onClick={() => onChange?.(skills.filter((x) => x.id !== s.id))}
                        aria-label={`Удалить навык ${s.name}`}
                        className="-mr-1 ml-1 rounded-full px-1 text-muted hover:text-burgundy"
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && onChange ? (
        <div className="mt-3">
          {managing ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="Новый навык"
                aria-label="Новый навык"
                className="rounded-full border border-white/10 bg-field px-3 py-1.5 text-sm text-navy outline-none focus:border-gold/60"
              />
              <button type="button" onClick={add} className="rounded-full border border-gold/50 px-3 py-1.5 text-xs text-gold hover:bg-gold/10">
                Добавить
              </button>
              <button type="button" onClick={() => setManaging(false)} className="px-2 text-xs text-muted hover:text-navy">
                Готово
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setManaging(true)} className="text-xs text-muted underline-offset-2 hover:text-navy hover:underline">
              Изменить список навыков
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
