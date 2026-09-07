import type { StudentProfile } from "./types";
import { calculateAcademicSuccessScore } from "./academic-score";
import type { ReportType } from "./report-types";
import { REPORT_LABELS } from "./report-types";
import {
  SOFT_SKILL_STAGE_LABELS,
  calculateYearlyProgress,
  getCurrentGpa,
  normalizeVisionMap,
} from "./vision-map";

const NAVY: [number, number, number] = [35, 51, 74];
const BURGUNDY: [number, number, number] = [127, 34, 49];
const GOLD: [number, number, number] = [203, 176, 115];
const MUTED: [number, number, number] = [92, 102, 117];
const LINE: [number, number, number] = [209, 209, 209];
const TEXT: [number, number, number] = [35, 51, 74];

const MARGIN = 18;
const PAGE_BOTTOM = 280;
const FONT = "NotoSans";

type JsPdf = import("jspdf").jsPDF;

let fontCache: { regular: string; bold: string } | null = null;

function formatGpa(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFonts(doc: JsPdf) {
  if (!fontCache) {
    const [regularRes, boldRes] = await Promise.all([
      fetch("/fonts/NotoSans-Regular.ttf"),
      fetch("/fonts/NotoSans-Bold.ttf"),
    ]);
    if (!regularRes.ok || !boldRes.ok) {
      throw new Error("Не удалось загрузить шрифты для PDF");
    }
    const [regular, bold] = await Promise.all([
      arrayBufferToBase64(await regularRes.arrayBuffer()),
      arrayBufferToBase64(await boldRes.arrayBuffer()),
    ]);
    fontCache = { regular, bold };
  }

  doc.addFileToVFS("NotoSans-Regular.ttf", fontCache.regular);
  doc.addFileToVFS("NotoSans-Bold.ttf", fontCache.bold);
  doc.addFont("NotoSans-Regular.ttf", FONT, "normal");
  doc.addFont("NotoSans-Bold.ttf", FONT, "bold");
  doc.setFont(FONT, "normal");
}

function ensureSpace(doc: JsPdf, y: number, needed: number): number {
  if (y + needed <= PAGE_BOTTOM) return y;
  doc.addPage();
  return 24;
}

function drawHeader(doc: JsPdf, pageWidth: number, reportType: ReportType) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setFillColor(...BURGUNDY);
  doc.rect(0, 26, pageWidth, 1.5, "F");

  doc.setFont(FONT, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GOLD);
  doc.text("TODAY EDUCATION", MARGIN, 10);

  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("Digital Passport TODAY Scholars", MARGIN, 17);

  doc.setFont(FONT, "normal");
  doc.setFontSize(9);
  doc.text(REPORT_LABELS[reportType], MARGIN, 23);
}

function drawFooter(doc: JsPdf) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont(FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `Сформировано системой «Digital Passport TODAY Scholars»  |  стр. ${i} из ${pageCount}`,
      MARGIN,
      290,
    );
  }
}

