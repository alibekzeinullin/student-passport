"use client";

import { useEffect, useMemo, useState } from "react";
import type { StudentCourse } from "@/lib/courses";
import { useSatTheme } from "@/lib/sat-theme";
import { ackLesson, addDays, courseWeek, fmtDay, hhmm, isoDate, loadAcks, loadStudentSatInfo, loadStudentUpcoming, type LessonRow, type StudentSatInfo } from "@/lib/lessons";
import {
  loadComments,
  loadResults,
  pathToTarget,
  pctTone,
  SECTION_LABELS,
  studentMocks,
  studentPractices,
  weakTopics,
  type CommentRow,
  type ResultsData,
  type TopicScore,
} from "@/lib/results";
import {
  computeAchievements,
  linkParts,
  loadHomeworkLessons,
  loadMockRank,
  loadMyMarks,
  loadOfficial,
  type Achievement,
  type MockRank,
  type MyMark,
  type OfficialResult,
} from "@/lib/sat-student";
import { MyTests } from "@/components/tests/MyTests";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000);
}

function endTime(start: string, minutes: number): string {
  const [h, m] = hhmm(start).split(":").map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function durationLabel(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** Цвета разделов: Verbal и Math различимы и в светлой теме. */
const VERBAL = "#4f6bd8";
const MATH = "#2a9d8f";
const TONE_BAR = { low: "bg-burgundy/80", mid: "bg-gold", high: "bg-emerald-500" } as const;
const TONE_CARD = { low: "bg-burgundy/[0.07] border-burgundy/30", mid: "bg-gold/[0.08] border-gold/30", high: "bg-emerald-500/[0.07] border-emerald-500/25" } as const;
const HW_LABEL = { done: "сделано", partial: "частично", none: "не сделано" } as const;

/** Вкладка SAT в кабинете ученика. Обращение — на «вы». */
export function SatCourseTab({ course, studentId }: { course: StudentCourse; studentId: string }) {
  useSatTheme(true);
  const today = isoDate(new Date());
  const [info, setInfo] = useState<StudentSatInfo | null>(null);
  const [schedule, setSchedule] = useState<LessonRow[]>([]);
  const [homework, setHomework] = useState<LessonRow[]>([]);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [comment, setComment] = useState<CommentRow | null>(null);
  const [official, setOfficial] = useState<OfficialResult[]>([]);
  const [rank, setRank] = useState<MockRank | null>(null);
  const [marks, setMarks] = useState<MyMark[]>([]);
  const [acked, setAcked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadStudentSatInfo(studentId),
      loadStudentUpcoming(today, addDays(today, 27)),
      loadResults().catch(() => null),
      loadComments(studentId).catch(() => [] as CommentRow[]),
      loadOfficial(studentId).catch(() => [] as OfficialResult[]),
      loadMockRank(studentId),
      loadMyMarks(studentId),
      loadHomeworkLessons(today),
    ]).then(([i, u, r, c, o, rk, mk, hw]) => {
      if (cancelled) return;
      setInfo(i);
      const sat = u.filter((l) => l.groups?.course_id === "sat");
      setSchedule(sat);
      void loadAcks(sat.filter((l) => l.kind === "office_hours").map((l) => l.id)).then((m) => {
        if (!cancelled) setAcked(new Set(Array.from(m.keys())));
      });
      setResults(r);
      setComment(c.find((x) => x.visibility === "family") ?? null);
      setOfficial(o);
      setRank(rk);
      setMarks(mk);
      setHomework(hw);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, today]);

  const left = course.sat_date ? daysBetween(today, course.sat_date) : null;
  const upcomingSat = left !== null && left >= 0;
  const week = courseWeek(info?.stream_starts_on ?? null, info?.weeks_total ?? null, today);
  const mocks = useMemo(() => (results ? studentMocks(studentId, results) : []), [results, studentId]);
  const practices = useMemo(() => (results ? studentPractices(studentId, results) : []), [results, studentId]);
  const achievements = useMemo(
    () =>
      results
        ? computeAchievements({ marks, mocks, official, practiceResults: results.practiceResults, practices: results.practices, studentId })
        : [],
    [results, marks, mocks, official, studentId],
  );

  const target = course.target_score;
  const points: Point[] = [
    ...mocks.map((m) => ({ key: m.mock.id, label: m.mock.title, date: m.mock.mock_date, verbal: m.result.verbal ?? 0, math: m.result.math ?? 0, total: m.result.total ?? 0, official: false })),
    ...official.map((o) => ({ key: o.id, label: "SAT", date: o.exam_date, verbal: o.verbal, math: o.math, total: o.total, official: true })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const last = points.at(-1) ?? null;
  const path = pathToTarget(points[0]?.total ?? null, last?.total ?? null, target);

  return (
    <div className="space-y-4">
      {/* Группа, неделя курса и время до экзамена — компактная карточка, не во всю ширину */}
      <section className="sp-glass flex w-full flex-wrap items-center gap-x-10 gap-y-3 rounded-3xl border px-5 py-4 sm:w-fit">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-navy">{course.group_name ?? "Группа назначается"}</p>
          <p className="text-xs text-muted">
            {course.stream_name ? `${course.stream_name} · ` : ""}учитель: <span className="text-navy">{course.teacher_name ?? "назначается"}</span>
            {course.curator_name ? (
              <>
                {" "}
                · куратор: <span className="text-navy">{course.curator_name}</span>
              </>
            ) : null}
          </p>
          {week ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              <span className="shrink-0">{week.week === 0 ? "Курс ещё не начался" : `Неделя ${week.week} из ${week.total}`}</span>
              <span className="h-1.5 w-40 rounded-full bg-navy/10">
                <span className="block h-1.5 rounded-full bg-gold" style={{ width: `${Math.round((100 * week.week) / week.total)}%` }} />
              </span>
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl bg-gold/[0.08] px-4 py-2 text-right">
          <p className="text-xs text-muted">До SAT</p>
          <p className="text-navy">
            <span className="text-2xl font-semibold text-gold">{upcomingSat ? left : "—"}</span>
            {upcomingSat ? <span className="ml-1 text-sm">дн.</span> : null}
          </p>
          <p className="text-xs text-muted">{course.sat_date ? fmt(course.sat_date) : "дата не назначена"}</p>
        </div>
      </section>

      {/* Домашка и расписание — главное, сверху */}
      <div className="grid items-start gap-3 lg:grid-cols-5">
        <Homework lessons={homework} marks={marks} />
        <Schedule
          lessons={schedule}
          today={today}
          acked={acked}
          onAck={async (id) => {
            await ackLesson(id);
            setAcked((prev) => new Set(prev).add(id));
          }}
        />
      </div>

      <MyTests />

      {/* Цель, место в группе, посещаемость */}
      <div className="grid gap-3 md:grid-cols-3">
        <section className="sp-glass rounded-3xl border px-6 py-5">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Целевой балл</p>
          <p className="mt-1 text-4xl font-light text-navy">{target ?? "—"}</p>
          {last ? (
            <>
              <p className="mt-1 text-sm text-muted">
                Сейчас {last.total} · {last.official ? "официальный SAT" : last.label}
              </p>
              {path !== null ? (
                <>
                  <div className="mt-2 h-2 rounded-full bg-navy/10">
                    <div className="h-2 rounded-full bg-burgundy" style={{ width: `${path}%` }} />
                  </div>
                  <p className={`mt-1 text-xs ${target && last.total >= target ? "text-emerald-300" : "text-muted"}`}>
                    {target && last.total < target ? `Осталось ${target - last.total} баллов` : "Цель достигнута"}
                  </p>
                </>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">{target ? "Результат появится после первого пробного экзамена." : "Цель поставит учитель."}</p>
          )}
        </section>
        <section className="sp-glass rounded-3xl border px-6 py-5">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Место в группе по моку</p>
          {rank ? (
            <>
              <p className="mt-1 text-4xl font-light text-navy">
                {rank.place}
                <span className="text-xl text-muted"> из {rank.total_students}</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                {rank.mock_title} · {fmtDay(rank.mock_date)}
              </p>
              <p className="mt-2 text-xs text-muted">Видите только вы. Чужих имён и баллов здесь нет.</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Появится после первого мока.</p>
          )}
        </section>
        <section className="sp-glass grid grid-cols-2 gap-3 rounded-3xl border px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Посещаемость</p>
            <p className="mt-1 text-4xl font-light text-navy">{info?.attendance_pct != null ? `${info.attendance_pct}%` : "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Домашки</p>
            <p className="mt-1 text-4xl font-light text-navy">{info?.homework_pct != null ? `${info.homework_pct}%` : "—"}</p>
          </div>
        </section>
      </div>

      {/* Динамика и что перерешать */}
      <div className="grid items-start gap-3 lg:grid-cols-5">
        <MockChart points={points} target={target} official={official} />
        <Redo practices={practices} results={results} />
      </div>

      <Achievements list={achievements} />

      <section className="rounded-3xl border border-gold/30 bg-gold/[0.06] px-6 py-5">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Комментарий учителя</p>
        {comment ? (
          <>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-navy">{comment.body}</p>
            <p className="mt-2 text-xs text-muted">
              {comment.author_name} · {new Date(comment.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Пока нет комментариев.</p>
        )}
      </section>

      <p className="text-xs text-muted">Здесь видны только ваши данные. Результаты других учеников и внутренние заметки учителей вам не показываются.</p>
    </div>
  );
}

// ---------- Динамика по мокам и официальному SAT ----------

interface Point {
  key: string;
  label: string;
  date: string;
  verbal: number;
  math: number;
  total: number;
  official: boolean;
}

function MockChart({
  points,
  target,
  official,
}: {
  points: Point[];
  target: number | null;
  official: OfficialResult[];
}) {
  const max = 1600;
  return (
    <section className="sp-glass rounded-3xl border px-6 py-6 lg:col-span-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg text-navy">Динамика: моки и официальный SAT</h3>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-3 w-3 rounded" style={{ background: VERBAL }} /> Verbal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-3 w-3 rounded" style={{ background: MATH }} /> Math
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-3 w-3 rounded border-2 border-gold" /> официальный SAT
            </span>
          </div>
        </div>
      </div>

      {points.length ? (
        <>
          <div className="relative mt-8 h-52">
            {target ? (
              <div className="absolute inset-x-0 z-10 border-t border-dashed border-burgundy" style={{ bottom: `${(target / max) * 100}%` }}>
                <span className="absolute -top-5 right-0 text-xs font-semibold text-burgundy">Цель {target}</span>
              </div>
            ) : null}
            <div className="absolute inset-0 flex items-end gap-3">
              {points.map((p) => (
                <div key={p.key} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${p.official ? "Официальный SAT" : p.label}: Verbal ${p.verbal}, Math ${p.math}`}>
                  <p className="mb-1 text-center text-sm font-semibold text-navy">{p.total}</p>
                  <div className={`overflow-hidden rounded-t-lg ${p.official ? "ring-2 ring-gold ring-offset-2" : ""}`} style={{ height: `${(p.total / max) * 100}%` }}>
                    <div className="flex items-center justify-center text-[11px] font-semibold text-white" style={{ height: `${(p.math / p.total) * 100}%`, background: MATH }}>
                      {p.math}
                    </div>
                    <div className="flex items-center justify-center text-[11px] font-semibold text-white" style={{ height: `${(p.verbal / p.total) * 100}%`, background: VERBAL }}>
                      {p.verbal}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-3">
            {points.map((p) => (
              <div key={p.key} className="min-w-0 flex-1 text-center">
                <p className={`truncate text-sm ${p.official ? "font-semibold text-gold" : "text-navy"}`}>{p.official ? "Официальный SAT" : p.label}</p>
                <p className="text-xs text-muted">{fmtDay(p.date)}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">Пробных экзаменов пока не было.</p>
      )}

      {official.length ? (
        <ul className="mt-4 space-y-1 text-xs text-muted">
          {official.map((o) => (
            <li key={o.id} className="flex items-center gap-2">
              Официальный SAT {fmtDay(o.exam_date)}: {o.total} (Verbal {o.verbal}, Math {o.math})
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-muted">Результаты моков и официального SAT вносит учитель.</p>
    </section>
  );
}

// ---------- Расписание ----------

function Schedule({
  lessons,
  today,
  acked,
  onAck,
}: {
  lessons: LessonRow[];
  today: string;
  acked: Set<string>;
  onAck: (lessonId: string) => Promise<void>;
}) {
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const week = lessons.filter((l) => l.lesson_date <= weekEnd);
  const shown = all ? lessons : week;
  const later = lessons.length - week.length;
  return (
    <section className="sp-glass rounded-3xl border px-5 py-5 lg:col-span-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg text-navy">Расписание</h3>
        <span className="text-xs text-muted">{all ? "4 недели" : "эта неделя"}</span>
      </div>
      <div className="mt-1 flex gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-gold" /> занятие
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" /> office hours
        </span>
      </div>
      {shown.length ? (
        <ul className="mt-3 space-y-2">
          {shown.map((l) => {
            const oh = l.kind === "office_hours";
            const cancelled = l.status === "cancelled";
            const personal = oh && Boolean(l.student_ids?.length);
            const read = acked.has(l.id);
            return (
              <li
                key={l.id}
                className={`flex gap-3 rounded-2xl border-l-4 px-3 py-2 ${oh ? "border-violet-500 bg-violet-500/[0.07]" : "border-gold bg-gold/[0.06]"} ${cancelled ? "opacity-50" : ""}`}
              >
                <span className="w-20 shrink-0 text-sm">
                  <span className={`block font-semibold ${oh ? "text-violet-700" : "text-gold"}`}>
                    {l.lesson_date === today ? "Сегодня" : l.lesson_date === tomorrow ? "Завтра" : fmtDay(l.lesson_date)}
                  </span>
                  <span className="block text-navy">
                    {hhmm(l.starts_at)}–{endTime(l.starts_at, l.duration_min)}
                  </span>
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className={`block text-navy ${cancelled ? "line-through" : ""}`}>
                    {oh ? `Office hours${l.title && l.title !== "Office hours" ? ` · ${l.title}` : ""}` : l.title || "Занятие"}
                  </span>
                  <span className="block text-xs text-muted">
                    {cancelled ? "отменено" : durationLabel(l.duration_min)}
                    {l.moved_from && !cancelled ? ` · перенесено с ${l.moved_from}` : ""}
                    {l.topic ? ` · ${l.topic}` : ""}
                    {personal && !cancelled ? " · лично для вас" : ""}
                  </span>
                  {oh && !cancelled ? (
                    read ? (
                      <span className="mt-1 inline-block text-xs text-emerald-600">✓ Прочитано</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === l.id}
                        onClick={async () => {
                          setBusy(l.id);
                          try {
                            await onAck(l.id);
                          } finally {
                            setBusy(null);
                          }
                        }}
                        className="mt-1.5 rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                      >
                        {busy === l.id ? "…" : "Прочитал(а)"}
                      </button>
                    )
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{all ? "На 4 недели вперёд занятий нет." : "На этой неделе занятий нет."}</p>
      )}
      {later > 0 || all ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-sm text-gold hover:underline">
          {all ? "Только эта неделя" : `Показать дальше (ещё ${later})`}
        </button>
      ) : null}
    </section>
  );
}

// ---------- Домашка ----------

function Homework({ lessons, marks }: { lessons: LessonRow[]; marks: MyMark[] }) {
  const [current, ...earlier] = lessons;
  const markOf = (id: string) => marks.find((m) => m.lesson_id === id);
  return (
    <section className="sp-glass rounded-3xl border px-6 py-6 lg:col-span-3">
      <h3 className="text-lg text-navy">Домашнее задание</h3>
      {current ? (
        <>
          <div className="mt-3 rounded-2xl border border-gold/40 bg-gold/[0.07] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gold">К следующему занятию</p>
            <p className="mt-0.5 text-xs text-muted">
              задано {fmtDay(current.lesson_date)}
              {current.title ? ` · ${current.title}` : ""}
              {current.topic ? ` · ${current.topic}` : ""}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-navy">
              <Linkified text={current.homework ?? ""} />
            </p>
          </div>
          {earlier.length ? (
            <ul className="mt-3 space-y-2">
              {earlier.slice(0, 4).map((l) => {
                const hw = markOf(l.id)?.homework ?? null;
                return (
                  <li key={l.id} className="text-sm">
                    <p className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span>
                        {fmtDay(l.lesson_date)}
                        {l.title ? ` · ${l.title}` : ""}
                      </span>
                      <span className={hw === "done" ? "text-emerald-300" : hw === "partial" ? "text-gold" : hw === "none" ? "text-burgundy" : ""}>
                        {hw ? HW_LABEL[hw] : "ещё не проверено"}
                      </span>
                    </p>
                    <p className="line-clamp-2 text-navy">
                      <Linkified text={l.homework ?? ""} />
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">Домашних заданий пока нет — учитель задаёт их на занятии.</p>
      )}
    </section>
  );
}

function Linkified({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="break-all text-gold underline">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

// ---------- Что перерешать: все темы, раскрываются ----------

function Redo({ practices, results }: { practices: TopicScore[]; results: ResultsData | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const weak = weakTopics(practices);
  const urlOf = (topicId: string | null) => (topicId ? (results?.topics.find((t) => t.id === topicId)?.practice_url ?? "") : "");

  return (
    <section className="sp-glass rounded-3xl border px-6 py-6 lg:col-span-2">
      <h3 className="text-lg text-navy">Что перерешать</h3>
      <p className="mt-1 text-sm text-muted">Все темы ваших практисов — от самой слабой. Нажмите на тему, чтобы увидеть историю.</p>
      {weak.length ? (
        <ul className="mt-3 space-y-2">
          {weak.map((w) => {
            const key = w.topicId ?? w.name;
            const isOpen = open === key;
            const history = practices.filter((p) => (p.topicId ?? p.name) === key);
            const url = urlOf(w.topicId);
            const tone = pctTone(w.pct);
            return (
              <li key={key} className={`rounded-2xl border ${TONE_CARD[tone]}`}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-navy">{w.name}</span>
                    <span className="block text-xs text-muted">
                      {w.section ? SECTION_LABELS[w.section] : "Практис"} ·{" "}
                      {w.pct < 50 ? "приоритет: перерешать на этой неделе" : w.pct < 80 ? "повторить в течение 2 недель" : "можно не трогать"}
                    </span>
                  </span>
                  <span className="h-1.5 w-20 rounded-full bg-navy/10">
                    <span className={`block h-1.5 rounded-full ${TONE_BAR[tone]}`} style={{ width: `${w.pct}%` }} />
                  </span>
                  <span className="w-11 text-right text-sm font-semibold text-navy">{w.pct}%</span>
                  <span aria-hidden className={`text-[10px] text-muted ${isOpen ? "rotate-180" : ""}`}>
                    ▼
                  </span>
                </button>
                {isOpen ? (
                  <div className="border-t border-navy/10 px-4 py-3">
                    <ul className="space-y-1 text-sm">
                      {history.map((h) => (
                        <li key={h.practiceId} className="flex justify-between gap-3 text-navy">
                          <span>
                            {fmtDay(h.date)}
                            {h.attempts > 1 ? <span className="text-muted"> · попыток: {h.attempts}</span> : null}
                          </span>
                          <span className="font-semibold">{h.pct}%</span>
                        </li>
                      ))}
                    </ul>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex rounded-full bg-gold px-4 py-2 text-sm font-semibold text-gold-ink hover:opacity-90"
                      >
                        Практис по теме →
                      </a>
                    ) : (
                      <p className="mt-3 text-xs text-muted">Материалы для практиса по этой теме учитель добавит позже.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Появится после первых практисов.</p>
      )}
    </section>
  );
}

// ---------- Ачивки ----------

const GROUP_LABELS: Record<Achievement["group"], string> = {
  streak: "Серии",
  mocks: "Моки",
  practice: "Практисы",
  month: "Месяц",
};

function Achievements({ list }: { list: Achievement[] }) {
  if (!list.length) return null;
  const earned = list.filter((a) => a.earned).length;
  return (
    <section className="sp-glass rounded-3xl border px-6 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg text-navy">Ачивки</h3>
        <span className="text-sm text-muted">
          получено <span className="font-semibold text-gold">{earned}</span>
        </span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(GROUP_LABELS) as Achievement["group"][]).map((g) => (
          <div key={g}>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">{GROUP_LABELS[g]}</p>
            <ul className="mt-2 space-y-2">
              {list
                .filter((a) => a.group === g)
                .map((a) => (
                  <li
                    key={a.id}
                    title={a.hint}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2 ${a.earned ? "border-gold/40 bg-gold/[0.08]" : "border-navy/10 opacity-60"}`}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg ${a.earned ? "bg-gold/20" : "bg-navy/5 grayscale"}`} aria-hidden>
                      {a.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-navy">{a.title}</span>
                      <span className="block text-xs text-muted">
                        {a.earned ? "получено" : a.progress ? `${Math.min(a.progress.value, a.progress.goal)} / ${a.progress.goal}` : a.hint}
                      </span>
                      <span className="sr-only">{a.earned ? "получено" : "ещё не получено"}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
