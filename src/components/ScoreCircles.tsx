"use client";

import type { StudentProfile } from "@/lib/types";
import {
  calculateAcademicSuccessScore,
  clampScore,
} from "@/lib/academic-score";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Field";

interface ScoreCirclesProps {
  student: StudentProfile;
  editable?: boolean;
  onChange?: (patch: Partial<StudentProfile>) => void;
}

export function ScoreCircles({
  student,
  editable = false,
  onChange,
}: ScoreCirclesProps) {
  const academic = calculateAcademicSuccessScore(student);

  return (
    <Card>
      <CardHeader
        title="Индикаторы прогресса"
        subtitle="100-балльная шкала: посещаемость и задания выставляет ментор; академ успехи считаются автоматически"
      />
      <CardBody>
        <div className="grid gap-6 sm:grid-cols-3">
          <ScoreCircle
            label="Посещаемость"
            value={student.attendanceScore}
            accent="#7F2231"
            editable={editable}
            onValueChange={
              editable && onChange
                ? (value) => onChange({ attendanceScore: clampScore(value) })
                : undefined
            }
          />
          <ScoreCircle
            label="Выполнение заданий"
            value={student.assignmentsScore}
            accent="#23334A"
            editable={editable}
            onValueChange={
              editable && onChange
                ? (value) => onChange({ assignmentsScore: clampScore(value) })
                : undefined
            }
          />
          <ScoreCircle
            label="Академ успехи"
            value={academic}
            accent="#CBB073"
            hint="GPA · академ активность · проекты · книги · навыки"
          />
        </div>
      </CardBody>
    </Card>
  );
}

function ScoreCircle({
  label,
  value,
  accent,
  editable,
  onValueChange,
  hint,
}: {
  label: string;
  value: number;
  accent: string;
  editable?: boolean;
  onValueChange?: (value: number) => void;
  hint?: string;
}) {
  const size = 112;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safe = clampScore(value);
  const offset = circumference - (safe / 100) * circumference;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#D1D1D1"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold text-navy">{safe}</span>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-navy">{label}</p>
      {hint ? <p className="mt-1 max-w-[12rem] text-xs text-muted">{hint}</p> : null}
      {editable && onValueChange ? (
        <div className="mt-3 w-full max-w-[9rem]">
          <Label>Балл (0–100)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={safe}
            onChange={(e) => {
              const raw = e.target.value;
              onValueChange(raw === "" ? 0 : Number.parseFloat(raw));
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
