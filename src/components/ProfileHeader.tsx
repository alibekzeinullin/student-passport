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
    <div className="overflow-hidden rounded-lg border border-light-gray bg-card shadow-sm">
      <div className="bg-navy px-4 py-4 text-white sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center self-start rounded-full border-2 border-gold/70 bg-burgundy/30 text-xl font-semibold tracking-wide sm:h-20 sm:w-20 sm:text-2xl">
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
            <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
              {student.lastName} {student.firstName}
            </h2>
            <div className="mt-2 space-y-1 text-sm text-gold">
              <p className="break-words">{student.className}</p>
              <p className="break-words">{student.school}</p>
              <p className="inline-flex flex-wrap items-center gap-1.5 break-words">
                <span>{student.educationSystem}</span>
                <TermHint term={student.educationSystem as TermHintKey} />
              </p>
            </div>
          </div>
        </div>
      </div>

      {editable && onChange ? (
        <div className="grid gap-4 border-t border-light-gray px-5 py-4 sm:grid-cols-2 lg:grid-cols-3 sm:px-6">
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
