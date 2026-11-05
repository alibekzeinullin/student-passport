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

export function buildStudentTodos(
  student: StudentProfile,
  deadlines: Deadline[],
  meetings: Meeting[],
  _today = new Date(),
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

  // Незаполненные разделы
  if (!student.avatarUrl) push("avatar", "low", "Добавь фото в профиль", "#sec-profile");
  if (deadlines.filter((d) => d.status === "planned" && daysLeft(d.dueDate) >= 0).length === 0) {
    push("no-deadlines", "low", "Выбери олимпиаду или конкурс в ленте возможностей", "/opportunities");
  }
  // Профиль: цели на год, внеклассная активность и достижения, проекты и портфолио
  const vm = student.visionMap;
  const goals = [...(vm?.futureAcademicGoals ?? []), ...(vm?.futureOtherGoals ?? [])].filter((g) => g.text?.trim());
  if (goals.length === 0) {
    push("goals", "medium", "Нет целей на год — впиши хотя бы 3 цели в Vision Map (учёба и не только)", "/dashboard/vision");
  } else if (goals.length < 3) {
    push("goals", "low", `Целей на год пока ${goals.length} — добавь ещё, чтобы было хотя бы 3`, "/dashboard/vision");
  }
  if (student.academicActivities.length === 0) {
    push("activities", "medium", "Нет внеклассной активности и достижений — добавь олимпиады, конкурсы, кружки, спорт, награды", "#sec-academic");
  }
  if (student.projects.length === 0) {
    push("projects", "medium", "Нет проектов и портфолио — добавь свой проект или исследование", "/dashboard/works");
  } else if (works && works.length > 0 && works.every((w) => w.links.length === 0)) {
    push("portfolio", "low", "Добавь в проект ссылку на результат (фото, презентация, Drive) — это твоё портфолио", "/dashboard/works");
  }
  if (!student.books.some((b) => b.status === "Читаю" || b.status === "Прочитано")) {
    push("books", "low", "Выбери книгу из рекомендаций и отметь «Читаю»", "#sec-books");
  }
  if (student.skills.length > 0 && student.skills.every((s) => s.status === "К освоению")) {
    push("skills", "low", "Отметь, какие навыки ты уже начал прокачивать", "#sec-skills");
  }

  const order: Record<TodoSeverity, number> = { high: 0, medium: 1, low: 2 };
  return todos.sort((a, b) => order[a.severity] - order[b.severity]);
}
