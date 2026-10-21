export type UserRole = "student" | "admin" | "parent";

export type AccessMode = "student" | "admin" | "parent";

export type EducationSystem = "IB" | "AP" | "A-Level" | "Национальная";

/** Как делится учебный год в школе ученика */
export type TermSystem = "quarters" | "trimesters" | "semesters";

/** Активный ученик или приостановил обучение */
export type StudentStatus = "active" | "paused";

export type AcademicActivityStatus =
  | "В планах"
  | "Подана"
  | "В процессе"
  | "Завершено";

export type AcademicActivityType =
  | "Олимпиада"
  | "Хакатон"
  | "Academic Honor"
  | "Конкурс"
  | "Другое";

export type ProjectStatus =
  | "Идея"
  | "В работе"
  | "Завершён"
  | "На паузе";

export type BookStatus = "В планах" | "Читаю" | "Прочитано";

export type SkillStatus = "К освоению" | "В процессе" | "Освоен";

export interface GpaRecord {
  startMonthLabel: string;
  start: number | null;
  january2027: number | null;
  july2027: number | null;
}

export interface TestScores {
  sat: number | null;
  ielts: number | null;
  satTarget: number | null;
  ieltsTarget: number | null;
  cambridgeTest: number | null;
  cambridgeTestTarget: number | null;
}

export interface MentorSummary {
  monthlyComment: string;
  nextMonthFocus: string;
}

export interface SprintTask {
  id: string;
  sprintLabel: string;
  title: string;
  completed: boolean;
  artifactNotion: string;
  artifactDocs: string;
  artifactDrive: string;
}

export interface AcademicActivity {
  id: string;
  name: string;
  type: AcademicActivityType;
  status: AcademicActivityStatus;
  result: string;
}

export interface Project {
  id: string;
  title: string;
  role: string;
  description: string;
  status: ProjectStatus;
  impactMetrics: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
}

export interface Skill {
  id: string;
  name: string;
  status: SkillStatus;
  notes: string;
}

export interface MonthlyFocus {
  id: string;
  month: string;
  title: string;
  description: string;
  achieved?: boolean;
}

export interface GrowthZone {
  id: string;
  text: string;
}

export interface MonthlyProgressReview {
  id: string;
  /** Например: «Сентябрь 2026» */
  monthYear: string;
  individualSessionsAttended: number | null;
  groupSessionsAttended: number | null;
  homeworkCompletion: number;
  personalFocus: string;
  personalProgressNotes: string;
  academicStatus: string;
  problemSubjectsProgress: string;
  academicSkills: string;
  mainProjectProgress: string;
  parallelActivities: string;
  highlights: string;
  growthAreas: string;
  mentorFeedback: string;
  studentReflection: string;
}

export type VisionProjectStage =
  | "Idea"
  | "In Progress"
  | "Testing"
  | "Completed";

export type SoftSkillStage = "starting" | "practicing" | "mastered";

export type ExtracurricularStatus = "Planned" | "Active" | "Achieved";

export type FutureGoalStatus = "Planned" | "In Progress" | "Done";

export interface VisionExamTarget {
  id: string;
  name: string;
  targetScore: string;
  deadline: string;
}

export interface VisionProjectGoal {
  id: string;
  title: string;
  description: string;
  stage: VisionProjectStage;
  progress: number;
  deliverable: string;
}

export interface VisionSoftSkillGoal {
  id: string;
  name: string;
  stage: SoftSkillStage;
  rating: number;
}

export interface VisionExtracurricularGoal {
  id: string;
  goal: string;
  plannedDate: string;
  status: ExtracurricularStatus;
}

export interface VisionFutureGoal {
  id: string;
  text: string;
  status: FutureGoalStatus;
}

export interface VisionMap {
  academicYear: string;
  yearlyFocus: string;
  targetGpa: number | null;
  examTargets: VisionExamTarget[];
  projects: VisionProjectGoal[];
  softSkills: VisionSoftSkillGoal[];
  extracurriculars: VisionExtracurricularGoal[];
  /** Future Review: до 5 академических целей на год */
  futureAcademicGoals: VisionFutureGoal[];
  /** Future Review: до 5 остальных целей на год */
  futureOtherGoals: VisionFutureGoal[];
}

export interface StudentProfile {
  id: string;
  firstName: string;
  lastName: string;
  className: string;
  school: string;
  educationSystem: EducationSystem;
  termSystem: TermSystem;
  status: StudentStatus;
  pausedAt: string | null;
  avatarUrl?: string;
  email: string;
  parentAccessToken: string;
  mentorNote: string;
  mentorSummary: MentorSummary;
  attendanceScore: number;
  assignmentsScore: number;
  gpa: GpaRecord;
  testScores: TestScores;
  sprintTasks: SprintTask[];
  academicActivities: AcademicActivity[];
  projects: Project[];
  books: Book[];
  skills: Skill[];
  growthZones: GrowthZone[];
  monthlyFocuses: MonthlyFocus[];
  monthlyProgressReviews: MonthlyProgressReview[];
  visionMap: VisionMap;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  studentId?: string;
  /** Временный пароль от ментора — попросить сменить при входе */
  mustChangePassword?: boolean;
}

export interface AuthAccount {
  id: string;
  fullName: string;
  email: string;
  password: string;
  role: Exclude<UserRole, "parent">;
  studentId?: string;
}

export interface StudentRegistrationInput {
  fullName: string;
  email: string;
  password: string;
  className: string;
  school: string;
  educationSystem: EducationSystem;
}

export interface DashboardPermissions {
  canEditHeader: boolean;
  canEditMentorNote: boolean;
  canEditMentorSummary: boolean;
  canEditGrowthZones: boolean;
  canEditScores: boolean;
  canEditGpa: boolean;
  canEditTestScores: boolean;
  canEditAcademicActivities: boolean;
  canEditProjects: boolean;
  canEditBooks: boolean;
  canEditSkills: boolean;
  canEditFocuses: boolean;
  canEditSprintMeta: boolean;
  canToggleSprintCompletion: boolean;
  canEditSprintArtifacts: boolean;
  canEditMonthlyProgress: boolean;
  canEditVisionMap: boolean;
  canDownloadPdf: boolean;
  canGenerateParentLink: boolean;
  isReadOnly: boolean;
}