function drawSectionTitle(doc: JsPdf, title: string, y: number): number {
  y = ensureSpace(doc, y, 12);
  doc.setFont(FONT, "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BURGUNDY);
  doc.text(title, MARGIN, y);
  return y + 8;
}

function drawKeyValueRow(
  doc: JsPdf,
  label: string,
  value: string,
  y: number,
  valueX: number,
): number {
  y = ensureSpace(doc, y, 7);
  doc.setFont(FONT, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT);
  doc.text(label, MARGIN, y);
  doc.text(value, valueX, y);
  return y + 6.5;
}

function drawWrappedText(
  doc: JsPdf,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    y = ensureSpace(doc, y, lineHeight + 1);
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

export async function downloadStudentPdf(
  student: StudentProfile,
  reportType: ReportType = "profile",
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  const valueCol = MARGIN + 58;

  await loadFonts(doc);
  drawHeader(doc, pageWidth, reportType);

  let y = 38;

  doc.setFont(FONT, "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  y = drawWrappedText(
    doc,
    `${student.lastName} ${student.firstName}`,
    MARGIN,
    y,
    contentWidth,
    7,
  );

  y += 2;
  doc.setFont(FONT, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  y = drawWrappedText(
    doc,
    `Класс: ${student.className}`,
    MARGIN,
    y,
    contentWidth,
  );
  y = drawWrappedText(doc, `Школа: ${student.school}`, MARGIN, y, contentWidth);
  y = drawWrappedText(
    doc,
    `Образовательная система: ${student.educationSystem}`,
    MARGIN,
    y,
    contentWidth,
  );

  if (reportType === "monthly") {
    y = drawMonthlyProgressPdf(doc, student, y, contentWidth, valueCol);
    drawFooter(doc);
    const safeLast = student.lastName.replace(/\s+/g, "-");
    const safeFirst = student.firstName.replace(/\s+/g, "-");
    doc.save(`passport-${reportType}-${safeLast}-${safeFirst}.pdf`);
    return;
  }

  if (reportType === "vision") {
    y = drawVisionMapPdf(doc, student, y, contentWidth);
    drawFooter(doc);
    const safeLast = student.lastName.replace(/\s+/g, "-");
    const safeFirst = student.firstName.replace(/\s+/g, "-");
    doc.save(`passport-${reportType}-${safeLast}-${safeFirst}.pdf`);
    return;
  }

  y += 4;
  doc.setFont(FONT, "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  y = ensureSpace(doc, y, 8);
  doc.text("Индикаторы прогресса", MARGIN, y);
  y += 6;
  const academicScore = calculateAcademicSuccessScore(student);
  y = drawKeyValueRow(
    doc,
    "Посещаемость",
    `${student.attendanceScore}/100`,
    y,
    valueCol,
  );
  y = drawKeyValueRow(
    doc,
    "Выполнение заданий",
    `${student.assignmentsScore}/100`,
    y,
    valueCol,
  );
  y = drawKeyValueRow(
    doc,
    "Академ успехи",
    `${academicScore}/100`,
    y,
    valueCol,
  );

  if (student.mentorNote?.trim()) {
    y += 3;
    doc.setFont(FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    y = ensureSpace(doc, y, 8);
    doc.text("Обратная связь от ментора", MARGIN, y);
    y += 5;
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    y = drawWrappedText(doc, student.mentorNote, MARGIN, y, contentWidth);
  }

  y += 3;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 10;

  y = drawSectionTitle(doc, "1. Академическая динамика", y);
  y = drawAcademicPdf(doc, student, y, contentWidth, valueCol);

  y += 4;
  y = drawSectionTitle(doc, "2. Спринты по групповой работе", y);
  y = drawSprintsPdf(doc, student, y, contentWidth);

  y += 4;
  y = drawSectionTitle(doc, "3. Внеучебная деятельность", y);
  y = drawProjectsPdf(doc, student, y, contentWidth);

  y += 4;
  y = drawSectionTitle(doc, "4. Книги к прочтению", y);
  y = drawBooksPdf(doc, student, y, contentWidth);

  y += 4;
  y = drawSectionTitle(doc, "5. Навыки к освоению", y);
  y = drawSkillsPdf(doc, student, y, contentWidth);

  y += 4;
  y = drawSectionTitle(doc, "6. Зоны роста", y);
  y = drawGrowthZonesPdf(doc, student, y, contentWidth);

  drawFooter(doc);

  const safeLast = student.lastName.replace(/\s+/g, "-");
  const safeFirst = student.firstName.replace(/\s+/g, "-");
  doc.save(`passport-${reportType}-${safeLast}-${safeFirst}.pdf`);
}

function drawLabeledBlock(
  doc: JsPdf,
  label: string,
  value: string,
  y: number,
  contentWidth: number,
): number {
  y = ensureSpace(doc, y, 10);
  doc.setFont(FONT, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(label, MARGIN, y);
  y += 4;
  doc.setFont(FONT, "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT);
  return drawWrappedText(doc, value.trim() || "—", MARGIN, y, contentWidth);
}

function drawMonthlyProgressPdf(
  doc: JsPdf,
  student: StudentProfile,
  y: number,
  contentWidth: number,
  valueCol: number,
): number {
  const review = student.monthlyProgressReviews?.[0];
  if (!review) {
    y += 6;
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    return drawWrappedText(
      doc,
      "Monthly Progress Review ещё не заполнен.",
      MARGIN,
      y,
      contentWidth,
    );
  }

  y += 4;
  y = drawSectionTitle(doc, `1. ${review.monthYear || "Основная информация"}`, y);
  y = drawKeyValueRow(
    doc,
    "Индивидуальные",
    review.individualSessionsAttended === null
      ? "—"
      : `${review.individualSessionsAttended} из 2`,
    y,
    valueCol,
  );
  y = drawKeyValueRow(
    doc,
    "Групповые",
    review.groupSessionsAttended === null
      ? "—"
      : `${review.groupSessionsAttended} из 2`,
    y,
    valueCol,
  );
  y = drawKeyValueRow(
    doc,
    "Homework",
    `${review.homeworkCompletion}%`,
    y,
    valueCol,
  );

  y += 3;
  y = drawSectionTitle(doc, "2. Личное развитие", y);
  y = drawLabeledBlock(doc, "Фокус месяца", review.personalFocus, y, contentWidth);
  y = drawLabeledBlock(
    doc,
    "Прогресс и заметки",
    review.personalProgressNotes,
    y,
    contentWidth,
  );

  y += 3;
  y = drawSectionTitle(doc, "3. Академический фокус", y);
  y = drawLabeledBlock(doc, "Статус уроков", review.academicStatus, y, contentWidth);
  y = drawLabeledBlock(
    doc,
    "Проблемные предметы",
    review.problemSubjectsProgress,
    y,
    contentWidth,
  );
  y = drawLabeledBlock(
    doc,
    "Академические навыки",
    review.academicSkills,
    y,
    contentWidth,
  );

  y += 3;
  y = drawSectionTitle(doc, "4. Портфолио", y);
  y = drawLabeledBlock(
    doc,
    "Основной проект",
    review.mainProjectProgress,
    y,
    contentWidth,
  );
  y = drawLabeledBlock(
    doc,
    "Параллельные активности",
    review.parallelActivities,
    y,
    contentWidth,
  );

  y += 3;
  y = drawSectionTitle(doc, "5. Highlights", y);
  y = drawLabeledBlock(doc, "Достижения", review.highlights, y, contentWidth);

  y += 3;
  y = drawSectionTitle(doc, "6. Growth Areas", y);
  y = drawLabeledBlock(doc, "Точки роста", review.growthAreas, y, contentWidth);

  y += 3;
  y = drawSectionTitle(doc, "7. Feedback & Reflection", y);
  y = drawLabeledBlock(
    doc,
    "Обратная связь ментора",
    review.mentorFeedback,
    y,
    contentWidth,
  );
  y = drawLabeledBlock(
    doc,
    "Рефлексия ученика",
    review.studentReflection,
    y,
    contentWidth,
  );

  return y;
}

function drawVisionMapPdf(
  doc: JsPdf,
  student: StudentProfile,
  y: number,
  contentWidth: number,
): number {
  const vision = normalizeVisionMap(student.visionMap);
  const currentGpa = getCurrentGpa(student.gpa);
  const yearlyPct = calculateYearlyProgress(vision, currentGpa);
  const valueCol = MARGIN + 58;

  y += 4;
  y = drawSectionTitle(doc, "1. Academic Year & Focus", y);
  y = drawKeyValueRow(doc, "Учебный год", vision.academicYear || "—", y, valueCol);
  y = drawLabeledBlock(doc, "Yearly Focus", vision.yearlyFocus, y, contentWidth);
  y = drawKeyValueRow(
    doc,
    "Year Progress",
    `${yearlyPct}%`,
    y,
    valueCol,
  );

  y += 3;
  y = drawSectionTitle(doc, "2. Academic Goals", y);
  y = drawKeyValueRow(
    doc,
    "Target GPA",
    vision.targetGpa === null ? "—" : String(vision.targetGpa),
    y,
    valueCol,
  );
  y = drawKeyValueRow(
    doc,
    "Current GPA",
    currentGpa === null ? "—" : currentGpa.toFixed(2),
    y,
    valueCol,
  );
  if (vision.examTargets.length === 0) {
    y = drawWrappedText(doc, "Экзамены: —", MARGIN, y, contentWidth);
  } else {
    for (const exam of vision.examTargets) {
      y = ensureSpace(doc, y, 10);
      y = drawWrappedText(
        doc,
        `• ${exam.name || "Exam"} — target ${exam.targetScore || "—"}, deadline ${exam.deadline || "—"}`,
        MARGIN,
        y,
        contentWidth,
      );
    }
  }

  y += 3;
  y = drawSectionTitle(doc, "3. Projects & Portfolio", y);
  if (vision.projects.length === 0) {
    y = drawWrappedText(doc, "—", MARGIN, y, contentWidth);
  } else {
    for (const project of vision.projects) {
      y = ensureSpace(doc, y, 16);
      doc.setFont(FONT, "bold");
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      y = drawWrappedText(
        doc,
        `${project.title || "Проект"} [${project.stage}] — ${project.progress}%`,
        MARGIN,
        y,
        contentWidth,
      );
      doc.setFont(FONT, "normal");
      doc.setTextColor(...TEXT);
      if (project.description.trim()) {
        y = drawWrappedText(doc, project.description, MARGIN, y, contentWidth);
      }
      y = drawWrappedText(
        doc,
        `Deliverable: ${project.deliverable.trim() || "—"}`,
        MARGIN,
        y,
        contentWidth,
      );
      y += 2;
    }
  }

  y += 3;
  y = drawSectionTitle(doc, "4. Soft Skills", y);
  if (vision.softSkills.length === 0) {
    y = drawWrappedText(doc, "—", MARGIN, y, contentWidth);
  } else {
    for (const skill of vision.softSkills) {
      y = drawWrappedText(
        doc,
        `• ${skill.name || "Навык"} — ${SOFT_SKILL_STAGE_LABELS[skill.stage]}, ★ ${skill.rating}/5`,
        MARGIN,
        y,
        contentWidth,
      );
    }
  }

  y += 3;
  y = drawSectionTitle(doc, "5. Extracurricular & Milestones", y);
  if (vision.extracurriculars.length === 0) {
    y = drawWrappedText(doc, "—", MARGIN, y, contentWidth);
  } else {
    for (const item of vision.extracurriculars) {
      y = drawWrappedText(
        doc,
        `• ${item.goal || "Цель"} — ${item.plannedDate || "—"} [${item.status}]`,
        MARGIN,
        y,
        contentWidth,
      );
    }
  }

  y += 3;
  y = drawSectionTitle(doc, "6. Future Review", y);

  doc.setFont(FONT, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  y = ensureSpace(doc, y, 8);
  doc.text("Академические цели (5)", MARGIN, y);
  y += 5;
  doc.setFont(FONT, "normal");
  doc.setTextColor(...TEXT);
  for (const [index, goal] of vision.futureAcademicGoals.entries()) {
    if (!goal.text.trim()) continue;
    y = drawWrappedText(
      doc,
      `${index + 1}. ${goal.text.trim()} [${goal.status}]`,
      MARGIN,
      y,
      contentWidth,
    );
  }

  y += 3;
  doc.setFont(FONT, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  y = ensureSpace(doc, y, 8);
  doc.text("Остальные цели (5)", MARGIN, y);
  y += 5;
  doc.setFont(FONT, "normal");
  doc.setTextColor(...TEXT);
  for (const [index, goal] of vision.futureOtherGoals.entries()) {
    if (!goal.text.trim()) continue;
    y = drawWrappedText(
      doc,
      `${index + 1}. ${goal.text.trim()} [${goal.status}]`,
      MARGIN,
      y,
      contentWidth,
    );
  }

  return y;
}

function drawAcademicPdf(
  doc: JsPdf,
  student: StudentProfile,
  y: number,
  contentWidth: number,
  valueCol: number,
): number {
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  y = ensureSpace(doc, y, 8);
  doc.text("GPA", MARGIN, y);
  y += 7;

  const startLabel = student.gpa.startMonthLabel?.trim() || "старт менторства";
  const gpaRows: Array<[string, string]> = [
    [`GPA ${startLabel}`, formatGpa(student.gpa.start)],
    ["GPA Январь 2027", formatGpa(student.gpa.january2027)],
    ["GPA Июль 2027", formatGpa(student.gpa.july2027)],
  ];
  for (const [label, value] of gpaRows) {
    y = drawKeyValueRow(doc, label, value, y, valueCol);
  }

  y += 4;
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  y = ensureSpace(doc, y, 8);
  doc.text("SAT / IELTS", MARGIN, y);
  y += 7;
  const testRows: Array<[string, string]> = [
    ["SAT", student.testScores.sat?.toString() ?? "—"],
    ["SAT (цель)", student.testScores.satTarget?.toString() ?? "—"],
    ["IELTS", student.testScores.ielts?.toString() ?? "—"],
    ["IELTS (цель)", student.testScores.ieltsTarget?.toString() ?? "—"],
  ];
  for (const [label, value] of testRows) {
    y = drawKeyValueRow(doc, label, value, y, valueCol);
  }

  y += 4;
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  y = ensureSpace(doc, y, 8);
  doc.text("Академ активность", MARGIN, y);
  y += 7;

  if (student.academicActivities.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("Нет записей", MARGIN, y);
    return y + 8;
  }

  for (let i = 0; i < student.academicActivities.length; i += 1) {
    const item = student.academicActivities[i];
    y = ensureSpace(doc, y, 20);
    doc.setFont(FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    y = drawWrappedText(
      doc,
      `${i + 1}. ${item.name || "Без названия"}`,
      MARGIN,
      y,
      contentWidth,
    );
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    y = drawWrappedText(doc, `Тип: ${item.type}`, MARGIN + 4, y, contentWidth - 4);
    y = drawWrappedText(
      doc,
      `Статус: ${item.status}`,
      MARGIN + 4,
      y,
      contentWidth - 4,
    );
    y = drawWrappedText(
      doc,
      `Результат: ${item.result?.trim() ? item.result : "—"}`,
      MARGIN + 4,
      y,
      contentWidth - 4,
    );
    y += 3;
  }
  return y;
}

function drawMonthlyFocusesPdf(
  doc: JsPdf,
  student: StudentProfile,
  y: number,
  contentWidth: number,
): number {
  if (student.monthlyFocuses.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    y = ensureSpace(doc, y, 8);
    doc.text("Фокусы не заданы", MARGIN, y);
    return y + 8;
  }

  for (let i = 0; i < student.monthlyFocuses.length; i += 1) {
    const focus = student.monthlyFocuses[i];
    y = ensureSpace(doc, y, 20);
    doc.setFont(FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    y = drawWrappedText(
      doc,
      `${focus.month || "Месяц"} — ${focus.title || "Без названия"}`,
      MARGIN,
      y,
      contentWidth,
    );
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    if (focus.achieved) {
      y = drawWrappedText(doc, "Статус: цель достигнута", MARGIN + 4, y, contentWidth - 4);
    }
    if (focus.description?.trim()) {
      y = drawWrappedText(doc, focus.description, MARGIN + 4, y, contentWidth - 4);
    }
    y += 3;
  }
  return y;
}

function drawSprintsPdf(
  doc: JsPdf,
  student: StudentProfile,
  y: number,
  contentWidth: number,
): number {
  if (student.sprintTasks.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    y = ensureSpace(doc, y, 8);
    doc.text("Задачи не назначены", MARGIN, y);
    return y + 8;
  }

  for (let i = 0; i < student.sprintTasks.length; i += 1) {
    const task = student.sprintTasks[i];
    y = ensureSpace(doc, y, 18);
    doc.setFont(FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    y = drawWrappedText(
      doc,
      `${i + 1}. ${task.title || "Без названия"}`,
      MARGIN,
      y,
      contentWidth,
    );
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    y = drawWrappedText(
      doc,
      `${task.sprintLabel} · ${task.completed ? "Выполнено" : "В работе"}`,
      MARGIN + 4,
      y,
      contentWidth - 4,
    );
    y += 2;
  }
  return y;
}

function drawProjectsPdf(
  doc: JsPdf,
  student: StudentProfile,
  y: number,
  contentWidth: number,
): number {
  if (student.projects.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    y = ensureSpace(doc, y, 8);
    doc.text("Нет проектов", MARGIN, y);
    return y + 8;
  }

  for (let i = 0; i < student.projects.length; i += 1) {
    const project = student.projects[i];
    y = ensureSpace(doc, y, 28);
    doc.setFont(FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    y = drawWrappedText(
      doc,
      `${i + 1}. ${project.title || "Без названия"}`,
      MARGIN,
      y,
      contentWidth,
    );
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    y = drawWrappedText(
      doc,
      `Роль: ${project.role || "—"}`,
      MARGIN + 4,
      y,
      contentWidth - 4,
    );
    doc.setTextColor(...TEXT);
    if (project.description?.trim()) {
      y = drawWrappedText(doc, project.description, MARGIN + 4, y, contentWidth - 4);
    }
    doc.setTextColor(...MUTED);
    y = drawWrappedText(
      doc,
      `Статус: ${project.status}`,
      MARGIN + 4,
      y,
      contentWidth - 4,
    );
    y = drawWrappedText(
      doc,
      `Импакт: ${project.impactMetrics || "—"}`,
      MARGIN + 4,
      y,
      contentWidth - 4,
    );
    y += 5;
  }
  return y;
}

function drawBooksPdf(
  doc: JsPdf,
  student: StudentProfile,
  y: number,
  contentWidth: number,
): number {
  if (student.books.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    y = ensureSpace(doc, y, 8);
    doc.text("Список пуст", MARGIN, y);
    return y + 8;
  }

  for (let i = 0; i < student.books.length; i += 1) {
    const book = student.books[i];
    y = ensureSpace(doc, y, 14);
    doc.setFont(FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    y = drawWrappedText(
      doc,
      `${i + 1}. ${book.title || "Без названия"}`,
      MARGIN,
      y,
      contentWidth,
    );
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    y = drawWrappedText(
      doc,
      `Автор: ${book.author || "—"}  |  Статус: ${book.status}`,
      MARGIN + 4,
      y,
      contentWidth - 4,
    );
    y += 2;
  }
  return y;
}

function drawSkillsPdf(
  doc: JsPdf,
  student: StudentProfile,
  y: number,
  contentWidth: number,
): number {
  if (student.skills.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    y = ensureSpace(doc, y, 8);
    doc.text("Список пуст", MARGIN, y);
    return y + 8;
  }

  for (let i = 0; i < student.skills.length; i += 1) {
    const skill = student.skills[i];
    y = ensureSpace(doc, y, 16);
    doc.setFont(FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    y = drawWrappedText(
      doc,
      `${i + 1}. ${skill.name || "Без названия"}`,
      MARGIN,
      y,
      contentWidth,
    );
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    y = drawWrappedText(
      doc,
      `Статус: ${skill.status}`,
      MARGIN + 4,
      y,
      contentWidth - 4,
    );
    if (skill.notes?.trim()) {
      y = drawWrappedText(
        doc,
        `Заметки: ${skill.notes}`,
        MARGIN + 4,
        y,
        contentWidth - 4,
      );
    }
    y += 2;
  }
  return y;
}

function drawGrowthZonesPdf(
  doc: JsPdf,
  student: StudentProfile,
  y: number,
  contentWidth: number,
): number {
  if (student.growthZones.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    y = ensureSpace(doc, y, 8);
    doc.text("Зоны роста не указаны", MARGIN, y);
    return y + 8;
  }

  for (let i = 0; i < student.growthZones.length; i += 1) {
    const zone = student.growthZones[i];
    y = ensureSpace(doc, y, 14);
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    y = drawWrappedText(
      doc,
      `${i + 1}. ${zone.text || "—"}`,
      MARGIN,
      y,
      contentWidth,
    );
    y += 2;
  }
  return y;
}
