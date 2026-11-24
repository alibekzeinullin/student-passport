"use client";

import { fmtDay } from "@/lib/lessons";
import { lastScores, type Digest } from "@/lib/student-digest";

function pct(a: number, b: number): number {
  return b > 0 ? Math.round((100 * a) / b) : 0;
}

/** Сводка по ученику для обратной связи: посещаемость и ДЗ, моки и цель, тесты, слабые темы, office hours. */
export function StudentDigestPanel({ digest, showOhNotes = true }: { digest: Digest | null; showOhNotes?: boolean }) {
  if (!digest) return <p className="text-sm text-muted">Собираю данные об ученике…</p>;
  const d = digest;
  const L = d.lessons;
  const hwTotal = L.hwDone + L.hwPartial + L.hwNone;
  const { last, prev } = lastScores(d);
  const delta = last && prev !== null ? last.total - prev : null;
  return (
    <div className="rounded-2xl border border-navy/10 bg-white/60 px-4 py-3 text-sm">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">
        Сводка {d.sinceFeedback ? `с прошлой обратной связи (${fmtDay(d.since)})` : "за последний месяц"}
      </p>
      <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Посещаемость</dt>
          <dd className="text-navy">
            {L.total ? (
              <>
                {L.present + L.late} из {L.total}
                {L.absent ? <span className="text-burgundy"> · пропусков {L.absent}</span> : null}
                {L.late ? <span className="text-gold"> · опозданий {L.late}</span> : null}
              </>
            ) : (
              <span className="text-muted">отметок нет</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Домашка</dt>
          <dd className="text-navy">
            {hwTotal ? (
              <>
                полностью {L.hwDone} из {hwTotal}
                {L.hwPartial ? ` · частично ${L.hwPartial}` : ""}
                {L.hwNone ? <span className="text-burgundy"> · не сделано {L.hwNone}</span> : null}
              </>
            ) : (
              <span className="text-muted">не проверялась</span>
            )}
            {L.activeHigh || L.activeLow ? (
              <span className="block text-xs text-muted">
                активность: высокая {L.activeHigh}, низкая {L.activeLow}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Последний результат</dt>
          <dd className="text-navy">
            {last ? (
              <>
                {last.total}{" "}
                <span className="text-xs text-muted">
                  (V {last.verbal}, M {last.math}) · {last.label}, {fmtDay(last.date)}
                </span>
                {delta ? <span className={delta > 0 ? "text-emerald-600" : "text-burgundy"}> {delta > 0 ? "+" : ""}{delta}</span> : null}
              </>
            ) : (
              <span className="text-muted">моков ещё не было</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Цель</dt>
          <dd className="text-navy">
            {d.target ?? <span className="text-burgundy">не задана</span>}
            {d.target && last ? <span className="text-xs text-muted"> · {last.total >= d.target ? "достигнута" : `осталось ${d.target - last.total}`}</span> : null}
            <span className="block text-xs text-muted">SAT: {d.satDate ? fmtDay(d.satDate) : "дата не указана"}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Тесты и практисы за период</dt>
          <dd className="text-navy">
            {d.tests.length || d.practices.length ? (
              <ul className="space-y-0.5">
                {d.tests.map((t, i) => (
                  <li key={`t${i}`}>
                    {t.title}: {t.score}/{t.max} ({pct(t.score, t.max)}%)
                    {t.wrongTopics.length ? <span className="block text-xs text-muted">ошибки: {t.wrongTopics.slice(0, 4).join(", ")}</span> : null}
                  </li>
                ))}
                {d.practices.slice(0, 4).map((p) => (
                  <li key={p.practiceId}>
                    Практис «{p.name}»: {p.pct}%
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted">нет</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Слабые темы сейчас</dt>
          <dd className="text-navy">{d.weak.length ? d.weak.map((w) => `${w.name} ${w.pct}%`).join(", ") : <span className="text-muted">нет ниже 80%</span>}</dd>
        </div>
      </dl>
      {d.oh.length ? (
        <div className="mt-2 border-t border-navy/10 pt-2">
          <p className="text-xs text-muted">
            Office hours за период: пришёл {d.oh.filter((o) => o.attended).length} из {d.oh.length}
            {showOhNotes ? " · заметки видят только сотрудники" : ""}
          </p>
          {showOhNotes ? (
            <ul className="mt-1 space-y-0.5 text-xs text-navy">
              {d.oh
                .filter((o) => o.comment)
                .slice(-3)
                .map((o, i) => (
                  <li key={i}>
                    <span className="text-muted">{fmtDay(o.date)}:</span> {o.comment}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
