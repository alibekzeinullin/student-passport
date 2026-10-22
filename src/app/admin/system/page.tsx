"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { downloadBackup, runChecks, type CheckResult } from "@/lib/system";

export default function SystemPage() {
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [backupState, setBackupState] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void runChecks().then((r) => {
      if (!cancelled) setChecks(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const missing = checks?.filter((c) => !c.ok) ?? [];

  const backup = async () => {
    setBusy(true);
    try {
      const { tables, rows } = await downloadBackup((t) => setBackupState(`Собираю: ${t}…`));
      setBackupState(`Готово: ${tables} таблиц, ${rows} записей. Файл скачан.`);
    } catch (err) {
      console.error(err);
      setBackupState("Не удалось собрать копию. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Система</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">База и резервные копии</h2>
        </div>

        <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-medium text-navy">Проверка базы</h3>
            {checks ? (
              <span className={`text-sm ${missing.length ? "text-gold" : "text-emerald-300"}`}>
                {missing.length ? `не хватает: ${missing.length}` : "всё на месте ✓"}
              </span>
            ) : (
              <span className="text-sm text-muted">проверяю…</span>
            )}
          </div>
          {missing.length > 0 ? (
            <p className="mt-3 rounded-2xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-navy">
              Откройте Supabase → SQL Editor → New query, вставьте целиком файл <span className="font-mono text-gold">supabase/setup-all.sql</span> из GitHub и нажмите Run. Он безопасно добавит всё недостающее — существующие данные не трогает. Затем обновите эту страницу.
            </p>
          ) : null}
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {(checks ?? []).map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                <span className={c.ok ? "text-emerald-300" : "text-burgundy"} aria-hidden>
                  {c.ok ? "✓" : "✗"}
                </span>
                <span className={c.ok ? "text-navy" : "text-burgundy"}>{c.label}</span>
                {!c.ok ? <span className="text-xs text-muted">({c.file})</span> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
          <h3 className="text-lg font-medium text-navy">Резервная копия</h3>
          <p className="mt-1 text-sm text-muted">
            Скачивает всё одним архивом: каждая таблица отдельным CSV-файлом (открывается в Excel) и полная копия backup.json. Советую раз в месяц и перед большими изменениями.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void backup()} disabled={busy}>
              {busy ? "Собираю…" : "Скачать всё (.zip)"}
            </Button>
            {backupState ? <span className="text-sm text-muted">{backupState}</span> : null}
          </div>
          <div className="mt-5 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-muted">
            <p className="text-navy">Автоматические копии в Supabase</p>
            <p className="mt-1">
              Supabase → ваш проект → Database → Backups. На бесплатном тарифе автоматических копий для скачивания может не быть — тогда ручная кнопка выше и есть ваша страховка. Файл храните в надёжном месте: там личные данные учеников.
            </p>
          </div>
        </section>
      </div>
    </RequireAuth>
  );
}
