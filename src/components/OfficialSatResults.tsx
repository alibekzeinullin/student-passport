"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { fmtDay, isoDate } from "@/lib/lessons";
import { addOfficial, deleteOfficial, loadOfficial, type OfficialResult } from "@/lib/sat-student";

/** Официальный SAT ученика — вносят и удаляют только учителя SAT (ученик видит у себя в графике). */
export function OfficialSatResults({ studentId }: { studentId: string }) {
  const [list, setList] = useState<OfficialResult[]>([]);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(isoDate(new Date()));
  const [verbal, setVerbal] = useState("");
  const [math, setMath] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => setList(await loadOfficial(studentId).catch(() => [] as OfficialResult[])), [studentId]);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  return (
    <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/[0.05] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Официальный SAT · ученик видит в своём графике</p>
        <button type="button" onClick={() => setAdding((v) => !v)} className="text-sm text-gold hover:underline">
          {adding ? "Отмена" : "+ Внести результат"}
        </button>
      </div>
      {list.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {list.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 text-navy">
              {fmtDay(o.exam_date)}: <span className="font-semibold">{o.total}</span>
              <span className="text-muted">
                (Verbal {o.verbal}, Math {o.math})
              </span>
              <button
                type="button"
                className="text-xs text-burgundy hover:underline"
                onClick={async () => {
                  if (!window.confirm("Удалить этот результат официального SAT?")) return;
                  await deleteOfficial(o.id).catch((err: Error) => setError(err.message));
                  await reload();
                }}
              >
                удалить
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Результатов официального SAT пока нет.</p>
      )}
      {adding ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="of-date">Дата экзамена</Label>
            <Input id="of-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="of-verbal">Verbal</Label>
            <Input id="of-verbal" inputMode="numeric" value={verbal} onChange={(e) => setVerbal(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="200–800" />
          </div>
          <div>
            <Label htmlFor="of-math">Math</Label>
            <Input id="of-math" inputMode="numeric" value={math} onChange={(e) => setMath(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="200–800" />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={busy || !date || !verbal || !math}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await addOfficial(studentId, { date, verbal: Number(verbal), math: Number(math) });
                  setAdding(false);
                  setVerbal("");
                  setMath("");
                  await reload();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Сохраняю…" : "Сохранить"}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-burgundy">{error}</p> : null}
    </div>
  );
}
