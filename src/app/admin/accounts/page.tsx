"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/client";
import { useStudents } from "@/context/StudentsContext";
import { inviteMessage, suggestLogin, type AccountRow } from "@/lib/accounts";

async function api<T>(method: string, body?: unknown): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/accounts", {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    const err = new Error(json.message ?? `Ошибка ${res.status}`) as Error & { code?: string };
    err.code = json.error;
    throw err;
  }
  return json;
}

function formatSeen(iso: string | null): string {
  if (!iso) return "ни разу не входил";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн. назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

interface Issued {
  name: string;
  login: string;
  password: string;
}

export default function AccountsPage() {
  const { refreshStudents } = useStudents();
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPaused, setShowPaused] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ accounts: AccountRow[] }>("GET");
      setRows(data.accounts);
      setSetupNeeded(false);
      setError("");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "no_service_key") setSetupNeeded(true);
      else setError((err as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const visible = useMemo(
    () => rows.filter((r) => showPaused || r.status !== "paused"),
    [rows, showPaused],
  );
  const neverLogged = visible.filter((r) => r.userId && !r.lastSignInAt).length;
  const tempPasswords = visible.filter((r) => r.mustChangePassword).length;

  const reset = async (row: AccountRow) => {
    if (!row.userId) return;
    if (!window.confirm(`Сбросить пароль для «${row.name}»? Старый пароль перестанет работать.`)) return;
    setBusyId(row.userId);
    try {
      const data = await api<{ login: string; password: string }>("PATCH", { userId: row.userId });
      setIssued({ name: row.name, login: data.login, password: data.password });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Аккаунты</p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Входы учеников</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Пароли нигде не хранятся: при создании или сбросе сайт один раз показывает временный пароль, а ученик при первом входе придумывает свой.
            </p>
          </div>
          {!setupNeeded ? (
            <Button type="button" onClick={() => setCreating((v) => !v)}>
              {creating ? "Отмена" : "+ Создать аккаунт"}
            </Button>
          ) : null}
        </div>

        {setupNeeded ? <SetupHint /> : null}

        {error ? (
          <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div>
        ) : null}

        {issued ? <IssuedCard issued={issued} onClose={() => setIssued(null)} /> : null}

        {creating ? (
          <CreateForm
            onCreated={async (i) => {
              setCreating(false);
              setIssued(i);
              await load();
              await refreshStudents();
            }}
            onError={setError}
          />
        ) : null}

        {!setupNeeded ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Аккаунтов" value={loaded ? String(visible.filter((r) => r.userId).length) : "…"} />
              <Stat label="Ни разу не входили" value={loaded ? String(neverLogged) : "…"} accent={neverLogged > 0} />
              <Stat label="С временным паролем" value={loaded ? String(tempPasswords) : "…"} />
            </div>

            <div className="sp-glass overflow-x-auto rounded-3xl border">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-white/[0.07] text-left text-xs uppercase tracking-[0.12em] text-muted">
                    <th className="px-5 py-3 font-normal">Ученик</th>
                    <th className="px-5 py-3 font-normal">Логин</th>
                    <th className="px-5 py-3 font-normal">Последний вход</th>
                    <th className="px-5 py-3 font-normal">Пароль</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.studentId ?? r.userId} className={`border-b border-white/[0.04] ${r.status === "paused" ? "opacity-60" : ""}`}>
                      <td className="px-5 py-3 text-navy">
                        {r.name}
                        <span className="block text-xs text-muted">{r.className}</span>
                      </td>
                      <td className="px-5 py-3 font-mono text-[13px] text-navy">{r.login || "—"}</td>
                      <td className={`px-5 py-3 ${r.lastSignInAt ? "text-muted" : "text-gold"}`}>
                        {r.userId ? formatSeen(r.lastSignInAt) : "нет аккаунта"}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {r.userId ? (r.mustChangePassword ? "временный" : "свой") : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {r.userId ? (
                          <button
                            type="button"
                            disabled={busyId === r.userId}
                            onClick={() => void reset(r)}
                            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-navy transition hover:border-gold/60 hover:bg-white/5 disabled:opacity-50"
                          >
                            {busyId === r.userId ? "…" : "Сбросить пароль"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {loaded && visible.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-muted">Аккаунтов пока нет.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {rows.some((r) => r.status === "paused") ? (
              <button type="button" onClick={() => setShowPaused((v) => !v)} className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline">
                {showPaused ? "Скрыть учеников на паузе" : "Показать учеников на паузе"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </RequireAuth>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="sp-glass rounded-3xl border px-5 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-4xl font-light ${accent ? "text-gold" : "text-navy"}`}>{value}</p>
    </div>
  );
}

function CreateForm({
  onCreated,
  onError,
}: {
  onCreated: (i: Issued) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [login, setLogin] = useState("");
  const [loginTouched, setLoginTouched] = useState(false);
  const [className, setClassName] = useState("");
  const [school, setSchool] = useState("");
  const [educationSystem, setEducationSystem] = useState("Национальная");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    onError("");
    try {
      const data = await api<{ login: string; password: string }>("POST", { fullName, login, className, school, educationSystem });
      await onCreated({ name: fullName, login: data.login, password: data.password });
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="sp-rise grid gap-4 rounded-3xl border border-gold/25 bg-[#162030] px-5 py-5 sm:grid-cols-2 sm:px-6">
      <div>
        <Label htmlFor="acc-name">Имя и фамилия</Label>
        <Input
          id="acc-name"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            if (!loginTouched) setLogin(suggestLogin(e.target.value));
          }}
          placeholder="Айлин Дуйсенова"
        />
      </div>
      <div>
        <Label htmlFor="acc-login">Логин для входа</Label>
        <Input
          id="acc-login"
          value={login}
          onChange={(e) => {
            setLoginTouched(true);
            setLogin(e.target.value);
          }}
          placeholder="aylin.duysenova или email"
        />
        <p className="mt-1 text-xs text-muted">Можно и настоящий email ученика.</p>
      </div>
      <div>
        <Label htmlFor="acc-class">Класс</Label>
        <Input id="acc-class" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="9A" />
      </div>
      <div>
        <Label htmlFor="acc-school">Школа</Label>
        <Input id="acc-school" value={school} onChange={(e) => setSchool(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="acc-sys">Система обучения</Label>
        <Select id="acc-sys" value={educationSystem} onChange={(e) => setEducationSystem(e.target.value)}>
          {["Национальная", "IB", "AP", "A-Level"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </div>
      <div className="flex items-end">
        <Button type="button" disabled={busy || !fullName.trim() || !login.trim()} onClick={() => void submit()}>
          {busy ? "Создаю…" : "Создать и получить пароль"}
        </Button>
      </div>
    </section>
  );
}

function IssuedCard({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = inviteMessage({
    name: issued.name.split(/\s+/).slice(-1)[0] ?? issued.name,
    login: issued.login,
    password: issued.password,
    url: typeof window !== "undefined" ? window.location.origin : "",
  });
  return (
    <section className="sp-rise rounded-3xl border border-gold/40 bg-gradient-to-br from-gold/[0.12] to-gold/[0.03] px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-gold">Временный пароль · показывается один раз</p>
          <p className="mt-2 text-lg text-navy">{issued.name}</p>
          <p className="mt-1 font-mono text-navy">
            {issued.login} · <span className="text-gold">{issued.password}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-navy" aria-label="Закрыть">
          Закрыть
        </button>
      </div>
      <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-black/20 px-4 py-3 font-sans text-sm text-navy">{message}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(message).then(() => setCopied(true));
        }}
        className="mt-3 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition hover:bg-[#d9c18a]"
      >
        {copied ? "Скопировано ✓" : "Скопировать сообщение для WhatsApp"}
      </button>
    </section>
  );
}

function SetupHint() {
  return (
    <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
      <h3 className="text-lg font-medium text-navy">Нужен один ключ — 3 минуты</h3>
      <p className="mt-1 text-sm text-muted">
        Создавать аккаунты и сбрасывать пароли может только сервер с секретным ключом Supabase. Он хранится в Vercel и в браузер не попадает.
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-navy">
        <li>Supabase → ваш проект → Project Settings → API → скопируйте ключ <span className="font-mono text-gold">service_role</span> (secret).</li>
        <li>Vercel → проект student-passport → Settings → Environment Variables → Add: имя <span className="font-mono text-gold">SUPABASE_SERVICE_ROLE_KEY</span>, значение — ключ.</li>
        <li>Deployments → последний → Redeploy. Обновите эту страницу.</li>
      </ol>
      <p className="mt-3 text-xs text-muted">Никому не показывайте этот ключ и не вставляйте его в код — он даёт полный доступ к базе.</p>
    </section>
  );
}
