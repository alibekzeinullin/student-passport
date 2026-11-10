"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Field";
import { useAuth } from "@/context/AuthContext";
import { suggestLogin } from "@/lib/accounts";
import { callApi, formatSeen } from "@/lib/api-client";
import {
  AUDIT_LABELS,
  defaultGroupRole,
  GROUP_STAFF_LABELS,
  isHead,
  parseBulk,
  STAFF_ROLE_HINTS,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  staffInviteMessage,
  type GroupOption,
  type GroupStaffRole,
  type StaffAuditRow,
  type StaffRole,
  type StaffRow,
} from "@/lib/staff";

const API = "/api/admin/team";

interface Issued {
  fullName: string;
  login: string;
  password?: string;
  roles: StaffRole[];
  error?: string;
}

interface TeamData {
  staff: StaffRow[];
  groups: GroupOption[];
  audit: StaffAuditRow[];
  me: string;
}

export default function TeamPage() {
  const { refreshUser } = useAuth();
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [mode, setMode] = useState<"none" | "one" | "bulk">("none");
  const [issued, setIssued] = useState<Issued[] | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await callApi<TeamData>(API, "GET");
      setData(next);
      setSetupNeeded(false);
    } catch (err) {
      if ((err as { code?: string }).code === "no_service_key") setSetupNeeded(true);
      else setError((err as Error).message);
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
    () => (data?.staff ?? []).filter((s) => showDisabled || s.active),
    [data, showDisabled],
  );
  const disabledCount = (data?.staff ?? []).filter((s) => !s.active).length;

  const act = async (row: StaffRow, action: "reset_password" | "disable" | "enable") => {
    const question =
      action === "reset_password"
        ? `Сбросить пароль для «${row.fullName}»? Старый пароль перестанет работать.`
        : action === "disable"
          ? `Отключить «${row.fullName}»?\n\nСотрудник больше не сможет войти. Вся история и записи сохранятся — включить можно в любой момент.`
          : `Включить «${row.fullName}» снова?`;
    if (!window.confirm(question)) return;
    setBusyId(row.userId);
    setError("");
    try {
      const res = await callApi<{ login?: string; password?: string }>(API, "PATCH", { userId: row.userId, action });
      if (action === "reset_password" && res.password) {
        setIssued([{ fullName: row.fullName, login: res.login ?? row.login, password: res.password, roles: row.roles }]);
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <RequireAuth role="admin" allow={isHead}>
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Команда</p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Сотрудники и роли</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Руководители, менторы, учителя и кураторы SAT. Временный пароль показывается один раз — сотрудник при первом входе придумывает свой.
            </p>
          </div>
          {!setupNeeded ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={mode === "bulk" ? "primary" : "secondary"} onClick={() => setMode((m) => (m === "bulk" ? "none" : "bulk"))}>
                {mode === "bulk" ? "Отмена" : "Списком"}
              </Button>
              <Button type="button" variant={mode === "one" ? "secondary" : "primary"} onClick={() => setMode((m) => (m === "one" ? "none" : "one"))}>
                {mode === "one" ? "Отмена" : "+ Сотрудник"}
              </Button>
            </div>
          ) : null}
        </div>

        {setupNeeded ? (
          <div className="sp-glass rounded-3xl border px-5 py-5 text-sm text-muted sm:px-6">
            Нужен ключ <span className="font-mono text-gold">SUPABASE_SERVICE_ROLE_KEY</span> в Vercel — как на странице «Аккаунты».
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div>
        ) : null}

        {issued ? <IssuedCard issued={issued} onClose={() => setIssued(null)} /> : null}

        {mode === "one" && data ? (
          <CreateForm
            groups={data.groups}
            onDone={async (results) => {
              setIssued(results);
              if (results.every((r) => !r.error)) setMode("none");
              await load();
            }}
            onError={setError}
          />
        ) : null}

        {mode === "bulk" && data ? (
          <BulkForm
            groups={data.groups}
            onDone={async (results) => {
              setIssued(results);
              setMode("none");
              await load();
            }}
            onError={setError}
          />
        ) : null}

        <div className="sp-glass overflow-x-auto rounded-3xl border">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] text-left text-xs uppercase tracking-[0.12em] text-muted">
                <th className="px-5 py-3 font-normal">Сотрудник</th>
                <th className="px-5 py-3 font-normal">Роли</th>
                <th className="px-5 py-3 font-normal">Группы</th>
                <th className="px-5 py-3 font-normal">Последний вход</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) =>
                editing === r.userId ? (
                  <EditRow
                    key={r.userId}
                    row={r}
                    isMe={r.userId === data?.me}
                    onCancel={() => setEditing(null)}
                    onSaved={async () => {
                      setEditing(null);
                      await load();
                      if (r.userId === data?.me) await refreshUser();
                    }}
                    onError={setError}
                  />
                ) : (
                  <tr key={r.userId} className={`border-b border-white/[0.04] align-top ${r.active ? "" : "opacity-55"}`}>
                    <td className="px-5 py-3 text-navy">
                      {r.fullName}
                      {r.userId === data?.me ? <span className="ml-2 whitespace-nowrap text-xs text-gold">это вы</span> : null}
                      <span className="block font-mono text-xs text-muted">{r.login}</span>
                      {r.city ? <span className="block text-xs text-muted">{r.city}</span> : null}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {r.roles.map((role) => (
                          <RoleChip key={role} role={role} />
                        ))}
                        {!r.active ? <span className="rounded-full border border-burgundy/40 px-2.5 py-0.5 text-xs text-burgundy">отключён</span> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {r.groups.length
                        ? r.groups.map((g) => (
                            <span key={`${g.groupId}-${g.role}`} className="block">
                              <span className="text-navy">{g.groupName}</span> · {GROUP_STAFF_LABELS[g.role]}
                            </span>
                          ))
                        : "—"}
                    </td>
                    <td className={`px-5 py-3 ${r.lastSignInAt ? "text-muted" : "text-gold"}`}>
                      {formatSeen(r.lastSignInAt)}
                      {r.mustChangePassword ? <span className="block text-xs text-muted">временный пароль</span> : null}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <SmallButton onClick={() => setEditing(r.userId)} disabled={busyId === r.userId}>Изменить</SmallButton>
                        {r.userId !== data?.me ? (
                          <>
                            {r.active ? (
                              <SmallButton onClick={() => void act(r, "reset_password")} disabled={busyId === r.userId}>Пароль</SmallButton>
                            ) : null}
                            <SmallButton
                              danger={r.active}
                              onClick={() => void act(r, r.active ? "disable" : "enable")}
                              disabled={busyId === r.userId}
                            >
                              {r.active ? "Отключить" : "Включить"}
                            </SmallButton>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ),
              )}
              {data && visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">Сотрудников пока нет.</td>
                </tr>
              ) : null}
              {!data && !setupNeeded && !error ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">Загрузка…</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {disabledCount > 0 ? (
          <button type="button" onClick={() => setShowDisabled((v) => !v)} className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline">
            {showDisabled ? "Скрыть отключённых" : `Показать отключённых (${disabledCount})`}
          </button>
        ) : null}

        {data?.audit.length ? <AuditLog rows={data.audit} /> : null}
      </div>
    </RequireAuth>
  );
}

