"use client";

import { useState } from "react";
import Link from "next/link";
import type { Book } from "@/lib/types";
import {
  BOOK_REPORT_LABELS,
  REVIEW_MIN_CHARS,
  acceptBookDirectly,
  reviewBookReport,
  submitBookReport,
  type BookRank,
  type BookReport,
} from "@/lib/book-reports";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";

export type BooksMode = "student" | "admin" | "parent";

const PILL: Record<BookReport["status"], string> = {
  submitted: "border-gold/40 bg-gold/10 text-gold",
  accepted: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
  revision: "border-burgundy/50 bg-burgundy/15 text-burgundy",
};

export function ReportPill({ status }: { status: BookReport["status"] }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${PILL[status]}`}>
      {status === "accepted" ? "✓ " : ""}
      {BOOK_REPORT_LABELS[status]}
    </span>
  );
}

/** Ячейка «Зачёт» в строке книги. */
export function ReportCell({
  book,
  report,
  mode,
  open,
  onToggle,
}: {
  book: Book;
  report: BookReport | undefined;
  mode: BooksMode;
  open: boolean;
  onToggle: () => void;
}) {
  if (report) {
    return (
      <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex items-center gap-1.5 text-left" title="Открыть отзыв">
        <ReportPill status={report.status} />
        <span className="text-xs text-muted">{open ? "▲" : "▼"}</span>
      </button>
    );
  }
  if (book.status !== "Прочитано" || mode === "parent") return <span className="text-xs text-muted">—</span>;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="whitespace-nowrap rounded-full border border-gold/50 px-3 py-1 text-xs text-gold transition hover:bg-gold/10"
    >
      {mode === "student" ? "Написать отзыв" : "Засчитать"}
    </button>
  );
}

/** Раскрытая панель под строкой: отзыв ученика и решение ментора. */
export function ReportPanel({
  book,
  report,
  mode,
  studentId,
  onDone,
}: {
  book: Book;
  report: BookReport | undefined;
  mode: BooksMode;
  studentId: string;
  onDone: () => Promise<void> | void;
}) {
  const [review, setReview] = useState(report?.review ?? "");
  const [comment, setComment] = useState(report?.status === "revision" ? report.mentorComment : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onDone();
    } catch (err) {
      console.error(err);
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
      setError(
        msg.includes("book_reports") && msg.includes("exist")
          ? "Отзывы ещё не подключены: выполните supabase/setup-all.sql в Supabase."
          : msg || "Не получилось сохранить",
      );
    } finally {
      setBusy(false);
    }
  };

  const title = book.title.trim() || report?.title || "Книга";
  const canWrite = mode === "student" && (!report || report.status !== "accepted");
  const tooShort = review.trim().length < REVIEW_MIN_CHARS;
  const noTitle = !book.title.trim();

  return (
    <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
      {report?.mentorComment && (report.status !== "submitted" || mode !== "admin") ? (
        <p className={`rounded-xl px-3 py-2 text-sm ${report.status === "revision" ? "bg-burgundy/10 text-navy" : "bg-gold/[0.06] text-navy"}`}>
          <span className="text-xs text-muted">Ментор: </span>
          {report.mentorComment}
        </p>
      ) : null}

      {canWrite ? (
        <>
          <div>
            <p className="text-sm text-navy">Отзыв на «{title}»</p>
            <p className="text-xs text-muted">3–5 предложений: о чём книга и что ты из неё взял для себя. Ментор прочитает и засчитает книгу в рейтинг.</p>
          </div>
          <Textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Эта книга о том, как… Мне запомнилось… Я хочу попробовать…"
            aria-label={`Отзыв на книгу ${title}`}
            className="min-h-28"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={busy || tooShort || noTitle}
              onClick={() =>
                void run(() =>
                  submitBookReport({ existingId: report?.id, studentId, bookId: book.id, title, author: book.author, review }),
                )
              }
            >
              {busy ? "Отправляю…" : report ? "Отправить снова" : "Отправить ментору"}
            </Button>
            {noTitle ? <span className="text-xs text-burgundy">Сначала впиши название книги</span> : tooShort ? <span className="text-xs text-muted">Ещё немного — минимум пара предложений</span> : null}
            {report?.status === "submitted" ? <span className="text-xs text-muted">Уже у ментора — можно поправить и отправить снова</span> : null}
          </div>
        </>
      ) : report?.review ? (
        <div>
          <p className="text-xs text-muted">Отзыв ученика</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-navy">{report.review}</p>
        </div>
      ) : report ? (
        <p className="text-sm text-muted">Засчитано без письменного отзыва.</p>
      ) : null}

      {mode === "admin" ? (
        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          {!report ? (
            <p className="text-xs text-muted">Отзыва нет. Если обсудили книгу на встрече — можно засчитать сразу.</p>
          ) : null}
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={report ? "Комментарий ученику (обязателен, если возвращаете)" : "Комментарий (необязательно)"}
            aria-label="Комментарий ментора"
            className="min-h-16"
          />
          <div className="flex flex-wrap gap-2">
            {report?.status !== "accepted" ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    report
                      ? reviewBookReport(report.id, "accepted", comment)
                      : acceptBookDirectly({ studentId, bookId: book.id, title, author: book.author, comment }),
                  )
                }
              >
                ✓ Засчитать
              </Button>
            ) : null}
            {report ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !comment.trim()}
                onClick={() => void run(() => reviewBookReport(report.id, "revision", comment))}
                title={!comment.trim() ? "Напишите, что дописать" : undefined}
              >
                {report.status === "accepted" ? "Отменить зачёт и вернуть" : "Вернуть на доработку"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-burgundy">{error}</p> : null}
    </div>
  );
}

/** Строка над списком: место в рейтинге / сколько засчитано. */
export function BooksRankStrip({
  mode,
  accepted,
  pending,
  rank,
}: {
  mode: BooksMode;
  accepted: number;
  pending: number;
  rank: BookRank | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-gold/25 bg-gold/[0.05] px-4 py-3 text-sm">
      <span className="text-navy">
        Засчитано книг: <span className="font-medium text-gold">{accepted}</span>
        {pending ? <span className="text-muted"> · {pending} на проверке</span> : null}
      </span>
      {mode === "student" && rank && rank.accepted > 0 ? (
        <span className="text-navy">
          Книжный рейтинг: <span className="font-medium text-gold">{rank.place} место</span>
          <span className="text-muted"> из {rank.totalStudents}</span>
        </span>
      ) : mode === "student" ? (
        <span className="text-muted">Прочитал книгу — поставь «Прочитано» и напиши отзыв, чтобы попасть в рейтинг</span>
      ) : null}
      {mode === "admin" ? (
        <Link href="/admin/books" className="ml-auto text-xs text-gold hover:underline">
          Рейтинг группы →
        </Link>
      ) : null}
    </div>
  );
}
