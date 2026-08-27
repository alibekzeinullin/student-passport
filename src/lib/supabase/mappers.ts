import type {
  AcademicActivity,
  Book,
  EducationSystem,
  GrowthZone,
  GpaRecord,
  MentorSummary,
  MonthlyFocus,
  Project,
  Skill,
  SprintTask,
  StudentProfile,
  TestScores,
} from "@/lib/types";
import type { DbStudent } from "@/lib/supabase/database.types";
import { ensureDefaultSkills } from "@/lib/default-skills";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function mapDbStudentToProfile(row: DbStudent): StudentProfile {
  const skills = ensureDefaultSkills(
    row.id,
    asArray<Skill>(row.skills),
  );

  return {
    id: row.id,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    className: row.class_name ?? "",
    school: row.school ?? "",
    educationSystem: (row.education_system as EducationSystem) || "Национальная",
    avatarUrl: row.avatar_url ?? undefined,
    email: row.email ?? "",
    parentAccessToken: row.parent_access_token,
    mentorNote: row.mentor_note ?? "",
    mentorSummary: {
      monthlyComment: row.mentor_summary?.monthlyComment ?? "",
      nextMonthFocus: row.mentor_summary?.nextMonthFocus ?? "",
    },
    attendanceScore: row.attendance_score ?? 0,
    assignmentsScore: row.assignments_score ?? 0,
    gpa: {
      startMonthLabel: row.gpa?.startMonthLabel ?? "Старт менторства",
      start: row.gpa?.start ?? null,
      january2027: row.gpa?.january2027 ?? null,
      july2027: row.gpa?.july2027 ?? null,
    },
    testScores: {
      sat: row.test_scores?.sat ?? null,
      ielts: row.test_scores?.ielts ?? null,
      satTarget: row.test_scores?.satTarget ?? null,
      ieltsTarget: row.test_scores?.ieltsTarget ?? null,
      cambridgeTest: row.test_scores?.cambridgeTest ?? null,
      cambridgeTestTarget: row.test_scores?.cambridgeTestTarget ?? null,
    },
    sprintTasks: asArray<SprintTask>(row.sprint_tasks),
    academicActivities: asArray<AcademicActivity>(row.academic_activities),
    projects: asArray<Project>(row.projects),
    books: asArray<Book>(row.books),
    skills,
    growthZones: asArray<GrowthZone>(row.growth_zones),
    monthlyFocuses: asArray<MonthlyFocus>(row.monthly_focuses),
  };
}

export function mapProfileToDbPatch(
  patch: Partial<StudentProfile>,
): Partial<DbStudent> {
  const db: Partial<DbStudent> = {};

  if (patch.firstName !== undefined) db.first_name = patch.firstName;
  if (patch.lastName !== undefined) db.last_name = patch.lastName;
  if (patch.className !== undefined) db.class_name = patch.className;
  if (patch.school !== undefined) db.school = patch.school;
  if (patch.educationSystem !== undefined) {
    db.education_system = patch.educationSystem;
  }
  if (patch.email !== undefined) db.email = patch.email;
  if (patch.avatarUrl !== undefined) db.avatar_url = patch.avatarUrl ?? null;
  if (patch.parentAccessToken !== undefined) {
    db.parent_access_token = patch.parentAccessToken;
  }
  if (patch.mentorNote !== undefined) db.mentor_note = patch.mentorNote;
  if (patch.mentorSummary !== undefined) {
    db.mentor_summary = patch.mentorSummary as MentorSummary;
  }
  if (patch.attendanceScore !== undefined) {
    db.attendance_score = patch.attendanceScore;
  }
  if (patch.assignmentsScore !== undefined) {
    db.assignments_score = patch.assignmentsScore;
  }
  if (patch.gpa !== undefined) db.gpa = patch.gpa as GpaRecord;
  if (patch.testScores !== undefined) {
    db.test_scores = patch.testScores as TestScores;
  }
  if (patch.sprintTasks !== undefined) db.sprint_tasks = patch.sprintTasks;
  if (patch.academicActivities !== undefined) {
    db.academic_activities = patch.academicActivities;
  }
  if (patch.projects !== undefined) db.projects = patch.projects;
  if (patch.books !== undefined) db.books = patch.books;
  if (patch.skills !== undefined) db.skills = patch.skills;
  if (patch.growthZones !== undefined) db.growth_zones = patch.growthZones;
  if (patch.monthlyFocuses !== undefined) {
    db.monthly_focuses = patch.monthlyFocuses;
  }

  return db;
}

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Ученик", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}
