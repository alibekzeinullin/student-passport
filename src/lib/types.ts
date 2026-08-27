export type UserRole = "student" | "admin" | "parent";

export type AccessMode = "student" | "admin" | "parent";

export type EducationSystem = "IB" | "AP" | "A-Level" | "Национальная";

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

export interface StudentProfile {
  id: string;
  firstName: string;
  lastName: string;
  className: string;
  school: string;
  educationSystem: EducationSystem;
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
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  studentId?: string;
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
  canDownloadPdf: boolean;
  canGenerateParentLink: boolean;
  isReadOnly: boolean;
}
