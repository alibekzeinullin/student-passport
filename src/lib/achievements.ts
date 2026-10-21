import type { StudentProfile } from "@/lib/types";
import type { Deadline } from "@/lib/deadlines";
import { homeworkRating, type Attendance, type Meeting } from "@/lib/meetings";

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

export interface Badge {
  id: string;
  title: string;
  hint: string;
  earned: boolean;
  icon: "flame" | "star" | "book" | "trophy" | "target" | "rocket" | "spark" | "check";
}

export function computeBadges(
  student: StudentProfile,
  meetings: Meeting[],
  deadlines: Deadline[],
): Badge[] {
  const attended = meetings.filter(
    (m) => m.attendance === "present" || m.attendance === "late",
  ).length;
  const streak = attendanceStreak(meetings);
  const lastFour = [...meetings]
    .filter((m) => m.attendance !== null)
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
    .slice(0, 4);
  const noLateMonth =
    lastFour.length === 4 && lastFour.every((m) => m.attendance === "present");
  const ratings = [...meetings]
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
    .map(homeworkRating)
    .filter((v): v is number => v !== null)
    .slice(0, 3);
  const strongHomework =
    ratings.length === 3 && ratings.every((r) => r >= 9);
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

  return [
    { id: "first", title: "Первая встреча", hint: "Прийти на первую встречу", earned: attended >= 1, icon: "spark" },
    { id: "streak4", title: "4 встречи подряд", hint: "4 встречи без пропусков", earned: streak >= 4, icon: "flame" },
    { id: "streak10", title: "10 встреч подряд", hint: "10 встреч без пропусков", earned: streak >= 10, icon: "flame" },
    { id: "punctual", title: "Месяц без опозданий", hint: "4 встречи подряд вовремя", earned: noLateMonth, icon: "check" },
    { id: "homework", title: "Домашка на 9+", hint: "3 домашки подряд на 9 и выше", earned: strongHomework, icon: "star" },
    { id: "firstApp", title: "Первая заявка", hint: "Подать заявку на олимпиаду или конкурс", earned: competitions >= 1, icon: "target" },
    { id: "olymp3", title: "Олимпиадник", hint: "Участвовать в 3 олимпиадах или конкурсах", earned: competitions >= 3, icon: "trophy" },
    { id: "books5", title: "Книжный червь", hint: "Прочитать 5 книг", earned: booksRead >= 5, icon: "book" },
    { id: "skills3", title: "Прокачка", hint: "Освоить 3 навыка", earned: skillsDone >= 3, icon: "rocket" },
    { id: "project", title: "Проект запущен", hint: "Завершить свой проект", earned: projectDone, icon: "rocket" },
    { id: "ielts7", title: "IELTS 7+", hint: "Сдать IELTS на 7 и выше", earned: (student.testScores.ielts ?? 0) >= 7, icon: "trophy" },
    { id: "sat1400", title: "SAT 1400+", hint: "Сдать SAT на 1400 и выше", earned: (student.testScores.sat ?? 0) >= 1400, icon: "trophy" },
  ];
}
