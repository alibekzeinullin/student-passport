"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtDay, loadSatAttention, type AttentionRow } from "@/lib/lessons";

const TITLES: Record<AttentionRow["kind"], string> = {
  unmarked: "Нет посещаемости",
  oh_unread: "Office hours не прочитали",
  test_review: "Тесты без разбора",
  risk: "Ученики в зоне риска",
};

/**
 * «Требует внимания» для учителей SAT — по своим группам (у руководителя и старшего — по всем).
 * hide — какие виды не показывать (например, неотмеченные занятия, если на странице уже есть свой блок).
 */
export function SatAttention({
  today,
  hide = [],
  onOpenLesson,
  reloadKey = 0,
}: {
  today: string;
  hide?: AttentionRow["kind"][];
  onOpenLesson?: (lessonId: string, date: string | null) => void;
  reloadKey?: number;
}) {
  const [rows, setRows] = useState<AttentionRow[] | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadSatAttention(today).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [today, reloadKey]);

  const list = (rows ?? []).filter((r) => !hide.includes(r.kind));
  if (!list.length) return null;
  const kinds = (Object.keys(TITLES) as AttentionRow["kind"][]).filter((k) => list.some((r) => r.kind === k));

  return (
    <section className="rounded-3xl border border-burgundy/30 bg-burgundy/[0.05] px-5 py-4 sm:px-6" aria-label="Требует внимания">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <h3 className="text-lg text-navy">
          Требует внимания <span className="text-burgundy">· {list.length}</span>
        </h3>
        <span className="text-sm text-muted">{open ? "свернуть" : "показать"}</span>
      </button>
      {open ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {kinds.map((k) => (
            <div key={k}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{TITLES[k]}</p>
              <ul className="mt-1.5 space-y-1.5 text-sm">
                {list
                  .filter((r) => r.kind === k)
                  .slice(0, 8)
                  .map((r, i) => (
                    <li key={`${k}-${r.ref_id ?? r.student_id}-${i}`} className="leading-snug">
                      {k === "risk" ? (
                        <Link href="/admin/results" className="text-navy hover:underline">
                          {r.student_name}
                          <span className="text-muted"> · {r.group_name} · {r.detail}</span>
                        </Link>
                      ) : k === "test_review" ? (
                        <Link href={`/admin/tests/${r.ref_id}`} className="text-navy hover:underline">
                          {r.detail}
                          <span className="text-muted"> · {r.group_name}</span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => r.ref_id && onOpenLesson?.(r.ref_id, r.ref_date)}
                          className={`text-left text-navy ${onOpenLesson ? "hover:underline" : "cursor-default"}`}
                        >
                          {r.group_name} · {r.ref_date ? fmtDay(r.ref_date) : ""}
                          <span className="text-muted">
                            {" "}
                            · {k === "oh_unread" ? `ещё не прочитали: ${r.detail}` : r.detail}
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
