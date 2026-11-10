"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import { useAuth } from "@/context/AuthContext";
import { todayLocal } from "@/lib/api-client";
import {
  activeLinks,
  addGroupStaff,
  createGroup,
  createStream,
  endEnrollment,
  enrollStudent,
  friendly,
  loadGroupsData,
  parseScore,
  replaceGroupStaff,
  searchStudents,
  transferEnrollment,
  updateEnrollment,
  updateGroup,
  updateStream,
  upcomingLinks,
  type GroupRow,
  type GroupsData,
  type RosterRow,
  type StaffOption,
  type StudentHit,
} from "@/lib/groups";
import { canManageSat, canOpenGroups, GROUP_STAFF_LABELS, type GroupStaffRole } from "@/lib/staff";
import {
  addSlot,
  endSlot,
  EXAMPLE_SLOTS,
  hhmm,
  loadRosterStats,
  loadSlots,
  WEEKDAYS,
  WEEKDAYS_FULL,
  type RosterStat,
  type SlotRow,
} from "@/lib/lessons";

const NO_STREAM = "__none";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayLocal()}T00:00:00`).getTime()) / 86400000);
}

export default function GroupsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<GroupsData | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [stats, setStats] = useState<Map<string, RosterStat>>(() => new Map());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [streamFilter, setStreamFilter] = useState<string>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<"none" | "stream" | "group">("none");
  const [openId, setOpenId] = useState<string | null>(null);
  const manager = canManageSat(user);
  const today = todayLocal();

  const load = useCallback(async () => {
    try {
      const [next, nextSlots, nextStats] = await Promise.all([loadGroupsData(), loadSlots(), loadRosterStats()]);
      setData(next);
      setSlots(nextSlots);
      setStats(nextStats);
      setError("");
    } catch (err) {
      setError((err as Error).message);
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

  /** Выполнить действие, показать ошибку понятным текстом и перезагрузить данные. */
  const run = useCallback(
    async (fn: () => Promise<void>, done?: string) => {
      setError("");
      setNotice("");
      try {
        await fn();
        if (done) setNotice(done);
        await load();
        return true;
      } catch (err) {
        setError(friendly((err as Error).message));
        return false;
      }
    },
    [load],
  );

  const myGroupIds = useMemo(() => {
    if (!data || !user) return new Set<string>();
    return new Set(data.staffLinks.filter((l) => l.user_id === user.id && (!l.ends_on || l.ends_on >= today)).map((l) => l.group_id));
  }, [data, user, today]);

  const groups = useMemo(() => {
    if (!data) return [];
    return data.groups.filter(
      (g) =>
        (showArchived || !g.archived) &&
        (streamFilter === "all" || (streamFilter === NO_STREAM ? !g.stream_id : g.stream_id === streamFilter)) &&
        (!mineOnly || myGroupIds.has(g.id)),
    );
  }, [data, showArchived, streamFilter, mineOnly, myGroupIds]);

  const rosterByGroup = useMemo(() => {
    const map = new Map<string, RosterRow[]>();
    (data?.roster ?? []).forEach((r) => {
      if (!r.group_id) return;
      map.set(r.group_id, [...(map.get(r.group_id) ?? []), r]);
    });
    return map;
  }, [data]);

  const streamName = (id: string | null) => data?.streams.find((s) => s.id === id)?.name ?? "";
  const staffName = (id: string) => data?.staff.find((s) => s.user_id === id)?.full_name ?? "—";
  const totalStudents = data?.roster.length ?? 0;

  return (
    <RequireAuth role={["admin", "staff"]} allow={canOpenGroups}>
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">SAT</p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Потоки и группы</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              {manager
                ? "Создавайте потоки и группы, назначайте учителей и кураторов, добавляйте учеников. Перевод и замена — с даты, история сохраняется."
                : "Все ученики SAT. Свои группы вы можете править: цели, даты SAT, состав."}
            </p>
          </div>
          {manager ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm((f) => (f === "stream" ? "none" : "stream"))}>
                {form === "stream" ? "Отмена" : "+ Поток"}
              </Button>
              <Button type="button" onClick={() => setForm((f) => (f === "group" ? "none" : "group"))}>
                {form === "group" ? "Отмена" : "+ Группа"}
              </Button>
            </div>
          ) : null}
        </div>

        {error ? <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">{notice}</div> : null}

        {form === "stream" ? (
          <StreamForm
            onSubmit={async (name, startsOn, weeks) => {
              if (await run(() => createStream(name, startsOn, weeks), `Поток «${name}» создан`)) setForm("none");
            }}
          />
        ) : null}
        {form === "group" && data ? (
          <GroupForm
            streams={data.streams}
            defaultStream={streamFilter !== "all" && streamFilter !== NO_STREAM ? streamFilter : (data.streams.at(-1)?.id ?? "")}
            onSubmit={async (input) => {
              if (await run(() => createGroup(input), `Группа «${input.name}» создана`)) setForm("none");
            }}
          />
        ) : null}

        {data ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Групп" value={String(data.groups.filter((g) => !g.archived).length)} />
              <MiniStat label="Учеников" value={String(totalStudents)} />
              <MiniStat label="Потоков" value={String(data.streams.length)} />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
              <Select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)} className="w-auto" aria-label="Поток">
                <option value="all">Все потоки</option>
                {data.streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={NO_STREAM}>Без потока</option>
              </Select>
              {myGroupIds.size ? (
                <label className="flex items-center gap-2 text-muted">
                  <input type="checkbox" className="accent-[#cbb073]" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                  Мои группы
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-muted">
                <input type="checkbox" className="accent-[#cbb073]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Архив
              </label>
            </div>
          </div>
        ) : !error ? (
          <p className="text-muted">Загрузка…</p>
        ) : null}

        {data && manager && streamFilter !== "all" && streamFilter !== NO_STREAM ? (
          (() => {
            const st = data.streams.find((x) => x.id === streamFilter);
            return st ? <StreamEditor key={st.id} stream={st} run={run} /> : null;
          })()
        ) : null}

        {data && groups.length === 0 ? (
          <div className="sp-glass rounded-3xl border px-5 py-8 text-center text-sm text-muted">
            {data.groups.length === 0
              ? manager
                ? "Групп пока нет. Создайте поток (например, «Поток 3»), затем группы в нём."
                : "Групп пока нет — их создаёт руководитель или старший учитель."
              : "Под фильтр ничего не попало."}
          </div>
        ) : null}

        <div className="space-y-4">
          {data
            ? groups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  data={data}
                  streamName={streamName(g.stream_id)}
                  staffName={staffName}
                  roster={rosterByGroup.get(g.id) ?? []}
                  slots={slots.filter((x) => x.group_id === g.id && (!x.valid_to || x.valid_to >= today))}
                  stats={stats}
                  canEdit={manager || myGroupIds.has(g.id)}
                  manager={manager}
                  mine={myGroupIds.has(g.id)}
                  open={openId === g.id}
                  onToggle={() => setOpenId((id) => (id === g.id ? null : g.id))}
                  run={run}
                  today={today}
                />
              ))
            : null}
        </div>
      </div>
    </RequireAuth>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sp-glass rounded-2xl border px-4 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-2xl font-light text-navy">{value}</p>
    </div>
  );
}

function StreamForm({ onSubmit }: { onSubmit: (name: string, startsOn: string | null, weeks: number | null) => Promise<void> }) {
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [weeks, setWeeks] = useState("12");
  const [busy, setBusy] = useState(false);
  return (
    <section className="sp-rise grid gap-4 rounded-3xl border border-gold/25 bg-[#162030] px-5 py-5 sm:grid-cols-4 sm:px-6">
      <div>
        <Label htmlFor="sf-name">Название потока</Label>
        <Input id="sf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Поток 3" />
      </div>
      <div>
        <Label htmlFor="sf-start">Начало (необязательно)</Label>
        <Input id="sf-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="sf-weeks">Недель в курсе</Label>
        <Input id="sf-weeks" value={weeks} inputMode="numeric" onChange={(e) => setWeeks(e.target.value.replace(/\D/g, "").slice(0, 3))} />
      </div>
      <div className="flex items-end">
        <Button
          type="button"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            await onSubmit(name, startsOn || null, Number(weeks) || null);
            setBusy(false);
          }}
        >
          {busy ? "Создаю…" : "Создать поток"}
        </Button>
      </div>
    </section>
  );
}

function GroupForm({
  streams,
  defaultStream,
  onSubmit,
}: {
  streams: GroupsData["streams"];
  defaultStream: string;
  onSubmit: (input: { name: string; streamId: string | null; city: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [streamId, setStreamId] = useState(defaultStream);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="sp-rise grid gap-4 rounded-3xl border border-gold/25 bg-[#162030] px-5 py-5 sm:grid-cols-4 sm:px-6">
      <div>
        <Label htmlFor="gf-name">Название группы</Label>
        <Input id="gf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="SAT-3A" />
      </div>
      <div>
        <Label htmlFor="gf-stream">Поток</Label>
        <Select id="gf-stream" value={streamId} onChange={(e) => setStreamId(e.target.value)}>
          <option value="">Без потока</option>
          {streams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="gf-city">Город / филиал</Label>
        <Input id="gf-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Астана" />
      </div>
      <div className="flex items-end">
        <Button
          type="button"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            await onSubmit({ name, streamId: streamId || null, city });
            setBusy(false);
          }}
        >
          {busy ? "Создаю…" : "Создать группу"}
        </Button>
      </div>
    </section>
  );
}

type Run = (fn: () => Promise<void>, done?: string) => Promise<boolean>;

function GroupCard({
  group,
  data,
  streamName,
  staffName,
  roster,
  canEdit,
  manager,
  mine,
  open,
  onToggle,
  run,
  today,
  slots,
  stats,
}: {
  group: GroupRow;
  data: GroupsData;
  streamName: string;
  staffName: (id: string) => string;
  roster: RosterRow[];
  slots: SlotRow[];
  stats: Map<string, RosterStat>;
  canEdit: boolean;
  manager: boolean;
  mine: boolean;
  open: boolean;
  onToggle: () => void;
  run: Run;
  today: string;
}) {
  const current = activeLinks(data.staffLinks, group.id, today);
  const upcoming = upcomingLinks(data.staffLinks, group.id, today);
  const names = (role: GroupStaffRole) => current.filter((l) => l.role === role).map((l) => staffName(l.user_id));
  const teachers = names("teacher");
  const curators = names("curator");

  return (
    <section className={`sp-glass rounded-3xl border ${group.archived ? "opacity-60" : ""} ${mine ? "border-gold/30" : ""}`}>
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-left sm:px-6" aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg text-navy">{group.name}</span>
            {streamName ? <span className="text-sm text-muted">{streamName}</span> : null}
            {group.city ? <span className="text-sm text-muted">· {group.city}</span> : null}
            {mine ? <span className="text-xs text-gold">моя группа</span> : null}
            {group.archived ? <span className="text-xs text-muted">в архиве</span> : null}
          </span>
          {slots.length ? (
            <span className="mt-1 block text-sm text-navy/80">
              {slots.map((x) => `${WEEKDAYS[x.weekday - 1]} ${hhmm(x.starts_at)}${x.title ? ` ${x.title}` : ""}`).join(" · ")}
            </span>
          ) : null}
          <span className="mt-1 block text-sm text-muted">
            Учитель: <span className="text-navy">{teachers.join(", ") || "не назначен"}</span>
            <span className="mx-2">·</span>
            Куратор: <span className="text-navy">{curators.join(", ") || "не назначен"}</span>
            {upcoming.length ? (
              <span className="ml-2 text-gold">
                · с {fmtDate(upcoming[0].starts_on)} {GROUP_STAFF_LABELS[upcoming[0].role]} {staffName(upcoming[0].user_id)}
              </span>
            ) : null}
          </span>
        </span>
        <span className="text-sm text-muted">
          <span className="text-2xl font-light text-navy">{roster.length}</span> уч.
        </span>
        <span aria-hidden className={`text-[10px] text-muted transition ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {open ? (
        <div className="space-y-5 border-t border-white/[0.07] px-5 py-5 sm:px-6">
          {manager ? <StaffPanel group={group} data={data} staffName={staffName} run={run} today={today} /> : null}

          {canEdit || slots.length ? <SchedulePanel group={group} slots={slots} canEdit={canEdit && !group.archived} run={run} today={today} /> : null}

          <StudentsTable group={group} data={data} roster={roster} canEdit={canEdit} run={run} today={today} stats={stats} />

          {canEdit && !group.archived ? <AddStudent group={group} roster={data.roster} run={run} today={today} /> : null}

          {manager ? <GroupSettings group={group} data={data} run={run} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function StaffPanel({
  group,
  data,
  staffName,
  run,
  today,
}: {
  group: GroupRow;
  data: GroupsData;
  staffName: (id: string) => string;
  run: Run;
  today: string;
}) {
  const [role, setRole] = useState<GroupStaffRole>("teacher");
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [busy, setBusy] = useState(false);
  const candidates = data.staff.filter((s: StaffOption) => s.active && s.roles.some((r) => r.startsWith("sat_") || r === "head"));
  const history = data.staffLinks.filter((l) => l.group_id === group.id);

  return (
    <div className="rounded-2xl border border-white/10 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">Учитель и куратор</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        <Select value={role} onChange={(e) => setRole(e.target.value as GroupStaffRole)} aria-label="Роль в группе">
          <option value="teacher">Учитель</option>
          <option value="curator">Куратор</option>
        </Select>
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Сотрудник" className="sm:col-span-2">
          <option value="">{mode === "replace" ? "— никого (снять) —" : "— выберите —"}</option>
          {candidates.map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {s.full_name}
            </option>
          ))}
        </Select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="С даты" />
        <Button
          type="button"
          disabled={busy || !date || (mode === "add" && !userId)}
          onClick={async () => {
            setBusy(true);
            const who = userId ? staffName(userId) : "никто";
            await run(
              () => (mode === "replace" ? replaceGroupStaff(group.id, role, userId || null, date) : addGroupStaff(group.id, role, userId, date)),
              `${GROUP_STAFF_LABELS[role][0].toUpperCase()}${GROUP_STAFF_LABELS[role].slice(1)} группы «${group.name}» с ${fmtDate(date)}: ${who}`,
            );
            setBusy(false);
          }}
        >
          {busy ? "…" : mode === "replace" ? "Назначить" : "Добавить"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          <input type="radio" className="accent-[#cbb073]" checked={mode === "replace"} onChange={() => setMode("replace")} />
          заменить текущего с даты
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" className="accent-[#cbb073]" checked={mode === "add"} onChange={() => setMode("add")} />
          добавить ещё одного (второй учитель)
        </label>
      </div>
      {history.length ? (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer">История назначений ({history.length})</summary>
          <ul className="mt-2 space-y-1">
            {[...history]
              .sort((a, b) => b.starts_on.localeCompare(a.starts_on))
              .map((l) => (
                <li key={l.id}>
                  <span className="text-navy">{staffName(l.user_id)}</span> · {GROUP_STAFF_LABELS[l.role]} · {fmtDate(l.starts_on)} — {l.ends_on ? fmtDate(l.ends_on) : "сейчас"}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function StudentsTable({
  group,
  data,
  roster,
  canEdit,
  run,
  today,
  stats,
}: {
  group: GroupRow;
  data: GroupsData;
  roster: RosterRow[];
  canEdit: boolean;
  run: Run;
  today: string;
  stats: Map<string, RosterStat>;
}) {
  const [transferId, setTransferId] = useState<string | null>(null);

  if (roster.length === 0) {
    return <p className="text-sm text-muted">В группе пока нет учеников.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.07] text-left text-xs uppercase tracking-[0.12em] text-muted">
            <th className="px-4 py-2.5 font-normal">Ученик</th>
            <th className="px-4 py-2.5 font-normal">Цель</th>
            <th className="px-4 py-2.5 font-normal">Дата SAT</th>
            <th className="px-4 py-2.5 font-normal">Посещ.</th>
            <th className="px-4 py-2.5 font-normal">ДЗ</th>
            <th className="px-4 py-2.5 font-normal">В группе с</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <StudentRow
              key={r.enrollment_id}
              row={r}
              stat={stats.get(r.student_id)}
              group={group}
              groups={data.groups}
              canEdit={canEdit}
              transferOpen={transferId === r.enrollment_id}
              onTransferToggle={() => setTransferId((id) => (id === r.enrollment_id ? null : r.enrollment_id))}
              run={run}
              today={today}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentRow({
  row,
  stat,
  group,
  groups,
  canEdit,
  transferOpen,
  onTransferToggle,
  run,
  today,
}: {
  row: RosterRow;
  stat: RosterStat | undefined;
  group: GroupRow;
  groups: GroupRow[];
  canEdit: boolean;
  transferOpen: boolean;
  onTransferToggle: () => void;
  run: Run;
  today: string;
}) {
  const [target, setTarget] = useState(row.target_score ? String(row.target_score) : "");
  const [satDate, setSatDate] = useState(row.sat_date ?? "");
  const [toGroup, setToGroup] = useState("");
  const [date, setDate] = useState(today);
  const dirty = (parseScore(target) ?? null) !== (row.target_score ?? null) || (satDate || null) !== (row.sat_date ?? null);
  const left = daysUntil(row.sat_date);
  const targetBad = target !== "" && parseScore(target) === null;

  return (
    <>
      <tr className="border-b border-white/[0.04]">
        <td className="px-4 py-2.5 text-navy">
          {row.full_name}
          <span className="block text-xs text-muted">
            {[row.class_name, row.school].filter(Boolean).join(" · ")}
          </span>
        </td>
        <td className="px-4 py-2.5">
          {canEdit ? (
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1400"
              inputMode="numeric"
              className={`w-24 ${targetBad ? "border-burgundy/60" : ""}`}
              aria-label="Цель SAT"
            />
          ) : (
            <span className="text-navy">{row.target_score ?? "—"}</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          {canEdit ? (
            <Input type="date" value={satDate} onChange={(e) => setSatDate(e.target.value)} className="w-40" aria-label="Дата SAT" />
          ) : (
            <span className="text-navy">{fmtDate(row.sat_date)}</span>
          )}
          {left !== null ? <span className={`block text-xs ${left < 0 ? "text-muted" : "text-gold"}`}>{left >= 0 ? `через ${left} дн.` : "прошла"}</span> : null}
        </td>
        <td className="px-4 py-2.5 text-navy">{pct(stat?.attendance_pct)}</td>
        <td className="px-4 py-2.5 text-navy">{pct(stat?.homework_pct)}</td>
        <td className="whitespace-nowrap px-4 py-2.5 text-muted">{fmtDate(row.starts_on)}</td>
        <td className="px-4 py-2.5">
          {canEdit ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {dirty ? (
                <button
                  type="button"
                  disabled={targetBad}
                  onClick={() =>
                    void run(
                      () => updateEnrollment(row.enrollment_id, { target_score: parseScore(target), sat_date: satDate || null }),
                      `${row.full_name}: сохранено`,
                    )
                  }
                  className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-gold-ink disabled:opacity-50"
                >
                  Сохранить
                </button>
              ) : null}
              <button type="button" onClick={onTransferToggle} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-navy hover:border-gold/60">
                Перевести
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Убрать «${row.full_name}» из группы «${group.name}» с сегодняшнего дня?\n\nИстория сохранится.`)) return;
                  void run(() => endEnrollment(row.enrollment_id, today, "left"), `${row.full_name} больше не в группе`);
                }}
                className="rounded-full border border-burgundy/40 px-3 py-1.5 text-xs text-burgundy hover:bg-burgundy/10"
              >
                Убрать
              </button>
            </div>
          ) : null}
        </td>
      </tr>
      {transferOpen ? (
        <tr className="border-b border-white/[0.04] bg-white/[0.02]">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>В группу</Label>
                <Select value={toGroup} onChange={(e) => setToGroup(e.target.value)} className="w-56">
                  <option value="">— выберите —</option>
                  {groups
                    .filter((g) => g.id !== group.id && !g.archived)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div>
                <Label>С даты</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
              </div>
              <Button
                type="button"
                disabled={!toGroup || !date}
                onClick={() => {
                  const target = groups.find((g) => g.id === toGroup)?.name ?? "";
                  void run(() => transferEnrollment(row.enrollment_id, toGroup, date), `${row.full_name} переведён(а) в «${target}» с ${fmtDate(date)}`);
                }}
              >
                Перевести
              </Button>
              <p className="text-xs text-muted">Переводить можно в группы, которые вы ведёте. Цель и дата SAT перенесутся.</p>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AddStudent({ group, roster, run, today }: { group: GroupRow; roster: RosterRow[]; run: Run; today: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [target, setTarget] = useState("");
  const [satDate, setSatDate] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const inSat = useMemo(() => new Map(roster.map((r) => [r.student_id, r.group_id])), [roster]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const list = await searchStudents(q);
        if (!cancelled) setHits(list);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const visibleHits = query.trim().length >= 2 ? hits : [];

  return (
    <div className="rounded-2xl border border-white/10 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">Добавить ученика</p>
      {!picked ? (
        <>
          <Input
            className="mt-3"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Начните вводить имя или фамилию…"
            aria-label="Поиск ученика"
          />
          {searching ? <p className="mt-2 text-xs text-muted">Ищу…</p> : null}
          {visibleHits.length ? (
            <ul className="mt-2 divide-y divide-white/[0.05] rounded-xl border border-white/10">
              {visibleHits.map((h) => {
                const already = inSat.get(h.id);
                return (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-navy">
                      {h.full_name}
                      <span className="ml-2 text-xs text-muted">{[h.class_name, h.school].filter(Boolean).join(" · ")}</span>
                    </span>
                    {already !== undefined ? (
                      <span className="text-xs text-muted">{already === group.id ? "уже в этой группе" : "в другой SAT-группе — «Перевести»"}</span>
                    ) : (
                      <button type="button" onClick={() => setPicked(h)} className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold/10">
                        Выбрать
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : query.trim().length >= 2 && !searching ? (
            <p className="mt-2 text-xs text-muted">Никого не нашлось. Аккаунт ученика создаётся в «Ещё → Аккаунты».</p>
          ) : null}
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <Label>Ученик</Label>
            <p className="py-2 text-sm text-navy">{picked.full_name}</p>
          </div>
          <div>
            <Label>Цель SAT</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1400" className="w-24" inputMode="numeric" />
          </div>
          <div>
            <Label>Дата SAT</Label>
            <Input type="date" value={satDate} onChange={(e) => setSatDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>В группе с</Label>
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="w-40" />
          </div>
          <Button
            type="button"
            disabled={!startsOn || (target !== "" && parseScore(target) === null)}
            onClick={async () => {
              const ok = await run(
                () => enrollStudent({ studentId: picked.id, groupId: group.id, startsOn, targetScore: parseScore(target), satDate: satDate || null }),
                `${picked.full_name} добавлен(а) в «${group.name}»`,
              );
              if (ok) {
                setPicked(null);
                setQuery("");
                setTarget("");
                setSatDate("");
              }
            }}
          >
            Добавить
          </Button>
          <Button type="button" variant="ghost" onClick={() => setPicked(null)}>
            Отмена
          </Button>
        </div>
      )}
    </div>
  );
}

function GroupSettings({ group, data, run }: { group: GroupRow; data: GroupsData; run: Run }) {
  const [name, setName] = useState(group.name);
  const [city, setCity] = useState(group.city);
  const [streamId, setStreamId] = useState(group.stream_id ?? "");
  const dirty = name.trim() !== group.name || city.trim() !== group.city || (streamId || null) !== group.stream_id;
  return (
    <details className="rounded-2xl border border-white/10 px-4 py-3">
      <summary className="cursor-pointer text-xs uppercase tracking-[0.12em] text-muted">Настройки группы</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Название" />
        <Select value={streamId} onChange={(e) => setStreamId(e.target.value)} aria-label="Поток">
          <option value="">Без потока</option>
          {data.streams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Город" aria-label="Город" />
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={!dirty || !name.trim()}
            onClick={() => void run(() => updateGroup(group.id, { name: name.trim(), city: city.trim(), stream_id: streamId || null }), "Группа сохранена")}
          >
            Сохранить
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const archiving = !group.archived;
              if (archiving && !window.confirm(`Отправить «${group.name}» в архив? Ученики и история останутся, группа скроется из списка.`)) return;
              void run(() => updateGroup(group.id, { archived: archiving }), archiving ? "Группа в архиве" : "Группа возвращена из архива");
            }}
          >
            {group.archived ? "Из архива" : "В архив"}
          </Button>
        </div>
      </div>
    </details>
  );
}

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${v}%`;
}

function StreamEditor({ stream, run }: { stream: GroupsData["streams"][number]; run: Run }) {
  const [startsOn, setStartsOn] = useState(stream.starts_on ?? "");
  const [weeks, setWeeks] = useState(stream.weeks_total ? String(stream.weeks_total) : "");
  const dirty = (startsOn || null) !== stream.starts_on || (Number(weeks) || null) !== (stream.weeks_total ?? null);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 px-4 py-3">
      <p className="w-full text-xs uppercase tracking-[0.12em] text-muted sm:w-auto sm:self-center">Поток «{stream.name}»</p>
      <div>
        <Label htmlFor="se-start">Начало</Label>
        <Input id="se-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="w-44" />
      </div>
      <div>
        <Label htmlFor="se-weeks">Недель</Label>
        <Input id="se-weeks" value={weeks} inputMode="numeric" onChange={(e) => setWeeks(e.target.value.replace(/\D/g, "").slice(0, 3))} className="w-24" />
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={!dirty}
        onClick={() => void run(() => updateStream(stream.id, { starts_on: startsOn || null, weeks_total: Number(weeks) || null }), `Поток «${stream.name}» сохранён`)}
      >
        Сохранить
      </Button>
      <p className="text-xs text-muted">Ученики видят «неделя N из M» от даты начала.</p>
    </div>
  );
}

function SchedulePanel({
  group,
  slots,
  canEdit,
  run,
  today,
}: {
  group: GroupRow;
  slots: SlotRow[];
  canEdit: boolean;
  run: Run;
  today: string;
}) {
  const [weekday, setWeekday] = useState("2");
  const [time, setTime] = useState("17:00");
  const [duration, setDuration] = useState("90");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-2xl border border-white/10 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">Расписание</p>
      {slots.length ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {slots.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-28 text-navy">{WEEKDAYS_FULL[x.weekday - 1]}</span>
              <span className="text-navy">
                {hhmm(x.starts_at)} · {x.duration_min} мин
              </span>
              <span className="text-muted">{x.title || "занятие"}</span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Убрать «${WEEKDAYS_FULL[x.weekday - 1]} ${hhmm(x.starts_at)}» из расписания? Прошедшие занятия и отметки останутся.`)) return;
                    void run(() => endSlot(x, today), "Расписание обновлено");
                  }}
                  className="text-xs text-burgundy hover:underline"
                >
                  убрать
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Расписания пока нет.</p>
      )}

      {canEdit ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            <Select value={weekday} onChange={(e) => setWeekday(e.target.value)} aria-label="День недели">
              {WEEKDAYS_FULL.map((d, i) => (
                <option key={d} value={String(i + 1)}>
                  {d}
                </option>
              ))}
            </Select>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Время" />
            <Input value={duration} inputMode="numeric" onChange={(e) => setDuration(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Длительность, минут" placeholder="90" />
            <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Предмет" placeholder="Math / Verbal / Практис" />
            <Button
              type="button"
              disabled={busy || !time || Number(duration) < 15}
              onClick={async () => {
                setBusy(true);
                const ok = await run(
                  () => addSlot(group.id, { weekday: Number(weekday), starts_at: time, duration_min: Number(duration), title: title.trim() }),
                  `В расписание «${group.name}» добавлено: ${WEEKDAYS_FULL[Number(weekday) - 1]} ${time}`,
                );
                if (ok) setTitle("");
                setBusy(false);
              }}
            >
              В расписание
            </Button>
          </div>
          {slots.length === 0 ? (
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  for (const x of EXAMPLE_SLOTS) await addSlot(group.id, x);
                }, `«${group.name}»: расписание по примеру — Вт 17:00 Math, Чт 18:30 Verbal, Пт 17:00 Практис`)
              }
              className="mt-3 rounded-full border border-gold/50 px-4 py-2 text-xs text-gold hover:bg-gold/10"
            >
              Заполнить примером: Вт Math · Чт Verbal · Пт Практис
            </button>
          ) : null}
          <p className="mt-2 text-xs text-muted">Занятия появятся на странице «Занятия». Изменение расписания пересоздаёт будущие занятия, уже отмеченные не трогает.</p>
        </>
      ) : null}
    </div>
  );
}