function RoleChip({ role }: { role: StaffRole }) {
  const tone =
    role === "head"
      ? "border-gold/50 bg-gold/10 text-gold"
      : role === "mentor"
        ? "border-white/20 text-navy"
        : "border-sky-300/30 bg-sky-300/5 text-sky-200";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs ${tone}`}>{STAFF_ROLE_LABELS[role]}</span>;
}

function SmallButton({
  children,
  onClick,
  disabled,
  danger = false,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-50 ${
        danger ? "border-burgundy/40 text-burgundy hover:bg-burgundy/10" : "border-white/15 text-navy hover:border-gold/60 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function RolePicker({ value, onChange }: { value: StaffRole[]; onChange: (next: StaffRole[]) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {STAFF_ROLES.map((role) => {
        const on = value.includes(role);
        return (
          <label
            key={role}
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 transition ${
              on ? "border-gold/50 bg-gold/[0.07]" : "border-white/10 hover:border-white/25"
            }`}
          >
            <input
              type="checkbox"
              className="mt-1 accent-[#cbb073]"
              checked={on}
              onChange={() => onChange(on ? value.filter((r) => r !== role) : [...value, role])}
            />
            <span>
              <span className="block text-sm text-navy">{STAFF_ROLE_LABELS[role]}</span>
              <span className="block text-xs text-muted">{STAFF_ROLE_HINTS[role]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function CreateForm({
  groups,
  onDone,
  onError,
}: {
  groups: GroupOption[];
  onDone: (results: Issued[]) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [login, setLogin] = useState("");
  const [loginTouched, setLoginTouched] = useState(false);
  const [city, setCity] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>(["sat_teacher"]);
  const [picked, setPicked] = useState<Record<string, GroupStaffRole>>({});
  const [busy, setBusy] = useState(false);
  const satGroups = groups.filter((g) => g.courseId === "sat");
  const needsGroups = roles.some((r) => r.startsWith("sat_"));

  const submit = async () => {
    setBusy(true);
    onError("");
    try {
      const { results } = await callApi<{ results: Issued[] }>(API, "POST", {
        items: [
          {
            fullName,
            login,
            city,
            roles,
            groups: Object.entries(picked).map(([groupId, role]) => ({ groupId, role })),
          },
        ],
      });
      if (results[0]?.error) {
        onError(results[0].error);
        setBusy(false);
        return;
      }
      await onDone(results);
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="sp-rise space-y-5 rounded-3xl border border-gold/25 bg-[#162030] px-5 py-5 sm:px-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="st-name">ФИО</Label>
          <Input
            id="st-name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (!loginTouched) setLogin(suggestLogin(e.target.value));
            }}
            placeholder="Асель Нурланова"
          />
        </div>
        <div>
          <Label htmlFor="st-login">Логин</Label>
          <Input
            id="st-login"
            value={login}
            onChange={(e) => {
              setLoginTouched(true);
              setLogin(e.target.value);
            }}
            placeholder="asel.nurlanova или email"
          />
        </div>
        <div>
          <Label htmlFor="st-city">Город</Label>
          <Input id="st-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Астана" />
        </div>
      </div>

      <div>
        <Label>Роли</Label>
        <RolePicker value={roles} onChange={setRoles} />
      </div>

      {needsGroups ? (
        <div>
          <Label>Группы SAT (можно позже)</Label>
          {satGroups.length === 0 ? (
            <p className="text-sm text-muted">Групп пока нет — их создают на странице «Группы».</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {satGroups.map((g) => {
                const role = picked[g.id];
                return (
                  <div key={g.id} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${role ? "border-gold/50" : "border-white/10"}`}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-navy">
                      <input
                        type="checkbox"
                        className="accent-[#cbb073]"
                        checked={Boolean(role)}
                        onChange={() =>
                          setPicked((prev) => {
                            const next = { ...prev };
                            if (next[g.id]) delete next[g.id];
                            else next[g.id] = defaultGroupRole(roles);
                            return next;
                          })
                        }
                      />
                      <span className="truncate">
                        {g.name}
                        {g.streamName ? <span className="text-muted"> · {g.streamName}</span> : null}
                      </span>
                    </label>
                    {role ? (
                      <select
                        value={role}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [g.id]: e.target.value as GroupStaffRole }))}
                        className="rounded-lg border border-white/10 bg-field px-2 py-1 text-xs text-navy"
                      >
                        <option value="teacher">учитель</option>
                        <option value="curator">куратор</option>
                      </select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <Button type="button" disabled={busy || !fullName.trim() || !login.trim() || roles.length === 0} onClick={() => void submit()}>
        {busy ? "Создаю…" : "Создать и получить пароль"}
      </Button>
    </section>
  );
}

function BulkForm({
  groups,
  onDone,
  onError,
}: {
  groups: GroupOption[];
  onDone: (results: Issued[]) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const lines = useMemo(() => parseBulk(text, groups), [text, groups]);
  const good = lines.filter((l) => !l.problem);

  const submit = async () => {
    setBusy(true);
    onError("");
    try {
      const { results } = await callApi<{ results: Issued[] }>(API, "POST", {
        items: good.map((l) => ({
          fullName: l.fullName,
          roles: [l.role],
          groups: l.groupId ? [{ groupId: l.groupId, role: l.role === "sat_curator" ? "curator" : "teacher" }] : [],
        })),
      });
      await onDone(results);
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="sp-rise space-y-4 rounded-3xl border border-gold/25 bg-[#162030] px-5 py-5 sm:px-6">
      <div>
        <Label htmlFor="bulk">Каждый сотрудник — с новой строки: ФИО; роль; группа</Label>
        <Textarea
          id="bulk"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-36 font-mono"
          placeholder={"Асель Нурланова; учитель; SAT-3A\nДана Ерланова; куратор; SAT-3A\nМарат Сейтов; старший учитель"}
        />
        <p className="mt-1 text-xs text-muted">
          Роли: руководитель, ментор, куратор, учитель, старший учитель. Группа — необязательно. Можно вставить столбцы прямо из Google Таблицы. Логины придумаются сами.
        </p>
      </div>

      {lines.length ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] text-left text-xs uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-2 font-normal">ФИО</th>
                <th className="px-4 py-2 font-normal">Роль</th>
                <th className="px-4 py-2 font-normal">Группа</th>
                <th className="px-4 py-2 font-normal">Логин</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.line} className="border-b border-white/[0.04]">
                  <td className="px-4 py-2 text-navy">{l.fullName || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2 text-navy">{l.role ? STAFF_ROLE_LABELS[l.role] : "—"}</td>
                  <td className="px-4 py-2 text-muted">{l.groupName || "—"}</td>
                  <td className="px-4 py-2">
                    {l.problem ? (
                      <span className="text-burgundy">Строка {l.line}: {l.problem}</span>
                    ) : (
                      <span className="font-mono text-xs text-muted">{suggestLogin(l.fullName)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Button type="button" disabled={busy || good.length === 0} onClick={() => void submit()}>
        {busy ? "Создаю…" : `Создать ${good.length || ""} и получить пароли`}
      </Button>
      {lines.length > good.length ? (
        <p className="text-xs text-muted">Строки с ошибками будут пропущены — исправьте их или создайте позже.</p>
      ) : null}
    </section>
  );
}

function EditRow({
  row,
  isMe,
  onCancel,
  onSaved,
  onError,
}: {
  row: StaffRow;
  isMe: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [fullName, setFullName] = useState(row.fullName);
  const [city, setCity] = useState(row.city);
  const [roles, setRoles] = useState<StaffRole[]>(row.roles);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    onError("");
    try {
      if (fullName.trim() !== row.fullName || city.trim() !== row.city) {
        await callApi(API, "PATCH", { userId: row.userId, action: "update", fullName, city });
      }
      if ([...roles].sort().join() !== [...row.roles].sort().join()) {
        await callApi(API, "PATCH", { userId: row.userId, action: "roles", roles });
      }
      await onSaved();
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-white/[0.04] bg-white/[0.02]">
      <td colSpan={5} className="space-y-4 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor={`ed-n-${row.userId}`}>ФИО</Label>
            <Input id={`ed-n-${row.userId}`} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`ed-c-${row.userId}`}>Город</Label>
            <Input id={`ed-c-${row.userId}`} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label>Логин</Label>
            <p className="py-2 font-mono text-sm text-muted">{row.login}</p>
          </div>
        </div>
        <div>
          <Label>Роли</Label>
          <RolePicker value={roles} onChange={setRoles} />
          {isMe && !roles.includes("head") ? (
            <p className="mt-2 text-xs text-burgundy">С себя роль руководителя снять нельзя — это может сделать другой руководитель.</p>
          ) : null}
        </div>
        <p className="text-xs text-muted">Группы сотрудника меняются на странице «Группы».</p>
        <div className="flex gap-2">
          <Button type="button" disabled={busy || roles.length === 0 || !fullName.trim() || (isMe && !roles.includes("head"))} onClick={() => void save()}>
            {busy ? "Сохраняю…" : "Сохранить"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </td>
    </tr>
  );
}

function IssuedCard({ issued, onClose }: { issued: Issued[]; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const ok = issued.filter((i) => i.password);
  const failed = issued.filter((i) => i.error);
  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => setCopied(key));
  };
  const table = ok.map((i) => `${i.fullName}\t${i.login}\t${i.password}`).join("\n");

  return (
    <section className="sp-rise rounded-3xl border border-gold/40 bg-gradient-to-br from-gold/[0.12] to-gold/[0.03] px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-gold">
          Временные пароли · показываются один раз{ok.length > 1 ? ` · ${ok.length} сотр.` : ""}
        </p>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-navy">
          Закрыть
        </button>
      </div>

      {ok.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {ok.map((i) => {
                const message = staffInviteMessage({ name: i.fullName, login: i.login, password: i.password ?? "", url, roles: i.roles });
                return (
                  <tr key={i.login} className="border-b border-white/[0.06]">
                    <td className="py-2 pr-4 text-navy">{i.fullName}</td>
                    <td className="py-2 pr-4 font-mono text-navy">{i.login}</td>
                    <td className="py-2 pr-4 font-mono text-gold">{i.password}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => copy(i.login, message)}
                        className="rounded-full bg-gold px-3.5 py-1.5 text-xs font-semibold text-gold-ink transition hover:bg-[#d9c18a]"
                      >
                        {copied === i.login ? "Скопировано ✓" : "Для WhatsApp"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {ok.length > 1 ? (
        <button
          type="button"
          onClick={() => copy("__all", table)}
          className="mt-3 rounded-full border border-gold/50 px-4 py-2 text-sm text-gold transition hover:bg-gold/10"
        >
          {copied === "__all" ? "Таблица скопирована ✓" : "Скопировать всё таблицей (для Google Таблиц)"}
        </button>
      ) : null}

      {failed.length ? (
        <div className="mt-4 rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">
          Не создано:
          {failed.map((f) => (
            <span key={`${f.fullName}-${f.login}`} className="block">
              {f.fullName || "без имени"} — {f.error}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AuditLog({ rows }: { rows: StaffAuditRow[] }) {
  return (
    <details className="sp-glass rounded-3xl border px-5 py-4 sm:px-6">
      <summary className="cursor-pointer text-sm text-navy">Журнал изменений ({rows.length})</summary>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-2 text-muted">
            <span className="tabular-nums">
              {new Date(r.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-navy">{r.actorName}</span>
            <span>{AUDIT_LABELS[r.action] ?? r.action}:</span>
            <span className="text-navy">{r.targetName}</span>
            {r.action === "roles" && Array.isArray(r.details.after) ? (
              <span>
                → {(r.details.after as StaffRole[]).map((x) => STAFF_ROLE_LABELS[x] ?? x).join(", ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
