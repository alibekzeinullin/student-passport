"use client";

import type { TestScores } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Field";

function formatScore(value: number | null, suffix = "") {
  return value === null ? "—" : `${value}${suffix}`;
}

interface TestScoresCardProps {
  scores: TestScores;
  editable?: boolean;
  onChange?: (scores: TestScores) => void;
}

export function TestScoresCard({
  scores,
  editable = false,
  onChange,
}: TestScoresCardProps) {
  const fields: {
    key: keyof TestScores;
    label: string;
    step?: string;
    max?: number;
  }[] = [
    { key: "sat", label: "SAT (текущий)", step: "10", max: 1600 },
    { key: "satTarget", label: "SAT (цель)", step: "10", max: 1600 },
    { key: "ielts", label: "IELTS (текущий)", step: "0.5", max: 9 },
    { key: "ieltsTarget", label: "IELTS (цель)", step: "0.5", max: 9 },
  ];

  return (
    <Card>
      <CardHeader
        title="SAT / IELTS"
        subtitle="Академическая динамика по стандартизированным тестам"
      />
      <CardBody>
        {editable && onChange ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key}>
                <Label>{field.label}</Label>
                <Input
                  type="number"
                  step={field.step}
                  min={0}
                  max={field.max}
                  value={scores[field.key] ?? ""}
                  placeholder="—"
                  onChange={(e) => {
                    const raw = e.target.value;
                    onChange({
                      ...scores,
                      [field.key]:
                        raw === "" ? null : Number.parseFloat(raw),
                    });
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {fields.map((field) => (
              <div key={field.key}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {field.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-navy">
                  {formatScore(scores[field.key])}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
