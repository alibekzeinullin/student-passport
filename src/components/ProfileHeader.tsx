"use client";

import type { EducationSystem, StudentProfile } from "@/lib/types";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";

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
  onChange?: (patch: Partial<StudentProfile>) => void;
}

export function ProfileHeader({
  student,
  editable = false,
  canEditMentorNote = false,
  onChange,
}: ProfileHeaderProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-light-gray bg-card shadow-sm">
      <div className="bg-navy px-5 py-5 text-white sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-gold/70 bg-burgundy/30 text-2xl font-semibold tracking-wide">
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
            <h2 className="truncate text-2xl font-semibold tracking-tight">
              {student.lastName} {student.firstName}
            </h2>
            <p className="mt-2 text-sm text-gold">
              {student.className} · {student.school} · {student.educationSystem}
            </p>
          </div>
        </div>
      </div>

      {editable && onChange ? (
        <div className="grid gap-4 border-t border-light-gray px-5 py-4 sm:grid-cols-2 lg:grid-cols-5 sm:px-6">
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
          <div>
            <Label>Образовательная система</Label>
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
        <div className="grid gap-3 border-t border-light-gray px-5 py-4 text-sm sm:grid-cols-3 sm:px-6">
          <Meta label="Класс" value={student.className} />
          <Meta label="Школа" value={student.school} />
          <Meta label="Образовательная система" value={student.educationSystem} />
        </div>
      )}

      <div className="border-t border-light-gray px-5 py-4 sm:px-6">
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
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 font-medium text-navy">{value}</p>
    </div>
  );
}
