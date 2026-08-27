"use client";

import type {
  AcademicActivity,
  AcademicActivityStatus,
  AcademicActivityType,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { TermLabel } from "@/components/ui/TermHint";
import { TableScroll } from "@/components/ui/TableScroll";

const STATUSES: AcademicActivityStatus[] = [
  "В планах",
  "Подана",
  "В процессе",
  "Завершено",
];

const TYPES: AcademicActivityType[] = [
  "Олимпиада",
  "Хакатон",
  "Academic Honor",
  "Конкурс",
  "Другое",
];

interface AcademicActivityTableProps {
  activities: AcademicActivity[];
  editable?: boolean;
  onChange?: (activities: AcademicActivity[]) => void;
}

export function AcademicActivityTable({
  activities,
  editable = false,
  onChange,
}: AcademicActivityTableProps) {
  const updateRow = (id: string, patch: Partial<AcademicActivity>) => {
    if (!onChange) return;
    onChange(
      activities.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const addRow = () => {
    if (!onChange) return;
    onChange([
      ...activities,
      {
        id: `a-${Date.now()}`,
        name: "",
        type: "Олимпиада",
        status: "В планах",
        result: "",
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (!onChange) return;
    onChange(activities.filter((item) => item.id !== id));
  };

  return (
    <Card>
      <CardHeader
        title={
          <TermLabel term="Академ активность">Академ активность</TermLabel>
        }
        subtitle="Олимпиады, хакатоны, academic honors и другие достижения"
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
        <table className="min-w-[40rem] w-full text-left text-sm">
          <thead className="bg-light-gray/40 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">Название</th>
              <th className="px-5 py-3 font-semibold">Тип</th>
              <th className="px-5 py-3 font-semibold">Статус</th>
              <th className="px-5 py-3 font-semibold">Результат</th>
              {editable ? <th className="px-5 py-3 font-semibold" /> : null}
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 ? (
              <tr>
                <td
                  colSpan={editable ? 5 : 4}
                  className="px-5 py-8 text-center text-muted"
                >
                  Записей пока нет
                </td>
              </tr>
            ) : (
              activities.map((item) => {
                const done = item.status === "Завершено";
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
                          placeholder="Название"
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
                          value={item.type}
                          onChange={(e) =>
                            updateRow(item.id, {
                              type: e.target.value as AcademicActivityType,
                            })
                          }
                        >
                          {TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-navy/80">{item.type}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {editable ? (
                        <Select
                          value={item.status}
                          onChange={(e) =>
                            updateRow(item.id, {
                              status: e.target.value as AcademicActivityStatus,
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
                        <StatusBadge status={item.status} />
                      )}
                    </td>
                    <td className="px-5 py-3 text-navy/80">
                      {editable ? (
                        <Input
                          value={item.result}
                          placeholder="Результат"
                          onChange={(e) =>
                            updateRow(item.id, { result: e.target.value })
                          }
                        />
                      ) : (
                        item.result || "—"
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

function StatusBadge({ status }: { status: AcademicActivityStatus }) {
  const tones: Record<AcademicActivityStatus, string> = {
    "В планах": "bg-light-gray/60 text-navy",
    Подана: "bg-gold/25 text-navy",
    "В процессе": "bg-burgundy/10 text-burgundy",
    Завершено: "bg-emerald-600 text-white",
  };

  return (
    <span
      className={`inline-flex rounded px-2 py-1 text-xs font-medium ${tones[status]}`}
    >
      {status}
    </span>
  );
}
