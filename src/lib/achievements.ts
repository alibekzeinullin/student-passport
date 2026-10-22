import type { StudentProfile } from "@/lib/types";
import type { Deadline } from "@/lib/deadlines";
import { homeworkRating, type Attendance, type Meeting } from "@/lib/meetings";
import { essayScore, type EssaySubmission } from "@/lib/essays";
import { gpaScaleMax, type TermGrade } from "@/lib/term-grades";

/** Серия: сколько последних встреч подряд ученик пришёл (опоздание не рвёт серию). */
export function attendanceStreak(meetings: Meeting[]): number {
  const marked = [...meetings]
    .filter((m) => m.attendance !== null)
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));
  let streak = 0;
  for (const m of marked) {
    if (m.attendance === "absent") break;
    streak += 1;
  }
  return streak;
}

/** Последние N отметок посещения, от старых к новым (для полоски квадратиков). */
export function recentAttendance(meetings: Meeting[], count = 10): Attendance[] {
  return [...meetings]
    .filter((m) => m.attendance !== null)
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
    .slice(0, count)
    .map((m) => m.attendance as Attendance)
    .reverse();
}

export type BadgeGroup = "meetings" | "essays" | "grades" | "competitions" | "profile" | "exams";

export const BADGE_GROUP_LABELS: Record<BadgeGroup, string> = {
  meetings: "Встречи",
  essays: "Эссе",
  grades: "Учёба",
  competitions: "Олимпиады и конкурсы",
  profile: "Паспорт и развитие",
  exams: "Экзамены",
};

export interface Badge {
  id: string;
  title: string;
  hint: string;
  earned: boolean;
  icon: "flame" | "star" | "book" | "trophy" | "target" | "rocket" | "spark" | "check" | "pen" | "chart" | "medal" | "crown";
  group: BadgeGroup;
  /** Прогресс до значка (для «следующих» целей) */
  progress?: { value: number; goal: number };
  /** Редкий значок — особая подсветка */
  rare?: boolean;
}

export interface BadgeExtras {
  essays?: EssaySubmission[] | null;
  grades?: TermGrade[] | null;
}

const ESSAY_TIERS = [
  { goal: 10, title: "10 эссе", icon: "pen" as const },
  { goal: 25, title: "25 эссе", icon: "pen" as const },
  { goal: 50, title: "Полсотни", icon: "star" as const },
  { goal: 100, title: "Сотня", icon: "crown" as const, rare: true },
];

/** Сколько последних принятых эссе подряд получили 9+ (по дате проверки). */
function essayAceStreak(essays: EssaySubmission[]): number {
  const accepted = essays
    .filter((e) => e.status === "accepted" && e.reviewedAt)
    .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""));
  let n = 0;
  for (const e of accepted) {
    if ((essayScore(e) ?? 0) < 9) break;
    n += 1;
  }
  return n;
}

/** Хотя бы один завершённый месяц: были и индивидуальные, и групповые, и ни одного пропуска. */
function hasFullMonth(meetings: Meeting[], today = new Date()): boolean {
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const byMonth = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const key = m.meetingDate.slice(0, 7);
    if (key >= current) continue;
    byMonth.set(key, [...(byMonth.get(key) ?? []), m]);
  }
  for (const list of byMonth.values()) {
    const marked = list.filter((m) => m.attendance !== null);
    if (
      marked.some((m) => m.format === "individual") &&
      marked.some((m) => m.format === "group") &&
      marked.every((m) => m.attendance !== "absent")
    ) {
      return true;
    }
  }
  return false;
}

