"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import { useAuth } from "@/context/AuthContext";
import { friendly } from "@/lib/groups";
import {
  ACTIVITY,
  addDays,
  addExtraLesson,
  ATTENDANCE,
  deleteLesson,
  fmtDay,
  hhmm,
  HOMEWORK,
  isMyLesson,
  isoDate,
  lessonTeacher,
  loadRoster,
  loadWeek,
  MARK_WINDOW_DAYS,
  mondayOf,
  saveMarks,
  updateLesson,
  WEEKDAYS,
  type LessonRow,
  type RosterMark,
  type WeekData,
} from "@/lib/lessons";
import { canManageSat, canOpenGroups } from "@/lib/staff";

type Run = (fn: () => Promise<void>, done?: string) => Promise<boolean>;

export default function LessonsPage() {
  const { user } = useAuth();
  const today = isoDate(new Date());
  const manager = canManageSat(user);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [data, setData] = useState<WeekData | null>(null);
  // Пока не выбрано вручную: руководителю и старшему учителю — все группы, остальным — свои
  const [scopeChoice, setScope] = useState<"mine" | "all" | null>(null);
  const scope = scopeChoice ?? (manager ? "all" : "mine");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  // Подгружаем и неделю, и последние 2 недели — для блока «Не отмечено»
  const from = weekStart < addDays(today, -14) ? weekStart : addDays(today, -14);
  const to = weekEnd > today ? weekEnd : today;

  const load = useCallback(async () => {
    try {
      setData(await loadWeek(from, to));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const run: Run = useCallback(
    async (fn, done) => {
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

  const userId = user?.id ?? "";
  const visible = useMemo(() => {
    if (!data) return [];
    return data.lessons.filter((l) => !l.groups?.archived && (scope === "all" || isMyLesson(l, data.staffLinks, userId)));
  }, [data, scope, userId]);

  const week = visible.filter((l) => l.lesson_date >= weekStart && l.lesson_date <= weekEnd);
  const unmarked = visible.filter(
    (l) =>
      l.status === "planned" &&
      l.lesson_date <= today &&
      l.lesson_date >= addDays(today, manager ? -14 : -MARK_WINDOW_DAYS) &&
      !data?.marked.get(l.id) &&
      (manager || isMyLesson(l, data?.staffLinks ?? [], userId)),
  );
  const open = data?.lessons.find((l) => l.id === openId) ?? null;
  const staffName = (id: string | null) => (id ? (data?.staff.find((s) => s.user_id === id)?.full_name ?? "—") : "не назначен");
  const editableGroups = (data?.groups ?? []).filter(
    (g) =>
      !g.archived &&
      (manager || (data?.staffLinks ?? []).some((l) => l.group_id === g.id && l.user_id === userId && (!l.ends_on || l.ends_on >= today))),
  );

  return (
    <RequireAuth role={["admin", "staff"]} allow={canOpenGroups}>
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">SAT</p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Занятия</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Занятия создаются из расписания групп. Отметки: присутствие, ДЗ и активность — пара нажатий на ученика. Исправить можно {MARK_WINDOW_DAYS} дня после занятия.
            </p>
          </div>
          {editableGroups.length ? (
            <Button type="button" variant={extraOpen ? "secondary" : "primary"} onClick={() => setExtraOpen((v) => !v)}>
              {extraOpen ? "Отмена" : "+ Доп. занятие"}
            </Button>
          ) : null}
        </div>

        {error ? <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">{notice}</div> : null}

        {extraOpen ? (
          <ExtraForm
            groups={editableGroups}
            today={today}
            onSubmit={async (input) => {
              if (await run(() => addExtraLesson(input), `Занятие добавлено: ${fmtDay(input.date)}, ${input.time}`)) setExtraOpen(false);
            }}
          />
        ) : null}

        {unmarked.length ? (
          <section className="rounded-3xl border border-gold/40 bg-gold/[0.07] px-5 py-5 sm:px-6">
            <h3 className="text-lg text-navy">Не отмечено · {unmarked.length}</h3>
            <p className="mt-1 text-sm text-muted">Эти занятия прошли (или идут сегодня), а отметок нет.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {unmarked.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    setOpenId(l.id);
                    if (l.lesson_date < weekStart || l.lesson_date > weekEnd) setWeekStart(mondayOf(l.lesson_date));
                  }}
                  className="rounded-2xl border border-white/15 bg-black/10 px-3 py-2 text-left text-sm transition hover:border-gold/60"
                >
                  <span className="block text-navy">
                    {fmtDay(l.lesson_date)} · {hhmm(l.starts_at)}
                  </span>
                  <span className="block text-xs text-muted">
                    {l.groups?.name} · {l.title || "занятие"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="sp-glass rounded-3xl border px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-navy hover:border-gold/60" aria-label="Прошлая неделя">
                ←
              </button>
              <h3 className="text-lg text-navy">
                {weekStart === mondayOf(today) ? "Эта неделя" : `${fmtDay(weekStart)} — ${fmtDay(weekEnd)}`}
              </h3>
              <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-navy hover:border-gold/60" aria-label="Следующая неделя">
                →
              </button>
              {weekStart !== mondayOf(today) ? (
                <button type="button" onClick={() => setWeekStart(mondayOf(today))} className="text-sm text-muted underline-offset-2 hover:text-navy hover:underline">
                  сегодня
                </button>
              ) : null}
            </div>
            <div className="flex rounded-full border border-white/10 p-1 text-sm">
              {(["mine", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  className={`rounded-full px-4 py-1.5 transition ${scope === s ? "bg-gold font-semibold text-gold-ink" : "text-muted hover:text-navy"}`}
                >
                  {s === "mine" ? "Мои" : "Все группы"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-7">
            {WEEKDAYS.map((label, i) => {
              const day = addDays(weekStart, i);
              const items = week.filter((l) => l.lesson_date === day);
              const isToday = day === today;
              return (
                <div key={day} className="min-w-0">
                  <p className={`text-xs font-semibold ${isToday ? "text-gold" : "text-muted"}`}>
                    {label} {Number(day.slice(8))}
                    {isToday ? " · сегодня" : ""}
                  </p>
                  <div className="mt-2 space-y-2">
                    {items.length === 0 ? <p className="text-xs text-muted/60">—</p> : null}
                    {items.map((l) => {
                      const marked = data?.marked.get(l.id) ?? 0;
                      const cancelled = l.status === "cancelled";
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setOpenId((id) => (id === l.id ? null : l.id))}
                          aria-pressed={openId === l.id}
                          className={`w-full rounded-xl border px-2.5 py-2 text-left text-xs transition ${
                            openId === l.id
                              ? "border-gold bg-gold/15"
                              : isToday
                                ? "border-gold/40 bg-white/[0.06] hover:border-gold"
                                : "border-white/10 bg-white/[0.03] hover:border-white/30"
                          } ${cancelled ? "opacity-50" : ""}`}
                        >
                          <span className={`block font-semibold text-navy ${cancelled ? "line-through" : ""}`}>{hhmm(l.starts_at)}</span>
                          <span className="block truncate text-navy">{l.groups?.name}</span>
                          <span className="block truncate text-muted">{l.title || "занятие"}</span>
                          <span className="mt-1 block">
                            {cancelled ? (
                              <span className="text-muted">отменено</span>
                            ) : marked ? (
                              <span className="text-emerald-300">✓ отмечено</span>
                            ) : l.lesson_date <= today ? (
                              <span className="text-gold">не отмечено</span>
                            ) : null}
                            {l.teacher_id ? <span className="block text-sky-200">замена</span> : null}
                            {l.moved_from ? <span className="block text-sky-200">перенесено</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {data && week.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              {scope === "mine" ? "На этой неделе у вас нет занятий. Переключитесь на «Все группы» или задайте расписание на странице групп." : "Занятий нет — задайте расписание групп на странице «SAT · группы»."}
            </p>
          ) : null}
        </section>

        {open && data ? (
          <LessonPanel
            key={open.id}
            lesson={open}
            data={data}
            today={today}
            manager={manager}
            teacherName={staffName(lessonTeacher(open, data.staffLinks))}
            run={run}
            onClose={() => setOpenId(null)}
          />
        ) : null}
      </div>
    </RequireAuth>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  disabled,
  name,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  disabled: boolean;
  name: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={name}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? null : o.value)}
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed ${
              on ? "bg-gold text-gold-ink" : "border border-white/15 text-muted hover:border-white/40 hover:text-navy"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LessonPanel({
  lesson,
  data,
  today,
  manager,
  teacherName,
  run,
  onClose,
}: {
  lesson: LessonRow;
  data: WeekData;
  today: string;
  manager: boolean;
  teacherName: string;
  run: Run;
  onClose: () => void;
}) {
  const [roster, setRoster] = useState<RosterMark[] | null>(null);
  const [topic, setTopic] = useState(lesson.topic);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<"none" | "move" | "sub">("none");
  const [moveDate, setMoveDate] = useState(lesson.lesson_date);
  const [moveTime, setMoveTime] = useState(hhmm(lesson.starts_at));
  const [subId, setSubId] = useState(lesson.teacher_id ?? "");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadRoster(lesson.id)
      .then((r) => {
        if (!cancelled) setRoster(r);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [lesson.id]);

  const future = lesson.lesson_date > today;
  const locked = !manager && lesson.lesson_date < addDays(today, -MARK_WINDOW_DAYS);
  const cancelled = lesson.status === "cancelled";
  const canMark = !future && !locked && !cancelled;
  const set = (id: string, patch: Partial<RosterMark>) =>
    setRoster((prev) => (prev ? prev.map((r) => (r.student_id === id ? { ...r, ...patch } : r)) : prev));
  const candidates = data.staff.filter((s) => s.active && s.roles.some((r) => r.startsWith("sat_") || r === "head"));

  return (
    <section className="sp-rise sp-glass rounded-3xl border border-gold/30 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-gold">
            {fmtDay(lesson.lesson_date)} · {hhmm(lesson.starts_at)} · {lesson.duration_min} мин
          </p>
          <h3 className={`mt-1 text-2xl font-light text-navy ${cancelled ? "line-through" : ""}`}>
            {lesson.groups?.name} · {lesson.title || "занятие"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Учитель: <span className="text-navy">{teacherName}</span>
            {lesson.teacher_id ? <span className="text-sky-200"> (замена)</span> : null}
            {lesson.moved_from ? <span> · перенесено с {lesson.moved_from}</span> : null}
            {cancelled ? <span className="text-burgundy"> · отменено</span> : null}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-navy">
          Закрыть
        </button>
      </div>

      {future ? <p className="mt-4 text-sm text-muted">Отметки можно поставить в день занятия.</p> : null}
      {locked ? (
        <p className="mt-4 text-sm text-muted">Прошло больше {MARK_WINDOW_DAYS} дней — исправить отметки может старший учитель или руководитель.</p>
      ) : null}
      {loadError ? <p className="mt-4 text-sm text-burgundy">{loadError}</p> : null}

      {!cancelled ? (
        <div className="mt-4">
          <Label htmlFor="topic">Тема занятия</Label>
          <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Проценты" disabled={locked} />
        </div>
      ) : null}

      {roster && !cancelled ? (
        roster.length === 0 ? (
          <p className="mt-4 text-sm text-muted">В группе на эту дату нет учеников.</p>
        ) : (
          <>
            {canMark ? (
              <button
                type="button"
                onClick={() => setRoster((prev) => prev?.map((r) => ({ ...r, attendance: r.attendance ?? "present" })) ?? prev)}
                className="mt-4 rounded-full border border-white/15 px-3 py-1.5 text-xs text-navy hover:border-gold/60"
              >
                Всем без отметки — «был»
              </button>
            ) : null}
            <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-white/[0.07] text-left text-xs uppercase tracking-[0.12em] text-muted">
                    <th className="px-4 py-2.5 font-normal">Ученик</th>
                    <th className="px-4 py-2.5 font-normal">Присутствие</th>
                    <th className="px-4 py-2.5 font-normal">ДЗ прошлого занятия</th>
                    <th className="px-4 py-2.5 font-normal">Активность</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.student_id} className="border-b border-white/[0.04]">
                      <td className="px-4 py-2.5 text-navy">
                        {r.full_name}
                        <span className="block text-xs text-muted">{r.class_name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Chips name={`Присутствие: ${r.full_name}`} options={ATTENDANCE} value={r.attendance} disabled={!canMark} onChange={(v) => set(r.student_id, { attendance: v })} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Chips name={`ДЗ: ${r.full_name}`} options={HOMEWORK} value={r.homework} disabled={!canMark} onChange={(v) => set(r.student_id, { homework: v })} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Chips name={`Активность: ${r.full_name}`} options={ACTIVITY} value={r.activity} disabled={!canMark} onChange={(v) => set(r.student_id, { activity: v })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canMark ? (
              <Button
                type="button"
                className="mt-4"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await run(() => saveMarks(lesson.id, topic, roster), `Отметки сохранены: ${lesson.groups?.name}, ${fmtDay(lesson.lesson_date)}`);
                  setBusy(false);
                }}
              >
                {busy ? "Сохраняю…" : "Сохранить отметки"}
              </Button>
            ) : null}
          </>
        )
      ) : !cancelled && !loadError ? (
        <p className="mt-4 text-sm text-muted">Загрузка учеников…</p>
      ) : null}

      {!locked ? (
        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <div className="flex flex-wrap gap-2">
            {!cancelled ? (
              <>
                <SmallButton active={action === "move"} onClick={() => setAction((a) => (a === "move" ? "none" : "move"))}>
                  Перенести
                </SmallButton>
                <SmallButton active={action === "sub"} onClick={() => setAction((a) => (a === "sub" ? "none" : "sub"))}>
                  Замена учителя
                </SmallButton>
              </>
            ) : null}
            <SmallButton
              danger={!cancelled}
              onClick={() => {
                if (!cancelled && !window.confirm("Отменить занятие? Отметки (если есть) сохранятся, но в посещаемость оно не войдёт.")) return;
                void run(() => updateLesson(lesson.id, { status: cancelled ? "planned" : "cancelled" }), cancelled ? "Занятие возвращено" : "Занятие отменено");
              }}
            >
              {cancelled ? "Вернуть занятие" : "Отменить"}
            </SmallButton>
            {!lesson.slot_id ? (
              <SmallButton
                danger
                onClick={() => {
                  if (!window.confirm("Удалить это внеплановое занятие вместе с отметками?")) return;
                  void run(async () => {
                    await deleteLesson(lesson.id);
                    onClose();
                  }, "Занятие удалено");
                }}
              >
                Удалить
              </SmallButton>
            ) : null}
          </div>

          {action === "move" ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="move-date">Новая дата</Label>
                <Input id="move-date" type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className="w-44" />
              </div>
              <div>
                <Label htmlFor="move-time">Время</Label>
                <Input id="move-time" type="time" value={moveTime} onChange={(e) => setMoveTime(e.target.value)} className="w-32" />
              </div>
              <Button
                type="button"
                disabled={!moveDate || !moveTime}
                onClick={() =>
                  void run(
                    () =>
                      updateLesson(lesson.id, {
                        lesson_date: moveDate,
                        starts_at: moveTime,
                        moved_from: lesson.moved_from || `${fmtDay(lesson.lesson_date)} ${hhmm(lesson.starts_at)}`,
                      }),
                    `Занятие перенесено на ${fmtDay(moveDate)}, ${moveTime}`,
                  )
                }
              >
                Перенести
              </Button>
            </div>
          ) : null}

          {action === "sub" ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="sub-teacher">Кто ведёт это занятие</Label>
                <Select id="sub-teacher" value={subId} onChange={(e) => setSubId(e.target.value)} className="w-64">
                  <option value="">Учитель группы (без замены)</option>
                  {candidates.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="button"
                onClick={() =>
                  void run(
                    () => updateLesson(lesson.id, { teacher_id: subId || null }),
                    subId ? `Замена: ${candidates.find((c) => c.user_id === subId)?.full_name ?? ""}` : "Замена снята",
                  )
                }
              >
                Сохранить
              </Button>
              <p className="text-xs text-muted">Заменяющий учитель увидит занятие у себя и сможет его отметить.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SmallButton({ children, onClick, danger = false, active = false }: { children: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        danger
          ? "border-burgundy/40 text-burgundy hover:bg-burgundy/10"
          : active
            ? "border-gold bg-gold/15 text-navy"
            : "border-white/15 text-navy hover:border-gold/60 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function ExtraForm({
  groups,
  today,
  onSubmit,
}: {
  groups: { id: string; name: string }[];
  today: string;
  onSubmit: (input: { groupId: string; date: string; time: string; duration: number; title: string }) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("17:00");
  const [duration, setDuration] = useState("90");
  const [title, setTitle] = useState("Office hours");
  const [busy, setBusy] = useState(false);
  return (
    <section className="sp-rise grid gap-4 rounded-3xl border border-gold/25 bg-[#162030] px-5 py-5 sm:grid-cols-6 sm:px-6">
      <div className="sm:col-span-2">
        <Label htmlFor="ex-group">Группа</Label>
        <Select id="ex-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="ex-date">Дата</Label>
        <Input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="ex-time">Время</Label>
        <Input id="ex-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="ex-dur">Минут</Label>
        <Input id="ex-dur" value={duration} inputMode="numeric" onChange={(e) => setDuration(e.target.value.replace(/\D/g, "").slice(0, 3))} />
      </div>
      <div>
        <Label htmlFor="ex-title">Что</Label>
        <Input id="ex-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="sm:col-span-6">
        <Button
          type="button"
          disabled={busy || !groupId || !date || !time || Number(duration) < 15}
          onClick={async () => {
            setBusy(true);
            await onSubmit({ groupId, date, time, duration: Number(duration), title });
            setBusy(false);
          }}
        >
          {busy ? "Добавляю…" : "Добавить занятие"}
        </Button>
      </div>
    </section>
  );
}
