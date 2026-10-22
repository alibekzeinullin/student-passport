"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { AdminEssays } from "@/components/essays/AdminEssays";

export default function AdminEssaysPage() {
  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Эссе</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Проверка и рейтинг</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Ученики пишут эссе по темам и сдают на сайте. Вы ставите оценку по 4 критериям (1–10) и пишете комментарий: «Принять» засчитывает тему, «На доработку» — ученик сдаёт новую версию.
          </p>
        </div>
        <AdminEssays />
      </div>
    </RequireAuth>
  );
}
