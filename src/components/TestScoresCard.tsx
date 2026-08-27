"use client";

import type { TestScores } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Field";
import { TermLabel } from "@/components/ui/TermHint";

function formatScore(value: number | null) {
  return value === null ? "—" : String(value);
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
  const groups: {
    title: "SAT" | "IELTS" | "Cambridge Test";
    currentKey: keyof TestScores;
    targetKey: keyof TestScores;
    step?: string;
    max?: number;
  }[] = [
    { title: "SAT", currentKey: "sat", targetKey: "satTarget", step: "10", max: 1600 },
    { title: "IELTS", currentKey: "ielts", targetKey: "ieltsTarget", step: "0.5", max: 9 },
    {
      title: "Cambridge Test",
      currentKey: "cambridgeTest",
      targetKey: "cambridgeTestTarget",
      step: "1",
      max: 25,
    },
  ];

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <TermLabel term="SAT">SAT</TermLabel>
            <span className="text-muted">/</span>
            <TermLabel term="IELTS">IELTS</TermLabel>
            <span className="text-muted">/</span>
            <TermLabel term="Cambridge Test">Cambridge Test</TermLabel>
          </span>
        }
        subtitle="Академическая динамика по стандартизированным тестам"
      />
      <CardBody>
        {editable && onChange ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {groups.map((group) => (
              <div key={group.title} className="rounded-md border border-light-gray p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {group.title}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label>{`${group.title} (сейчас)`}</Label>
                    <Input
                      type="number"
                      step={group.step}
                      min={0}
                      max={group.max}
                      value={scores[group.currentKey] ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const raw = e.target.value;
                        onChange({
                          ...scores,
                          [group.currentKey]:
                            raw === "" ? null : Number.parseFloat(raw),
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label>{`${group.title} (цель)`}</Label>
                    <Input
                      type="number"
                      step={group.step}
                      min={0}
                      max={group.max}
                      value={scores[group.targetKey] ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const raw = e.target.value;
                        onChange({
                          ...scores,
                          [group.targetKey]:
                            raw === "" ? null : Number.parseFloat(raw),
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {groups.map((group) => (
              <div key={group.title} className="rounded-md border border-light-gray p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {group.title}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted">{`${group.title} (сейчас)`}</p>
                    <p className="mt-1 text-base font-semibold text-navy">
                      {formatScore(scores[group.currentKey])}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">{`${group.title} (цель)`}</p>
                    <p className="mt-1 text-base font-semibold text-navy">
                      {formatScore(scores[group.targetKey])}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
