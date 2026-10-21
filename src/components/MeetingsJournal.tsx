"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import {
  ATTENDANCE_LABELS,
  EMPTY_NOTES,
  FORMAT_LABELS,
  REFLECTION_ITEMS,
  buildMeetingsCsv,
  deleteMeeting,
  downloadTextFile,
  fetchMeetingsByParentToken,
  fetchMeetingsForStudent,
  fetchMeetingsWithNotes,
  formatMeetingDate,
  homeworkRating,
  isMeetingsTableMissing,
  meetingStats,
  reflectionAverage,
  saveMeeting,
  todayIso,
  type Attendance,
  type Meeting,
  type MeetingMentorNotes,
  type MeetingWithNotes,
} from "@/lib/meetings";

type JournalMode = "admin" | "student" | "parent";

interface MeetingsJournalProps {
  studentId: string;
  mode: JournalMode;
  /** Для родителя: токен гостевой ссылки */
  parentToken?: string;
  /** Для имени файла выгрузки */
  studentName?: string;
  /** Вызывается после сохранения — баллы ученика пересчитаны в базе */
  onScoresChanged?: () => void;
}

const MIGRATION_HINT =
  "Журнал встреч ещё не подключён к базе. Откройте Supabase → SQL Editor и выполните файл supabase/migration-meetings.sql, затем обновите страницу.";

function errorText(error: unknown): string {
  if (isMeetingsTableMissing(error)) return MIGRATION_HINT;
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  return `Не удалось загрузить или сохранить: ${message}`;
}

function formatScore(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits).replace(".", ",");
}

