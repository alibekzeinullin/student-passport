"use client";

import type { MonthlyFocus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Field";

interface MonthlyFocusesProps {
  focuses: MonthlyFocus[];
  editable?: boolean;
  onChange?: (focuses: MonthlyFocus[]) => void;
}

export function MonthlyFocuses({
  focuses,
  editable = false,
  onChange,
}: MonthlyFocusesProps) {
  const updateFocus = (id: string, patch: Partial<MonthlyFocus>) => {
    if (!onChange) return;
    onChange(
      focuses.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const addFocus = () => {
    if (!onChange) return;
    onChange([
      ...focuses,
      {
        id: `mf-${Date.now()}`,
        month: "",
        title: "",
        description: "",
      },
    ]);
  };

  const removeFocus = (id: string) => {
    if (!onChange) return;
    onChange(focuses.filter((item) => item.id !== id));
  };

  return (
    <Card>
      <CardHeader
        title="Личные ежемесячные фокусы"
        subtitle="Индивидуальные приоритеты ученика на каждый месяц"
        action={
          editable ? (
            <Button type="button" variant="secondary" onClick={addFocus}>
              Добавить месяц
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {focuses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Личные фокусы пока не заданы
          </p>
        ) : (
          focuses.map((focus) => (
            <div
              key={focus.id}
              className="rounded-md border border-light-gray bg-[#fafafa] p-4"
            >
              {editable ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={focus.month}
                      placeholder="Месяц, напр. Август 2026"
                      onChange={(e) =>
                        updateFocus(focus.id, { month: e.target.value })
                      }
                    />
                    <Input
                      value={focus.title}
                      placeholder="Название фокуса"
                      onChange={(e) =>
                        updateFocus(focus.id, { title: e.target.value })
                      }
                    />
                  </div>
                  <Textarea
                    value={focus.description}
                    placeholder="Описание приоритетов месяца"
                    onChange={(e) =>
                      updateFocus(focus.id, { description: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => removeFocus(focus.id)}
                  >
                    Удалить
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-burgundy">
                    {focus.month}
                  </p>
                  <h4 className="mt-1 text-base font-semibold text-navy">
                    {focus.title}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {focus.description}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}
