"use client";

import type { Book, BookStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { TableScroll } from "@/components/ui/TableScroll";

const STATUSES: BookStatus[] = ["В планах", "Читаю", "Прочитано"];

interface BooksTableProps {
  books: Book[];
  editable?: boolean;
  onChange?: (books: Book[]) => void;
}

export function BooksTable({
  books,
  editable = false,
  onChange,
}: BooksTableProps) {
  const updateRow = (id: string, patch: Partial<Book>) => {
    if (!onChange) return;
    onChange(books.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addRow = () => {
    if (!onChange) return;
    onChange([
      ...books,
      {
        id: `b-${Date.now()}`,
        title: "",
        author: "",
        status: "В планах",
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (!onChange) return;
    onChange(books.filter((item) => item.id !== id));
  };

  return (
    <Card>
      <CardHeader
        title="Книги к прочтению"
        subtitle="Список книг, которые планируете прочитать"
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
              <th className="px-5 py-3 font-semibold">Название</th>
              <th className="px-5 py-3 font-semibold">Автор</th>
              <th className="px-5 py-3 font-semibold">Статус</th>
              {editable ? <th className="px-5 py-3 font-semibold" /> : null}
            </tr>
          </thead>
          <tbody>
            {books.length === 0 ? (
              <tr>
                <td
                  colSpan={editable ? 4 : 3}
                  className="px-5 py-8 text-center text-muted"
                >
                  Список пока пуст
                </td>
              </tr>
            ) : (
              books.map((item) => {
                const done = item.status === "Прочитано";
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
                        value={item.title}
                        placeholder="Название книги"
                        onChange={(e) =>
                          updateRow(item.id, { title: e.target.value })
                        }
                      />
                    ) : (
                      item.title
                    )}
                  </td>
                  <td className="px-5 py-3 text-navy/80">
                    {editable ? (
                      <Input
                        value={item.author}
                        placeholder="Автор"
                        onChange={(e) =>
                          updateRow(item.id, { author: e.target.value })
                        }
                      />
                    ) : (
                      item.author || "—"
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {editable ? (
                      <Select
                        value={item.status}
                        onChange={(e) =>
                          updateRow(item.id, {
                            status: e.target.value as BookStatus,
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
                            : "bg-gold/20 text-navy"
                        }`}
                      >
                        {item.status}
                      </span>
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