export function MeetingsJournal({
  studentId,
  mode,
  parentToken,
  studentName,
  onScoresChanged,
}: MeetingsJournalProps) {
  const isAdmin = mode === "admin";
  const [meetings, setMeetings] = useState<MeetingWithNotes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchList = useCallback(async (): Promise<MeetingWithNotes[]> => {
    if (mode === "admin") return fetchMeetingsWithNotes(studentId);
    const plain =
      mode === "parent"
        ? await fetchMeetingsByParentToken(parentToken ?? "")
        : await fetchMeetingsForStudent(studentId);
    return plain.map((m) => ({ ...m, notes: { ...EMPTY_NOTES } }));
  }, [mode, studentId, parentToken]);

  const applyResult = useCallback(
    (result: PromiseSettledResult<MeetingWithNotes[]>) => {
      if (result.status === "fulfilled") {
        setMeetings(result.value);
        setError("");
      } else {
        console.error(result.reason);
        setError(errorText(result.reason));
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchList().then(
      (value) => {
        if (!cancelled) applyResult({ status: "fulfilled", value });
      },
      (reason: unknown) => {
        if (!cancelled) applyResult({ status: "rejected", reason });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchList, applyResult]);

  const load = async () => {
    const [result] = await Promise.allSettled([fetchList()]);
    applyResult(result);
  };

  const stats = useMemo(() => meetingStats(meetings), [meetings]);
  const reflectionAvg = useMemo(() => {
    const values = meetings
      .map((m) => reflectionAverage(m.notes))
      .filter((v): v is number => v !== null);
    return values.length
      ? values.reduce((s, v) => s + v, 0) / values.length
      : null;
  }, [meetings]);

  const latest = meetings.find((m) => m.format === "individual");
  const currentHomework = latest?.homework.trim() ? latest : undefined;

  const handleSaved = async () => {
    setEditingId(null);
    await load();
    onScoresChanged?.();
  };

  const handleExport = () => {
    const names = new Map([[studentId, studentName ?? ""]]);
    const safeName = (studentName || "ученик").replace(/[^\p{L}\p{N}]+/gu, "_");
    downloadTextFile(
      `встречи_${safeName}_${todayIso()}.csv`,
      buildMeetingsCsv(meetings, names),
    );
  };

  return (
    <Card>
      <CardHeader
        title="Журнал встреч"
        subtitle={
          isAdmin
            ? "Индивидуальные встречи раз в неделю. Посещаемость и выполнение заданий в индикаторах считаются отсюда автоматически."
            : "Индивидуальные встречи с ментором: посещение, темы и домашние задания."
        }
        action={
          isAdmin ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={handleExport}
                disabled={meetings.length === 0}
              >
                Выгрузить в Excel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setEditingId("new");
                  setExpandedId(null);
                }}
                disabled={editingId === "new" || Boolean(error)}
              >
                + Новая встреча
              </Button>
            </div>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-burgundy/30 bg-burgundy/5 px-4 py-3 text-sm text-burgundy">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-sm text-muted">Загрузка встреч…</p>
        ) : (
          <>
            <StatsRow
              total={stats.total}
              attendance={stats.attendancePercent}
              homework={stats.homeworkAverage}
              reflection={isAdmin ? reflectionAvg : undefined}
            />

            {!isAdmin && currentHomework ? (
              <div className="rounded-2xl border border-burgundy/30 bg-gradient-to-br from-burgundy-deep to-[#5a1622] px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#f0d9a8]">
                  Текущее домашнее задание
                </p>
                <p className="mt-2 whitespace-pre-line text-lg font-medium leading-snug text-white">
                  {currentHomework.homework}
                </p>
                <p className="mt-2 text-xs text-[#e9c9cf]">
                  с встречи {formatMeetingDate(currentHomework.meetingDate)}
                </p>
              </div>
            ) : null}

            {editingId === "new" ? (
              <MeetingForm
                studentId={studentId}
                initial={null}
                carriedHomework={latest?.homework ?? ""}
                onCancel={() => setEditingId(null)}
                onSaved={handleSaved}
              />
            ) : null}

            {meetings.length === 0 && editingId !== "new" ? (
              <p className="rounded-2xl border border-dashed border-light-gray px-4 py-8 text-center text-sm text-muted">
                {isAdmin
                  ? "Встреч пока нет. Нажмите «+ Новая встреча», чтобы записать первую."
                  : "Ментор пока не записал ни одной встречи."}
              </p>
            ) : null}

            <ul className="space-y-3">
              {meetings.map((meeting) =>
                editingId === meeting.id ? (
                  <li key={meeting.id}>
                    <MeetingForm
                      studentId={studentId}
                      initial={meeting}
                      carriedHomework=""
                      onCancel={() => setEditingId(null)}
                      onSaved={handleSaved}
                    />
                  </li>
                ) : (
                  <li key={meeting.id}>
                    <MeetingCard
                      meeting={meeting}
                      showMentorNotes={isAdmin}
                      expanded={expandedId === meeting.id}
                      onToggle={() =>
                        setExpandedId((prev) =>
                          prev === meeting.id ? null : meeting.id,
                        )
                      }
                      onEdit={
                        isAdmin
                          ? () => {
                              setEditingId(meeting.id);
                              setExpandedId(null);
                            }
                          : undefined
                      }
                    />
                  </li>
                ),
              )}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- Статистика ----------

function StatsRow({
  total,
  attendance,
  homework,
  reflection,
}: {
  total: number;
  attendance: number | null;
  homework: number | null;
  reflection?: number | null;
}) {
  const items = [
    { label: "Встреч", value: String(total) },
    {
      label: "Посещаемость",
      value: attendance === null ? "—" : `${Math.round(attendance)}%`,
    },
    { label: "Домашка, ср.", value: `${formatScore(homework)} / 10` },
  ];
  if (reflection !== undefined) {
    items.push({
      label: "Моя самооценка, ср. 🔒",
      value: `${formatScore(reflection)} / 10`,
    });
  }

  return (
    <div
      className={`grid grid-cols-2 gap-2 ${items.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3"
        >
          <p className="text-xs text-muted">{item.label}</p>
          <p className="mt-0.5 text-2xl font-light tracking-tight text-navy">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- Карточка встречи (просмотр) ----------

const ATTENDANCE_STYLES: Record<Attendance, string> = {
  present: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  late: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  absent: "bg-burgundy/10 text-burgundy border-burgundy/40",
};

function MeetingCard({
  meeting,
  showMentorNotes,
  expanded,
  onToggle,
  onEdit,
}: {
  meeting: MeetingWithNotes;
  showMentorNotes: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
}) {
  const hw = homeworkRating(meeting);
  const self = reflectionAverage(meeting.notes);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] transition hover:border-gold/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <p className="font-semibold text-navy first-letter:uppercase">
            {formatMeetingDate(meeting.meetingDate)}
          </p>
          <p className="text-xs text-muted">{FORMAT_LABELS[meeting.format]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {meeting.attendance ? (
            <span
              className={`rounded-full border px-2 py-0.5 font-medium ${ATTENDANCE_STYLES[meeting.attendance]}`}
            >
              {ATTENDANCE_LABELS[meeting.attendance]}
            </span>
          ) : null}
          {hw !== null ? (
            <span className="rounded-full border border-light-gray px-2 py-0.5 text-navy">
              Домашка {formatScore(hw)}/10
            </span>
          ) : null}
          {showMentorNotes && self !== null ? (
            <span className="rounded-full border border-navy/20 bg-navy/5 px-2 py-0.5 text-navy">
              🔒 Я {formatScore(self)}/10
            </span>
          ) : null}
          <span className="text-muted" aria-hidden>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-light-gray px-4 py-3 text-sm">
          {showMentorNotes && meeting.notes.plan ? (
            <Detail label="План встречи 🔒" text={meeting.notes.plan} />
          ) : null}
          {meeting.prevHomework ? (
            <Detail
              label="Домашка с прошлой встречи"
              text={meeting.prevHomework}
              extra={
                meeting.hwUnderstanding !== null || meeting.hwQuality !== null
                  ? `Понимание: ${meeting.hwUnderstanding ?? "—"}/10 · Качество: ${meeting.hwQuality ?? "—"}/10`
                  : undefined
              }
            />
          ) : null}
          {meeting.summary ? (
            <Detail label="Что обсудили" text={meeting.summary} />
          ) : null}
          {meeting.homework ? (
            <Detail label="Домашнее задание" text={meeting.homework} />
          ) : null}
          {showMentorNotes && self !== null ? (
            <div className="rounded-xl bg-navy/5 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Самооценка 🔒
              </p>
              <ul className="mt-1 space-y-0.5 text-navy">
                {REFLECTION_ITEMS.map((item) => (
                  <li key={item.key}>
                    {item.label}: {meeting.notes[item.key] ?? "—"}/10
                  </li>
                ))}
              </ul>
              {meeting.notes.reflectionComment ? (
                <p className="mt-1 whitespace-pre-line text-navy/80">
                  {meeting.notes.reflectionComment}
                </p>
              ) : null}
            </div>
          ) : null}
          {!meeting.prevHomework &&
          !meeting.summary &&
          !meeting.homework &&
          !(showMentorNotes && meeting.notes.plan) ? (
            <p className="text-muted">Подробности не заполнены.</p>
          ) : null}
          {onEdit ? (
            <Button type="button" variant="secondary" onClick={onEdit}>
              Редактировать
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Detail({
  label,
  text,
  extra,
}: {
  label: string;
  text: string;
  extra?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-line text-navy">{text}</p>
      {extra ? <p className="mt-0.5 text-xs text-muted">{extra}</p> : null}
    </div>
  );
}

// ---------- Форма встречи (ментор) ----------

function MeetingForm({
  studentId,
  initial,
  carriedHomework,
  onCancel,
  onSaved,
}: {
  studentId: string;
  initial: MeetingWithNotes | null;
  carriedHomework: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [meeting, setMeeting] = useState<Omit<Meeting, "id">>(() =>
    initial
      ? {
          studentId: initial.studentId,
          meetingDate: initial.meetingDate,
          format: initial.format,
          attendance: initial.attendance,
          prevHomework: initial.prevHomework,
          hwUnderstanding: initial.hwUnderstanding,
          hwQuality: initial.hwQuality,
          summary: initial.summary,
          homework: initial.homework,
        }
      : {
          studentId,
          meetingDate: todayIso(),
          format: "individual",
          attendance: null,
          prevHomework: carriedHomework,
          hwUnderstanding: null,
          hwQuality: null,
          summary: "",
          homework: "",
        },
  );
  const [notes, setNotes] = useState<MeetingMentorNotes>(() =>
    initial ? { ...initial.notes } : { ...EMPTY_NOTES },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const patch = (p: Partial<typeof meeting>) =>
    setMeeting((prev) => ({ ...prev, ...p }));
  const patchNotes = (p: Partial<MeetingMentorNotes>) =>
    setNotes((prev) => ({ ...prev, ...p }));

  const handleSave = async () => {
    if (!meeting.meetingDate) {
      setError("Укажите дату встречи");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveMeeting({ ...meeting, id: initial?.id }, notes);
      await onSaved();
    } catch (err) {
      console.error(err);
      setError(errorText(err));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initial) return;
    if (
      !window.confirm(
        `Удалить встречу ${formatMeetingDate(initial.meetingDate)}? Это нельзя отменить.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteMeeting(initial.id);
      await onSaved();
    } catch (err) {
      console.error(err);
      setError(errorText(err));
      setSaving(false);
    }
  };

  return (
    <div className="sp-rise space-y-5 rounded-2xl border border-gold/30 bg-[#162030] p-4 sm:p-5">
      <p className="font-semibold text-navy">
        {initial ? "Редактирование встречи" : "Новая встреча"}
      </p>

      {/* 1. Основное */}
      <FormBlock title="1. Основное">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Дата</Label>
            <Input
              type="date"
              value={meeting.meetingDate}
              onChange={(e) => patch({ meetingDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Формат</Label>
            <Select
              value={meeting.format}
              onChange={(e) =>
                patch({ format: e.target.value as Meeting["format"] })
              }
            >
              <option value="individual">{FORMAT_LABELS.individual}</option>
              <option value="group">
                {FORMAT_LABELS.group}
              </option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Посещение</Label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ATTENDANCE_LABELS) as Attendance[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  patch({ attendance: meeting.attendance === key ? null : key })
                }
                className={`rounded-xl border px-2 py-2 text-sm font-medium transition ${
                  meeting.attendance === key
                    ? ATTENDANCE_STYLES[key] + " ring-2 ring-offset-1 ring-current"
                    : "border-light-gray text-navy hover:bg-light-gray/40"
                }`}
                aria-pressed={meeting.attendance === key}
              >
                {ATTENDANCE_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      </FormBlock>

      {/* 2. План */}
      <FormBlock title="2. План встречи" privateNote="только вы">
        <Textarea
          value={notes.plan}
          onChange={(e) => patchNotes({ plan: e.target.value })}
          placeholder="Что спросить, что обсудить, на что обратить внимание"
        />
      </FormBlock>

      {/* 3. Домашка */}
      <FormBlock title="3. Домашка с прошлой встречи">
        <Textarea
          value={meeting.prevHomework}
          onChange={(e) => patch({ prevHomework: e.target.value })}
          placeholder="Подставляется автоматически из прошлой встречи"
          className="min-h-16"
        />
        <RatingPicker
          label="Понимание задания"
          hint="Насколько ученик понял, что и зачем нужно было сделать"
          value={meeting.hwUnderstanding}
          onChange={(v) => patch({ hwUnderstanding: v })}
        />
        <RatingPicker
          label="Качество выполнения"
          hint="Насколько хорошо и аккуратно сделано"
          value={meeting.hwQuality}
          onChange={(v) => patch({ hwQuality: v })}
        />
      </FormBlock>

      {/* 4. Итог */}
      <FormBlock title="4. Итог встречи">
        <div>
          <Label>Что обсудили</Label>
          <Textarea
            value={meeting.summary}
            onChange={(e) => patch({ summary: e.target.value })}
            className="min-h-16"
          />
        </div>
        <div>
          <Label>Новое домашнее задание</Label>
          <Textarea
            value={meeting.homework}
            onChange={(e) => patch({ homework: e.target.value })}
            placeholder="Перейдёт в план следующей встречи"
            className="min-h-16"
          />
        </div>
      </FormBlock>

      {/* 5. Самооценка */}
      <FormBlock title="5. Самооценка" privateNote="только вы">
        {REFLECTION_ITEMS.map((item) => (
          <RatingPicker
            key={item.key}
            label={item.label}
            hint={item.hint}
            value={notes[item.key]}
            onChange={(v) => patchNotes({ [item.key]: v })}
          />
        ))}
        <div>
          <Label>Что улучшить в следующий раз</Label>
          <Textarea
            value={notes.reflectionComment}
            onChange={(e) => patchNotes({ reflectionComment: e.target.value })}
            className="min-h-16"
          />
        </div>
      </FormBlock>

      {error ? (
        <div className="rounded-2xl border border-burgundy/30 bg-burgundy/5 px-4 py-3 text-sm text-burgundy">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить встречу"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Отмена
          </Button>
        </div>
        {initial ? (
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            disabled={saving}
          >
            Удалить встречу
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FormBlock({
  title,
  privateNote,
  children,
}: {
  title: string;
  privateNote?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className={`space-y-3 rounded-2xl border p-3 ${
        privateNote ? "border-navy/20 bg-navy/[0.03]" : "border-light-gray"
      }`}
    >
      <legend className="px-1 text-sm font-semibold text-navy">
        {title}
        {privateNote ? (
          <span className="ml-2 whitespace-nowrap text-xs font-normal text-muted">
            🔒 {privateNote}
          </span>
        ) : null}
      </legend>
      {children}
    </fieldset>
  );
}

function RatingPicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        <span className="text-sm font-semibold text-navy">
          {value === null ? "—" : `${value}/10`}
        </span>
      </div>
      {hint ? <p className="mb-1.5 text-xs text-muted">{hint}</p> : null}
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`h-9 rounded-xl border text-sm font-medium transition ${
              value !== null && n <= value
                ? "border-gold bg-gold text-gold-ink"
                : "border-white/10 bg-white/[0.03] text-navy hover:bg-white/10"
            }`}
            aria-label={`${label}: ${n}`}
            aria-pressed={value === n}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
