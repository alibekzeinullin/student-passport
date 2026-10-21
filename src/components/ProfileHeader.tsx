"use client";

import type { EducationSystem, StudentProfile } from "@/lib/types";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import { TermHint } from "@/components/ui/TermHint";
import type { TermHintKey } from "@/lib/term-hints";

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
}

export function ProfileHeader({
  student,
  editable = false,
  canEditMentorNote = false,
  showMentorNote = true,
  onChange,
}: ProfileHeaderProps) {
  return (
    <div className="sp-glass overflow-hidden rounded-3xl border">
      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-burgundy-deep/40 blur-3xl"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex size-16 shrink-0 items-center justify-center self-start rounded-full border-[1.5px] border-gold/80 bg-gold/10 text-xl font-light tracking-wide text-gold sm:size-20 sm:text-2xl">
            {student.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={student.avatarUrl}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials(student)
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gold sm:text-xs">
              <span className="sp-pulse inline-block size-2 rounded-full bg-gold" aria-hidden />
              {[student.className, student.school].filter(Boolean).join(" · ") || "Ученик"}
            </p>
            <h2 className="mt-2 text-3xl font-light leading-[1.05] tracking-tight text-navy sm:text-5xl">
              {student.firstName}{" "}
              <span className="font-semibold">{student.lastName}</span>
            </h2>
            <p className="mt-3 inline-flex flex-wrap items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted">
              <span>{student.educationSystem}</span>
              <TermHint term={student.educationSystem as TermHintKey} />
            </p>
          </div>
        </div>
      </div>

      {editable && onChange ? (
        <div className="grid gap-4 border-t border-white/[0.07] px-5 py-5 sm:grid-cols-2 lg:grid-cols-3 sm:px-8">
          <div>
            <Label>Имя</Label>
            <Input
              value={student.firstName}
              onChange={(e) => onChange({ firstName: e.target.value })}
            />
          </div>
          <div>
            <Label>Фамилия</Label>
            <Input
              value={student.lastName}
              onChange={(e) => onChange({ lastName: e.target.value })}
            />
          </div>
          <div>
            <Label>Класс</Label>
            <Input
              value={student.className}
              onChange={(e) => onChange({ className: e.target.value })}
            />
          </div>
          <div>
            <Label>Школа</Label>
            <Input
              value={student.school}
              onChange={(e) => onChange({ school: e.target.value })}
            />
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
              onChange={(e) =>
                onChange({
                  educationSystem: e.target.value as EducationSystem,
                })
              }
            >
              {EDUCATION_SYSTEMS.map((system) => (
                <option key={system} value={system}>
                  {system}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 border-t border-light-gray px-4 py-3 text-sm sm:grid-cols-3 sm:px-6 sm:py-4">
          <Meta label="Класс" value={student.className} />
          <Meta label="Школа" value={student.school} />
          <Meta
            label="Система обучения"
            value={student.educationSystem}
            hintTerm={student.educationSystem as TermHintKey}
          />
        </div>
      )}

      {showMentorNote ? (
      <div className="border-t border-light-gray px-4 py-3 sm:px-6 sm:py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Обратная связь от ментора
        </p>
        {canEditMentorNote && onChange ? (
          <Textarea
            className="mt-2 min-h-32"
            value={student.mentorNote}
            placeholder="Обратная связь от ментора — без лимита на слова"
            onChange={(e) => onChange({ mentorNote: e.target.value })}
          />
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-navy/90">
            {student.mentorNote?.trim()
              ? student.mentorNote
              : "Ментор пока не оставил обратную связь."}
          </p>
        )}
      </div>
      ) : null}
    </div>
  );
}

function Meta({
  label,
  value,
  hintTerm,
}: {
  label: string;
  value: string;
  hintTerm?: TermHintKey;
}) {
  return (
    <div>
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {hintTerm ? <TermHint term={hintTerm} /> : null}
      </p>
      <p className="mt-1 break-words font-medium text-navy">{value}</p>
    </div>
  );
}
