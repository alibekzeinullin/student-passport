"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { AdminBooks } from "@/components/books/AdminBooks";

export default function AdminBooksPage() {
  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Книги</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Отзывы и рейтинг</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Ученик отмечает книгу «Прочитано» и пишет короткий отзыв. «Засчитать» добавляет книгу в рейтинг, «Вернуть» — ученик
            дописывает отзыв. Книгу можно засчитать и без отзыва — на странице ученика, в разделе «Книги».
          </p>
        </div>
        <AdminBooks />
      </div>
    </RequireAuth>
  );
}