export function computeBadges(
  student: StudentProfile,
  meetings: Meeting[],
  deadlines: Deadline[],
  extras: BadgeExtras = {},
): Badge[] {
  const attended = meetings.filter(
    (m) => m.attendance === "present" || m.attendance === "late",
  ).length;
  const streak = attendanceStreak(meetings);
  const lastFour = [...meetings]
    .filter((m) => m.attendance !== null)
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
    .slice(0, 4);
  const onTime = lastFour.filter((m) => m.attendance === "present").length;
  const noLateMonth = lastFour.length === 4 && onTime === 4;
  const ratings = [...meetings]
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
    .map(homeworkRating)
    .filter((v): v is number => v !== null);
  let hwStreak = 0;
  for (const r of ratings) {
    if (r < 9) break;
    hwStreak += 1;
  }
  const booksRead = student.books.filter((b) => b.status === "Прочитано").length;
  const skillsDone = student.skills.filter((s) => s.status === "Освоен").length;
  const submitted = deadlines.filter((d) => d.status === "submitted");
  const competitions =
    submitted.filter((d) =>
      ["olympiad", "contest", "hackathon"].includes(d.category),
    ).length +
    student.academicActivities.filter((a) =>
      a.status === "Подана" || a.status === "В процессе" || a.status === "Завершено",
    ).length;
  const projectDone = student.projects.some((p) => p.status === "Завершён");

  // Олимпиады: результаты отмечает ментор
  const advanced = deadlines.some((d) => d.result === "advanced" || d.result === "prize");
  const prize = deadlines.some((d) => d.result === "prize");
  const categories = new Set(
    submitted.map((d) => d.category).filter((c) => !["task", "other"].includes(c)),
  ).size;

  // Паспорт заполнен: фото, проект, книга, навык в работе
  const passportParts = [
    Boolean(student.avatarUrl),
    student.projects.some((p) => p.title.trim()),
    student.books.some((b) => b.status === "Читаю" || b.status === "Прочитано"),
    student.skills.some((sk) => sk.status !== "К освоению"),
  ].filter(Boolean).length;

  // Эссе
  const essays = extras.essays ?? [];
  const essaysAccepted = new Set(essays.filter((e) => e.status === "accepted").map((e) => e.topicId)).size;
  const ace = essayAceStreak(essays);

  // GPA (только подтверждённые ментором)
  const scale = gpaScaleMax(student.educationSystem);
  const gpas = (extras.grades ?? [])
    .filter((g) => g.gpa !== null && g.verified)
    .map((g) => g.gpa as number);
  const ups = gpas.slice(1).map((g, i) => g > gpas[i]);
  let upRun = 0; // текущая серия роста
  let maxRun = 0; // лучшая серия за всё время (значок не пропадает)
  for (const up of ups) {
    upRun = up ? upRun + 1 : 0;
    maxRun = Math.max(maxRun, upRun);
  }
  const strongThreshold = scale * 0.9;
  const strongTwo = gpas.some((g, i) => i > 0 && g >= strongThreshold && gpas[i - 1] >= strongThreshold);

  const p = (value: number, goal: number) => ({ value: Math.min(value, goal), goal });

  const badges: Badge[] = [
    { id: "first", group: "meetings", title: "Первая встреча", hint: "Прийти на первую встречу", earned: attended >= 1, icon: "spark" },
    { id: "streak4", group: "meetings", title: "4 встречи подряд", hint: "4 встречи без пропусков", earned: streak >= 4, icon: "flame", progress: p(streak, 4) },
    { id: "streak10", group: "meetings", title: "10 встреч подряд", hint: "10 встреч без пропусков", earned: streak >= 10, icon: "flame", progress: p(streak, 10) },
    { id: "punctual", group: "meetings", title: "Месяц без опозданий", hint: "4 встречи подряд вовремя", earned: noLateMonth, icon: "check" },
    { id: "fullMonth", group: "meetings", title: "Полный месяц", hint: "Месяц без пропусков: все индивидуальные и групповые встречи", earned: hasFullMonth(meetings), icon: "check" },
    { id: "homework", group: "meetings", title: "Домашка на 9+", hint: "3 домашки подряд на 9 и выше", earned: hwStreak >= 3, icon: "star", progress: p(hwStreak, 3) },

    ...ESSAY_TIERS.map((t) => ({
      id: `essays${t.goal}`,
      group: "essays" as const,
      title: t.title,
      hint: `Сдать ${t.goal} эссе из 100 тем`,
      earned: essaysAccepted >= t.goal,
      icon: t.icon,
      progress: p(essaysAccepted, t.goal),
      rare: t.rare,
    })),
    { id: "essayAce", group: "essays", title: "Отличник эссе", hint: "3 эссе подряд на 9 и выше", earned: ace >= 3, icon: "medal", progress: p(ace, 3) },

    { id: "gpaUp", group: "grades", title: "Рост", hint: "GPA вырос по сравнению с прошлой четвертью", earned: maxRun >= 1, icon: "chart" },
    { id: "gpaClimb", group: "grades", title: "В гору", hint: "GPA растёт 3 четверти подряд", earned: maxRun >= 2, icon: "chart", progress: p(upRun + 1, 3) },
    { id: "gpaStrong", group: "grades", title: "Стабильно сильный", hint: `GPA ${strongThreshold.toFixed(1)}+ две четверти подряд`, earned: strongTwo, icon: "medal" },

    { id: "firstApp", group: "competitions", title: "Первая заявка", hint: "Подать заявку на олимпиаду или конкурс", earned: competitions >= 1, icon: "target" },
    { id: "olymp3", group: "competitions", title: "Олимпиадник", hint: "Участвовать в 3 олимпиадах или конкурсах", earned: competitions >= 3, icon: "trophy", progress: p(competitions, 3) },
    { id: "diverse", group: "competitions", title: "Разносторонний", hint: "Заявки в 3 разных категориях: олимпиада, конкурс, хакатон…", earned: categories >= 3, icon: "spark", progress: p(categories, 3) },
    { id: "nextStage", group: "competitions", title: "Следующий этап", hint: "Пройти на следующий этап олимпиады или конкурса", earned: advanced, icon: "rocket" },
    { id: "prize", group: "competitions", title: "Призёр", hint: "Стать призёром или победителем", earned: prize, icon: "crown", rare: true },

    { id: "passport", group: "profile", title: "Паспорт заполнен", hint: "Фото, проект, книга и навык в работе", earned: passportParts === 4, icon: "check", progress: p(passportParts, 4) },
    { id: "books5", group: "profile", title: "Книжный червь", hint: "Прочитать 5 книг", earned: booksRead >= 5, icon: "book", progress: p(booksRead, 5) },
    { id: "skills3", group: "profile", title: "Прокачка", hint: "Освоить 3 навыка", earned: skillsDone >= 3, icon: "rocket", progress: p(skillsDone, 3) },
    { id: "project", group: "profile", title: "Проект запущен", hint: "Завершить свой проект", earned: projectDone, icon: "rocket" },
  ];

  // Экзамены — только если ученик уже внёс результат
  if (student.testScores.ielts !== null && student.testScores.ielts !== undefined) {
    badges.push({ id: "ielts7", group: "exams", title: "IELTS 7+", hint: "Сдать IELTS на 7 и выше", earned: student.testScores.ielts >= 7, icon: "trophy" });
  }
  if (student.testScores.sat !== null && student.testScores.sat !== undefined) {
    badges.push({ id: "sat1400", group: "exams", title: "SAT 1400+", hint: "Сдать SAT на 1400 и выше", earned: student.testScores.sat >= 1400, icon: "trophy" });
  }
  return badges;
}

