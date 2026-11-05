"use client";

import type { EducationSystem, StudentProfile } from "@/lib/types";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import { TermHint } from "@/components/ui/TermHint";
import type { TermHintKey } from "@/lib/term-hints";
import { useState } from "react";
import { uploadAvatar } from "@/lib/avatar";

const EDUCATION_SYSTEMS: EducationSystem[] = [
  "IB",
  "AP",
  "A-Level",
  "Национальная",
];

function initials(student: StudentProfile) {
  return `${student.firstName[0] ?? ""}${student.lastName[0] ?? ""}`.toUpperCase();
}

interface ProfileHeaderProps {
  student: StudentProfile;
  editable?: boolean;
  canEditMentorNote?: boolean;
  showMentorNote?: boolean;
  onChange?: (patch: Partial<StudentProfile>) => void;
  /** Загрузка фото: ментор и сам ученик */
  onAvatarChange?: (url: string) => void;
}

export function ProfileHeader({
  student,
  editable = false,
  canEditMentorNote = false,
  showMentorNote = true,
  onChange,
  onAvatarChange,
}: ProfileHeaderProps) {
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleAvatar = async (file: File) => {
    setUploading(true);
    setAvatarError("");
    try {
      const url = await uploadAvatar(student.id, file);
      onAvatarChange?.(url);
    } catch (err) {
      console.error(err);
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
      setAvatarError(
        msg.toLowerCase().includes("bucket")
          ? "Хранилище фото не подключено: выполните supabase/migration-avatars.sql."
          : msg || "Не удалось загрузить фото",
      );
    } finally {
      setUploading(false);
    }
  };
  const note = student.mentorNote?.trim() ?? "";
  const longNote = note.length > 420;

  return (
    <div className="space-y-4">
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex shrink-0 flex-col items-start gap-1">
          <label
            className={`group relative flex size-20 items-center justify-center overflow-hidden rounded-full border-2 border-gold/80 bg-gold/10 text-2xl font-light tracking-wide text-gold sm:size-24 ${
              onAvatarChange ? "cursor-pointer" : ""
            }`}
            title={onAvatarChange ? "Загрузить фото" : undefined}
          >
            {student.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={student.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              initials(student)
            )}
            {onAvatarChange ? (
              <>
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  {uploading ? "…" : student.avatarUrl ? "Сменить" : "Фото"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Загрузить фото профиля"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAvatar(f);
                    e.target.value = "";
                  }}
                />
              </>
            ) : null}
          </label>
          {avatarError ? <p className="max-w-40 text-[11px] text-burgundy">{avatarError}</p> : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gold sm:text-xs">
            {[student.className ? `${student.className} класс` : "", student.school, student.educationSystem]
              .filter(Boolean)
              .join(" · ")}
            <TermHint term={student.educationSystem as TermHintKey} />
          </p>
          <h2 className="mt-1.5 text-3xl font-light leading-[1.05] tracking-tight text-navy sm:text-5xl">
            {student.firstName} <span className="font-semibold">{student.lastName}</span>
          </h2>
        </div>

        {editable && onChange ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className="self-start rounded-full border border-white/15 px-4 py-2 text-sm text-navy transition hover:border-gold/60 sm:self-center"
          >
            {editing ? "Готово" : "✎ Данные ученика"}
          </button>
        ) : null}
      </div>

      {editable && onChange && editing ? (
        <div className="sp-glass sp-rise grid gap-4 rounded-3xl border px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          <div>
            <Label>Имя</Label>
            <Input value={student.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
          </div>
          <div>
            <Label>Фамилия</Label>
            <Input value={student.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
          </div>
          <div>
            <Label>Класс</Label>
            <Input value={student.className} onChange={(e) => onChange({ className: e.target.value })} />
          </div>
          <div>
            <Label>Школа</Label>
            <Input value={student.school} onChange={(e) => onChange({ school: e.target.value })} />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <Label>
              <span className="inline-flex items-center gap-1.5">
                Система обучения
                <TermHint term={student.educationSystem as TermHintKey} />
              </span>
            </Label>
            <Select
              value={student.educationSystem}
              onChange={(e) => onChange({ educationSystem: e.target.value as EducationSystem })}
            >
              {EDUCATION_SYSTEMS.map((system) => (
                <option key={system} value={system}>
                  {system}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      {showMentorNote ? (
        <section className="relative overflow-hidden rounded-[28px] border border-gold/30 bg-gradient-to-br from-[#22202a] to-[#1a2232] px-5 py-6 sm:py-7 sm:pl-[4.5rem] sm:pr-9">
          <span aria-hidden className="pointer-events-none absolute left-5 top-1 hidden font-serif text-[96px] leading-none text-gold sm:block">
            “
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">Обратная связь ментора</p>
            <span className="text-xs text-muted">видят ментор и родители</span>
          </div>

          {canEditMentorNote && onChange && editingNote ? (
            <div className="mt-3 space-y-3">
              <Textarea
                className="min-h-40 text-base leading-relaxed"
                value={student.mentorNote}
                placeholder="Какой ученик, сильные стороны, точка роста — без лимита на слова"
                onChange={(e) => onChange({ mentorNote: e.target.value })}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setEditingNote(false)}
                className="rounded-full bg-gold px-5 py-2 text-sm font-medium text-gold-ink"
              >
                Готово
              </button>
            </div>
          ) : note ? (
            <>
              <p
                className={`mt-3 whitespace-pre-wrap text-base leading-relaxed text-navy sm:text-[17px] ${
                  longNote && !expanded ? "line-clamp-5" : ""
                }`}
              >
                {note}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {longNote ? (
                  <button type="button" onClick={() => setExpanded((v) => !v)} className="text-gold hover:underline">
                    {expanded ? "Свернуть" : "Читать полностью"}
                  </button>
                ) : null}
                {canEditMentorNote && onChange ? (
                  <button type="button" onClick={() => setEditingNote(true)} className="text-muted hover:text-navy">
                    Редактировать
                  </button>
                ) : null}
              </div>
            </>
          ) : canEditMentorNote && onChange ? (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="mt-3 text-left text-base text-muted hover:text-navy"
            >
              Напишите, какой это ученик: сильные стороны и точка роста. Родители увидят это первым. <span className="text-gold">Написать →</span>
            </button>
          ) : (
            <p className="mt-3 text-sm text-muted">Ментор пока не оставил обратную связь.</p>
          )}

          <GrowthPoints
            zones={student.growthZones}
            editable={Boolean(canEditMentorNote && onChange)}
            onChange={(growthZones) => onChange?.({ growthZones })}
          />
        </section>
      ) : null}
    </div>
  );
}

/** «Точки роста» — 2–3 коротких пункта внутри карточки обратной связи (бывшие «Зоны роста»). */
function GrowthPoints({
  zones,
  editable,
  onChange,
}: {
  zones: StudentProfile["growthZones"];
  editable: boolean;
  onChange: (zones: StudentProfile["growthZones"]) => void;
}) {
  const [editingZones, setEditingZones] = useState(false);
  const list = zones.filter((z) => z.text.trim() || editingZones);
  if (!editable && list.length === 0) return null;

  return (
    <div className="mt-5 border-t border-white/[0.08] pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">Точки роста</p>
        {editable ? (
          <button
            type="button"
            onClick={() => setEditingZones((v) => !v)}
            className="text-xs text-muted hover:text-navy"
          >
            {editingZones ? "Готово" : list.length ? "Изменить" : "+ Добавить"}
          </button>
        ) : null}
      </div>
      {editingZones ? (
        <div className="mt-2 space-y-2">
          {zones.map((z, i) => (
            <div key={z.id} className="flex items-center gap-2">
              <span className="w-4 text-sm text-gold">{i + 1}</span>
              <Input
                value={z.text}
                onChange={(e) => onChange(zones.map((x) => (x.id === z.id ? { ...x, text: e.target.value } : x)))}
                placeholder="Например: распределять время между учёбой и спортом"
                aria-label={`Точка роста ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => onChange(zones.filter((x) => x.id !== z.id))}
                aria-label="Удалить"
                className="px-1 text-muted hover:text-burgundy"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...zones, { id: `gz-${Date.now().toString(36)}`, text: "" }])}
            className="text-sm text-gold hover:underline"
          >
            + Точка роста
          </button>
        </div>
      ) : list.length ? (
        <ol className="mt-2 space-y-1.5 text-[15px] text-navy">
          {list.map((z, i) => (
            <li key={z.id} className="flex gap-2">
              <span className="text-gold">{i + 1}.</span>
              <span>{z.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted">2–3 конкретные вещи, над которыми ученик работает сейчас.</p>
      )}
    </div>
  );
}
