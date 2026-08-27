"use client";

import type { Skill, SkillStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { TableScroll } from "@/components/ui/TableScroll";

const STATUSES: SkillStatus[] = ["К освоению", "В процессе", "Освоен"];

interface SkillsTableProps {
  skills: Skill[];
  editable?: boolean;
  onChange?: (skills: Skill[]) => void;
}

export function SkillsTable({
  skills,
  editable = false,
  onChange,
}: SkillsTableProps) {
  const updateRow = (id: string, patch: Partial<Skill>) => {
    if (!onChange) return;
    onChange(
      skills.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const addRow = () => {
    if (!onChange) return;
    onChange([
      ...skills,
      {
        id: `sk-${Date.now()}`,
        name: "",
        status: "К освоению",
        notes: "",
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (!onChange) return;
    onChange(skills.filter((item) => item.id !== id));
  };

  return (
    <Card>
      <CardHeader
        title="Навыки к освоению"
        subtitle="Компетенции, которые развиваете в этом периоде"
        action={
          editable ? (
            <Button type="button" variant="secondary" onClick={addRow}>
              Добавить
            </Button>
          ) : null
        }
      />
      <CardBody className="p-0">
        <TableScroll>
        <table className="min-w-[32rem] w-full text-left text-sm">
          <thead className="bg-light-gray/40 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">Навык</th>
              <th className="px-5 py-3 font-semibold">Статус</th>
              <th className="px-5 py-3 font-semibold">Заметки</th>
              {editable ? <th className="px-5 py-3 font-semibold" /> : null}
            </tr>
          </thead>
          <tbody>
            {skills.length === 0 ? (
              <tr>
                <td
                  colSpan={editable ? 4 : 3}
                  className="px-5 py-8 text-center text-muted"
                >
                  Список пока пуст
                </td>
              </tr>
            ) : (
              skills.map((item) => {
                const done = item.status === "Освоен";
                return (
                <tr
                  key={item.id}
                  className={`border-t align-top transition-colors ${
                    done
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-light-gray"
                  }`}
                >
                  <td className="px-5 py-3 text-navy">
                    {editable ? (
                      <Input
                        value={item.name}
                        placeholder="Название навыка"
                        onChange={(e) =>
                          updateRow(item.id, { name: e.target.value })
                        }
                      />
                    ) : (
                      item.name
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {editable ? (
                      <Select
                        value={item.status}
                        onChange={(e) =>
                          updateRow(item.id, {
                            status: e.target.value as SkillStatus,
                          })
                        }
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          done
                            ? "bg-emerald-600 text-white"
                            : "bg-burgundy/10 text-burgundy"
                        }`}
                      >
                        {item.status}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-navy/80">
                    {editable ? (
                      <Input
                        value={item.notes}
                        placeholder="Как будете измерять прогресс"
                        onChange={(e) =>
                          updateRow(item.id, { notes: e.target.value })
                        }
                      />
                    ) : (
                      item.notes || "—"
                    )}
                  </td>
                  {editable ? (
                    <td className="px-5 py-3">
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => removeRow(item.id)}
                      >
                        Удалить
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
              })
            )}
          </tbody>
        </table>
        </TableScroll>
      </CardBody>
    </Card>
  );
}
