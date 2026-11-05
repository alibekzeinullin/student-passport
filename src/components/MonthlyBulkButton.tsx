"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStudents } from "@/context/StudentsContext";

function monthOptions(): { value: string; label: string }[] {
  const now = new Date();
  return [0, -1, -2].map((d) => {
    const dt = new Date(now.getFullYear(), now.getMonth() + d, 1);
    const value = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const label = dt.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
    return { value, label: d === 0 ? `${label} (идёт)` : label };
  });
}

/** Monthly Review собирается сам 1-го числа; здесь — собрать вручную у всех сразу. */
export function MonthlyBulkButton() {
  const { refreshStudents } = useStudents();
  const options = monthOptions();
  const [month, setMonth] = useState(options[1].value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { data } = await createClient().auth.getSession();
      const res = await fetch("/api/monthly-drafts", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ month }),
      });
      const json = (await res.json()) as { created?: number; updated?: number; message?: string };
      if (!res.ok) throw new Error(json.message || "Ошибка");
      setMsg(`Готово: новых обзоров ${json.created ?? 0}, дополнено ${json.updated ?? 0}`);
      await refreshStudents();
    } catch (err) {
      console.error(err);
      setMsg(err instanceof Error ? err.message : "Не удалось собрать");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm sm:flex-row sm:items-center">
      <span className="min-w-0 flex-1 text-muted">
        <span className="text-navy">Monthly Review</span> собирается сам 1-го числа за прошлый месяц.
        {msg ? <span className="ml-2 text-gold">{msg}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Месяц"
          className="rounded-full border border-white/10 bg-field px-3 py-1.5 text-xs text-navy"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="rounded-full border border-gold/50 px-3 py-1.5 text-xs text-gold transition hover:bg-gold/10 disabled:opacity-50"
        >
          {busy ? "Собираю…" : "Собрать сейчас у всех"}
        </button>
      </span>
    </div>
  );
}
