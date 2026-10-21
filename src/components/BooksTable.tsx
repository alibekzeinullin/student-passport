"use client";

import type { Book, BookStatus } from "@/lib/types";
import {
  RECOMMENDED_BOOKS,
  RECOMMENDED_BOOKS_NOTE,
} from "@/lib/recommended-books";
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

  const addRecommended = (title: string, author: string) => {
    if (!onChange) return;
    const exists = books.some(
      (book) =>
        book.title.trim().toLowerCase() === title.toLowerCase() &&
        book.author.trim().toLowerCase() === author.toLowerCase(),
    );
    if (exists) return;
    onChange([
      ...books,
      {
        id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        author,
        status: "В планах",
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (!onChange) return;
    onChange(books.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-4">
      <Card className="border-gold/40">
        <CardHeader
          title="Рекомендации программы"
          subtitle={RECOMMENDED_BOOKS_NOTE}
        />
        <CardBody className="space-y-2">
          <ul className="space-y-2">
            {RECOMMENDED_BOOKS.map((book) => (
              <li
                key={`${book.title}-${book.author}`}
                className="flex flex-col gap-2 rounded-xl border border-light-gray/80 bg-white/[0.03] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="min-w-0 text-sm text-navy">
                  <span className="font-medium">«{book.title}»</span>
                  <span className="text-muted"> — {book.author}</span>
                </p>
                {editable ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => addRecommended(book.title, book.author)}
                  >
                    В мой список
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Мой список книг"
          subtitle="Личный трекинг чтения"
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
                      Личный список пока пуст — можно добавить из рекомендаций
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
                            ? "border-emerald-400/30 bg-emerald-400/[0.07]"
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
    </div>
  );
}
