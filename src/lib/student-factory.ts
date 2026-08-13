import { createDefaultSkills, ensureDefaultSkills } from "./default-skills";
import type { StudentProfile, StudentRegistrationInput } from "./types";

function randomToken() {
  return `tok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "Ученик", lastName: "Новый" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function buildStudentFromRegistration(
  input: StudentRegistrationInput,
): StudentProfile {
  const names = splitName(input.fullName);
  const id = `s-${Date.now().toString(36)}`;

  return {
    id,
    firstName: names.firstName,
    lastName: names.lastName,
    className: input.className,
    school: input.school,
    educationSystem: input.educationSystem,
    email: input.email.toLowerCase(),
    parentAccessToken: randomToken(),
    mentorNote: "",
    mentorSummary: {
      monthlyComment: "",
      nextMonthFocus: "",
    },
    attendanceScore: 0,
    assignmentsScore: 0,
    gpa: {
      startMonthLabel: "Старт менторства",
      start: null,
      january2027: null,
      july2027: null,
    },
    testScores: {
      sat: null,
      ielts: null,
      satTarget: null,
      ieltsTarget: null,
    },
    sprintTasks: [],
    academicActivities: [],
    projects: [],
    books: [],
    skills: createDefaultSkills(id),
    growthZones: [],
    monthlyFocuses: [],
  };
}

export function normalizeStudentProfile(
  input: Partial<StudentProfile>,
): StudentProfile {
  const id = input.id ?? `s-${Date.now().toString(36)}`;
  const fullName =
    `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim() || "Новый Ученик";
  const base = buildStudentFromRegistration({
    fullName,
    email: input.email ?? `student-${id}@today.local`,
    password: "placeholder123",
    className: input.className ?? "",
    school: input.school ?? "",
    educationSystem: input.educationSystem ?? "Национальная",
  });

  return {
    ...base,
    ...input,
    id,
    mentorSummary: {
      monthlyComment: input.mentorSummary?.monthlyComment ?? "",
      nextMonthFocus: input.mentorSummary?.nextMonthFocus ?? "",
    },
    gpa: {
      startMonthLabel: input.gpa?.startMonthLabel ?? "Старт менторства",
      start: input.gpa?.start ?? null,
      january2027: input.gpa?.january2027 ?? null,
      july2027: input.gpa?.july2027 ?? null,
    },
    testScores: {
      sat: input.testScores?.sat ?? null,
      ielts: input.testScores?.ielts ?? null,
      satTarget: input.testScores?.satTarget ?? null,
      ieltsTarget: input.testScores?.ieltsTarget ?? null,
    },
    sprintTasks: input.sprintTasks ?? [],
    academicActivities: input.academicActivities ?? [],
    projects: input.projects ?? [],
    books: input.books ?? [],
    skills: ensureDefaultSkills(id, input.skills ?? []),
    growthZones: input.growthZones ?? [],
    monthlyFocuses: input.monthlyFocuses ?? [],
    parentAccessToken: input.parentAccessToken ?? randomToken(),
    mentorNote: input.mentorNote ?? "",
    attendanceScore:
      typeof input.attendanceScore === "number" ? input.attendanceScore : 0,
    assignmentsScore:
      typeof input.assignmentsScore === "number" ? input.assignmentsScore : 0,
  };
}
