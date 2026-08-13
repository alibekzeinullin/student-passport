"use client";

import type { GpaRecord } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Field";

function formatGpa(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}

interface GpaTableProps {
  gpa: GpaRecord;
  editable?: boolean;
  onChange?: (gpa: GpaRecord) => void;
}

export function GpaTable({ gpa, editable = false, onChange }: GpaTableProps) {
  const startLabel = gpa.startMonthLabel?.trim() || "Месяц старта менторства";

  const valueRows: { key: "start" | "january2027" | "july2027"; label: string }[] =
    [
      { key: "start", label: `GPA ${startLabel}` },
      { key: "january2027", label: "GPA Январь 2027" },
      { key: "july2027", label: "GPA Июль 2027" },
    ];

  return (
    <Card>
      <CardHeader
        title="Отслеживание GPA"
        subtitle="Первая точка — месяц начала менторства (задаёт админ)"
      />
      <CardBody className="space-y-4">
        {editable && onChange ? (
          <div className="max-w-sm px-1">
            <Label>Месяц начала менторства</Label>
            <Input
              value={gpa.startMonthLabel}
              placeholder="Напр. Август 2026"
              onChange={(e) =>
                onChange({ ...gpa, startMonthLabel: e.target.value })
              }
            />
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-light-gray/40 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Период</th>
                <th className="px-5 py-3 font-semibold">Значение</th>
              </tr>
            </thead>
            <tbody>
              {valueRows.map((row) => (
                <tr key={row.key} className="border-t border-light-gray">
                  <td className="px-5 py-3 font-medium text-navy">{row.label}</td>
                  <td className="px-5 py-3 text-navy/80">
                    {editable && onChange ? (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="5"
                        value={gpa[row.key] ?? ""}
                        placeholder="—"
                        onChange={(e) => {
                          const raw = e.target.value;
                          onChange({
                            ...gpa,
                            [row.key]:
                              raw === "" ? null : Number.parseFloat(raw),
                          });
                        }}
                        className="max-w-32"
                      />
                    ) : (
                      formatGpa(gpa[row.key])
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
