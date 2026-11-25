"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { LinksBoard } from "@/components/LinksBoard";

export default function MentoringLinksPage() {
  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Менторство</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Полезные ссылки</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">Материалы для учеников менторства: IELTS, эссе, поступление. Ученики видят их на странице «Ссылки».</p>
        </div>
        <LinksBoard courseId="mentoring" editable />
      </div>
    </RequireAuth>
  );
}