/**
 * Что показать в карточке: полученные (новые/редкие первыми) и 3 ближайшие цели с прогрессом.
 * Из ступенчатых (эссе 10/25/50/100) — только высшую полученную и следующую.
 */
export function pickShowcase(badges: Badge[], earnedLimit = 6, nextLimit = 3): { earned: Badge[]; next: Badge[] } {
  const tiers = badges.filter((b) => /^essays\d+$/.test(b.id));
  const topTier = [...tiers].reverse().find((b) => b.earned);
  const nextTier = tiers.find((b) => !b.earned);
  const hiddenTier = (b: Badge) => /^essays\d+$/.test(b.id) && b !== topTier && b !== nextTier;
  const streakHidden = (b: Badge) => b.id === "streak4" && badges.find((x) => x.id === "streak10")?.earned;

  const earned = badges
    .filter((b) => b.earned && !hiddenTier(b) && !streakHidden(b))
    .sort((a, b) => Number(Boolean(b.rare)) - Number(Boolean(a.rare)))
    .slice(0, earnedLimit);
  const next = badges
    .filter((b) => !b.earned && !hiddenTier(b))
    .map((b) => ({ b, ratio: b.progress ? b.progress.value / b.progress.goal : 0 }))
    .filter((x) => x.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, nextLimit)
    .map((x) => x.b);
  return { earned, next };
}
