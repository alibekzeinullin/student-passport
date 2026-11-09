"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import type { Book, BookStatus } from "@/lib/types";
import {
  RECOMMENDED_BOOKS,
  RECOMMENDED_BOOKS_NOTE,
} from "@/lib/recommended-books";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { TableScroll } from "@/components/ui/TableScroll";
import {
  acceptedCount,
  fetchBookReports,
  fetchBookReportsByParentToken,
  fetchMyBookRank,
  peekBookReports,
  type BookRank,
  type BookReport,
} from "@/lib/book-reports";
import { BooksRankStrip, ReportCell, ReportPanel, type BooksMode } from "@/components/books/BookReportBits";

const STATUSES: BookStatus[] = ["В планах", "Читаю", "Прочитано"];

interface BooksTableProps {
  books: Book[];
  editable?: boolean;
  onChange?: (books: Book[]) => void;
  /** Для отзывов и рейтинга */
  studentId: string;
  mode: BooksMode;
  parentToken?: string;
}

export function BooksTable({
  books,
  editable = false,
  onChange,
  studentId,
  mode,
  parentToken,
}: BooksTableProps) {
  const [showRec, setShowRec] = useState(false);
  const [reports, setReports] = useState<BookReport[]>(() => (mode !== "parent" ? (peekBookReports(studentId) ?? []) : []));
  const [rank, setRank] = useState<BookRank | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchAll = useCallback(
    () =>
      Promise.all([
        (mode === "parent" ? fetchBookReportsByParentToken(parentToken ?? "") : fetchBookReports(studentId)).catch(
          () => null, // таблица ещё не создана — просто без отзывов
        ),
        mode === "student" ? fetchMyBookRank().catch(() => null) : Promise.resolve(null),
      ]),
    [mode, parentToken, studentId],
  );

  const loadReports = async () => {
    const [list, r] = await fetchAll();
    if (list) setReports(list);
    setRank(r);
  };

  useEffect(() => {
    let cancelled = false;
    void fetchAll().then(([list, r]) => {
      if (cancelled) return;
      if (list) setReports(list);
      setRank(r);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  const reportFor = (bookId: string) => reports.find((r) => r.bookId === bookId);
  const pending = reports.filter((r) => r.status === "submitted").length;

  const updateRow = (id: string, patch: Partial<Book>) => {
    if (!onChange) return;
    onChange(books.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    // Отметил «Прочитано» — сразу предлагаем написать отзыв
    if (patch.status === "Прочитано" && mode === "student" && !reportFor(id)) setOpenId(id);
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
      <BooksRankStrip mode={mode} accepted={acceptedCount(reports)} pending={pending} rank={rank} />
      <Card>
        <CardHeader
          title="Мой список книг"
          subtitle="Прочитал — напиши короткий отзыв, ментор засчитает книгу в рейтинг"
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
                  <th className="px-5 py-3 font-semibold">Автор</th>
                  <th className="px-5 py-3 font-semibold">Статус</th>
                  <th className="px-5 py-3 font-semibold">Зачёт</th>
                  {editable ? <th className="px-5 py-3 font-semibold" /> : null}
                </tr>
              </thead>
              <tbody>
                {books.length === 0 ? (
                  <tr>
                    <td
                      colSpan={editable ? 5 : 4}
                      className="px-5 py-8 text-center text-muted"
                    >
                      Личный список пока пуст — добавьте книгу или выберите в рекомендациях ниже
                    </td>
                  </tr>
                ) : (
                  books.map((item) => {
                    const done = item.status === "Прочитано";
                    const report = reportFor(item.id);
                    const open = openId === item.id;
                    return (
                      <Fragment key={item.id}>
                      <tr
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
                        <td className="px-5 py-3 align-middle">
                          <ReportCell
                            book={item}
                            report={report}
                            mode={mode}
                            open={open}
                            onToggle={() => setOpenId(open ? null : item.id)}
                          />
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
                      {open ? (
                        <tr className="border-t border-light-gray/50">
                          <td colSpan={editable ? 5 : 4} className="px-5 pb-4 pt-1">
                            <ReportPanel
                              key={`${item.id}-${report?.status ?? "none"}`}
                              book={item}
                              report={report}
                              mode={mode}
                              studentId={studentId}
                              onDone={async () => {
                                await loadReports();
                                setOpenId(null);
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableScroll>
        </CardBody>
      </Card>
      <div>
        <button
          type="button"
          onClick={() => setShowRec((v) => !v)}
          aria-expanded={showRec}
          className="flex w-full items-center justify-between rounded-2xl border border-gold/30 bg-gold/[0.05] px-4 py-3 text-left text-sm text-navy transition hover:bg-gold/[0.09]"
        >
          <span>
            Рекомендации программы <span className="text-muted">· {RECOMMENDED_BOOKS.length} книг</span>
          </span>
          <span className="text-gold">{showRec ? "Свернуть ▲" : "Показать ▼"}</span>
        </button>
        {showRec ? (
          <div className="mt-3">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
