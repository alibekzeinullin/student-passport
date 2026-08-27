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
        achieved: false,
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
          focuses.map((focus) => {
            const achieved = Boolean(focus.achieved);
            return (
              <div
                key={focus.id}
                className={`rounded-md border p-4 transition-colors ${
                  achieved
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-light-gray bg-[#fafafa]"
                }`}
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
                    <label className="flex items-center gap-2 text-sm text-navy">
                      <input
                        type="checkbox"
                        checked={achieved}
                        onChange={(e) =>
                          updateFocus(focus.id, { achieved: e.target.checked })
                        }
                        className="size-4 accent-emerald-600"
                      />
                      Цель достигнута
                    </label>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-burgundy">
                        {focus.month}
                      </p>
                      {achieved ? (
                        <span className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          Достигнуто
                        </span>
                      ) : null}
                    </div>
                    <h4 className="mt-1 text-base font-semibold text-navy">
                      {focus.title}
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {focus.description}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}
