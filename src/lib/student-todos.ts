import type { StudentProfile } from "@/lib/types";
import type { Deadline } from "@/lib/deadlines";
import { daysLeft, formatDaysLeft, formatDueDate } from "@/lib/deadlines";
import type { Meeting } from "@/lib/meetings";
import type { EssaySubmission } from "@/lib/essays";
import type { StudentWork } from "@/lib/works";

export type TodoSeverity = "high" | "medium" | "low";

export interface StudentTodo {
  key: string;
  severity: TodoSeverity;
  text: string;
  /** Якорь на странице (#sec-…) или ссылка */
  href: string;
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/** «Сентябрь–октябрь 2026» → { months: [8, 9], year: 2026 } */
function parseSprintLabel(label: string): { months: number[]; year: number } | null {
  const l = label.toLowerCase();
  const months = MONTHS.map((m, i) => (l.includes(m) ? i : -1)).filter((i) => i >= 0);
  const year = Number(l.match(/20\d\d/)?.[0]);
  if (!months.length || !year) return null;
  return { months, year };
}

export function buildStudentTodos(
  student: StudentProfile,
  deadlines: Deadline[],
  meetings: Meeting[],
  today = new Date(),
  essays: EssaySubmission[] | null = null,
  works: StudentWork[] | null = null,
): StudentTodo[] {
  const todos: StudentTodo[] = [];
  const push = (key: string, severity: TodoSeverity, text: string, href: string) =>
    todos.push({ key, severity, text, href });

  // Дедлайны
  for (const d of deadlines) {
    if (d.status !== "planned") continue;
    const left = daysLeft(d.dueDate);
    if (left < 0) push(`over-${d.id}`, "high", `Дедлайн прошёл: ${d.title} — отметь, подал ли ты заявку`, "#sec-deadlines");
    else if (left <= 3) push(`hot-${d.id}`, "high", `${left === 0 ? "Сегодня" : `Через ${formatDaysLeft(left)}`} дедлайн: ${d.title}`, "#sec-deadlines");
    else if (left <= 7) push(`soon-${d.id}`, "medium", `Через ${formatDaysLeft(left)}: ${d.title} (${formatDueDate(d.dueDate)})`, "#sec-deadlines");
  }

  // Домашка с последней индивидуальной встречи
  const lastInd = [...meetings]
    .filter((m) => m.format === "individual")
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))[0];
  if (lastInd?.homework.trim()) {
    push("homework", "medium", `Домашка к следующей встрече: ${lastInd.homework.trim().split("\n")[0]}`, "#sec-journal");
  }

  // Эссе: последняя версия по каждой теме
  if (essays) {
    const latest = new Map<string, EssaySubmission>();
    for (const e of essays) {
      const cur = latest.get(e.topicId);
      if (!cur || e.version > cur.version) latest.set(e.topicId, e);
    }
    const accepted = new Set(essays.filter((e) => e.status === "accepted").map((e) => e.topicId));
    const revision = [...latest.values()].filter((e) => e.status === "revision" && !accepted.has(e.topicId));
    const drafts = [...latest.values()].filter((e) => e.status === "draft");
    if (revision.length) {
      push("essay-rev", "medium", `Эссе вернули на доработку (${revision.length}) — посмотри комментарий ментора`, "/dashboard/essays");
    }
    if (drafts.length) {
      push("essay-draft", "low", `Есть недописанный черновик эссе (${drafts.length}) — допиши и сдай`, "/dashboard/essays");
    }
    if (essays.length === 0) {
      push("essay-start", "low", "Напиши первое эссе из 100 тем", "/dashboard/essays");
    }
  }

  // Проекты и исследования: просроченный или близкий этап
  for (const w of works ?? []) {
    if (w.status === "done" || w.status === "paused") continue;
    const cur = w.stages.find((st) => !st.done);
    if (!cur?.due) continue;
    const left = daysLeft(cur.due);
    if (left < 0) push(`work-${w.id}`, "high", `«${w.title}»: срок этапа «${cur.title}» прошёл`, "/dashboard/works");
    else if (left <= 7) push(`work-${w.id}`, "medium", `«${w.title}»: этап «${cur.title}» — до ${formatDueDate(cur.due)}`, "/dashboard/works");
  }

  // Спринты
  const month = today.getMonth();
  const year = today.getFullYear();
  for (const t of student.sprintTasks) {
    const p = parseSprintLabel(t.sprintLabel);
    if (!p) continue;
    const last = Math.max(...p.months);
    const isPast = p.year < year || (p.year === year && last < month);
    if (isPast && !t.completed) {
      push(`sp-over-${t.id}`, "high", `Спринт «${t.title}» (${t.sprintLabel}) не сдан`, "#sec-sprints");
    }
    // Текущий спринт не выносим в «Что нужно сделать»: ссылка на работу — по желанию
  }

  // Незаполненные разделы
  if (!student.avatarUrl) push("avatar", "low", "Добавь фото в профиль", "#sec-profile");
  if (deadlines.filter((d) => d.status === "planned" && daysLeft(d.dueDate) >= 0).length === 0) {
    push("no-deadlines", "low", "Выбери олимпиаду или конкурс в ленте возможностей", "/opportunities");
  }
  if (student.academicActivities.length === 0) {
    push("activities", "low", "Заполни «Академ активность»: олимпиады, конкурсы, награды", "#sec-academic");
  }
  if (student.projects.length === 0) push("projects", "low", "Начни проект или исследование", "/dashboard/works");
  if (!student.books.some((b) => b.status === "Читаю" || b.status === "Прочитано")) {
    push("books", "low", "Выбери книгу из рекомендаций и отметь «Читаю»", "#sec-books");
  }
  if (student.skills.length > 0 && student.skills.every((s) => s.status === "К освоению")) {
    push("skills", "low", "Отметь, какие навыки ты уже начал прокачивать", "#sec-skills");
  }

  const order: Record<TodoSeverity, number> = { high: 0, medium: 1, low: 2 };
  return todos.sort((a, b) => order[a.severity] - order[b.severity]);
}
