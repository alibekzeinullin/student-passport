"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStudents } from "@/context/StudentsContext";
import { fetchBookReports, peekBookReports, type BookReport } from "@/lib/book-reports";
import { ReportPanel, ReportPill } from "@/components/books/BookReportBits";

type Tab = "review" | "rating";

export function AdminBooks() {
  const { students } = useStudents();
  const [tab, setTab] = useState<Tab>("review");
  const [reports, setReports] = useState<BookReport[]>(() => peekBookReports() ?? []);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      fetchBookReports().then(
        (list) => {
          setReports(list);
          setError("");
        },
        (err: unknown) => {
          console.error(err);
          setError("Отзывы на книги ещё не подключены: выполните supabase/setup-all.sql в Supabase → SQL Editor.");
        },
      ),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const name = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.lastName} ${s.firstName}`.trim() : "Ученик";
  };

  const queue = useMemo(
    () => reports.filter((r) => r.status === "submitted").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
    [reports],
  );
  const current = queue.find((q) => q.id === openId) ?? queue[0] ?? null;
  const recent = useMemo(
    () =>
      reports
        .filter((r) => r.reviewedAt)
        .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))
        .slice(0, 8),
    [reports],
  );

  const rows = useMemo(() => {
    return students
      .filter((s) => s.status !== "paused")
      .map((s) => {
        const mine = reports.filter((r) => r.studentId === s.id);
        return {
          student: s,
          accepted: mine.filter((r) => r.status === "accepted"),
          pending: mine.filter((r) => r.status === "submitted").length,
          reading: s.books.filter((b) => b.status === "Читаю").length,
        };
      })
      .sort((a, b) => b.accepted.length - a.accepted.length || a.student.lastName.localeCompare(b.student.lastName));
  }, [students, reports]);
  const total = rows.reduce((sum, r) => sum + r.accepted.length, 0);
  const max = Math.max(5, ...rows.map((r) => r.accepted.length));

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "review", label: "Проверка", badge: queue.length },
    { key: "rating", label: "Рейтинг" },
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
              tab === t.key ? "border-gold bg-gold text-gold-ink" : "border-white/10 text-muted hover:text-navy"
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === t.key ? "bg-gold-ink/15" : "bg-burgundy text-white"}`}>
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? <p className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</p> : null}

      {tab === "review" ? (
        !current ? (
          <div className="space-y-4">
            <p className="rounded-3xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted">
              Новых отзывов нет ✓
            </p>
            {recent.length ? (
              <div>
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Недавно проверены</h3>
                <ul className="space-y-1.5 text-sm">
                  {recent.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 text-muted">
                      <span className="text-navy">{name(r.studentId)}</span>· «{r.title}»
                      <ReportPill status={r.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <ul className="sp-glass max-h-[70vh] overflow-y-auto rounded-3xl border p-1.5">
              {queue.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(q.id)}
                    className={`w-full rounded-2xl px-3 py-2.5 text-left text-sm transition hover:bg-white/[0.04] ${q.id === current.id ? "bg-white/[0.06]" : ""}`}
                  >
                    <span className="block text-navy">{name(q.studentId)}</span>
                    <span className="block truncate text-xs text-muted">«{q.title}»</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="sp-glass min-w-0 space-y-3 rounded-3xl border px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/admin/students/${current.studentId}`} className="text-sm text-gold hover:underline">
                    {name(current.studentId)}
                  </Link>
                  <h3 className="mt-0.5 text-xl font-light text-navy">
                    «{current.title}»{current.author ? <span className="text-base text-muted"> — {current.author}</span> : null}
                  </h3>
                </div>
                <span className="text-xs text-muted">
                  {new Date(current.submittedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </span>
              </div>
              <ReportPanel
                key={current.id}
                book={{ id: current.bookId, title: current.title, author: current.author, status: "Прочитано" }}
                report={current}
                mode="admin"
                studentId={current.studentId}
                onDone={async () => {
                  setOpenId(null);
                  await reload();
                }}
              />
            </div>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Засчитано по группе: <span className="text-navy">{total}</span> книг · в среднем{" "}
            {rows.length ? (total / rows.length).toFixed(1) : 0} на ученика. Ученики видят только своё место, без чужих имён.
          </p>
          <ol className="sp-glass rounded-3xl border px-2 py-1">
            {rows.map((r) => {
              const place = rows.findIndex((x) => x.accepted.length === r.accepted.length) + 1;
              return (
                <li key={r.student.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.05] px-3 py-2.5 first:border-t-0">
                  <span className={`w-6 text-sm tabular-nums ${place <= 3 && r.accepted.length > 0 ? "text-gold" : "text-muted"}`}>{place}</span>
                  <Link
                    href={`/admin/students/${r.student.id}#sec-books`}
                    className="min-w-0 flex-1 truncate text-sm text-navy hover:text-gold sm:max-w-[14rem]"
                  >
                    {r.student.lastName} {r.student.firstName}
                  </Link>
                  <span className="order-last h-1.5 w-full overflow-hidden rounded-full bg-white/10 sm:order-none sm:w-auto sm:flex-1">
                    <span className="block h-full rounded-full bg-gold/70" style={{ width: `${(r.accepted.length / max) * 100}%` }} />
                  </span>
                  <span className="w-10 text-right text-sm tabular-nums text-navy">{r.accepted.length}</span>
                  <span
                    className="w-40 truncate text-right text-[11px] text-muted"
                    title={r.accepted.map((b) => b.title).join(", ")}
                  >
                    {r.pending
                      ? `${r.pending} на проверке`
                      : r.reading
                        ? `читает ${r.reading}`
                        : r.accepted.length
                          ? `последняя: «${r.accepted[r.accepted.length - 1].title}»`
                          : "пока нет"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
