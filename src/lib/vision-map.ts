import type {
  ExtracurricularStatus,
  FutureGoalStatus,
  GpaRecord,
  SoftSkillStage,
  VisionExamTarget,
  VisionExtracurricularGoal,
  VisionFutureGoal,
  VisionMap,
  VisionProjectGoal,
  VisionProjectStage,
  VisionSoftSkillGoal,
} from "@/lib/types";

export const VISION_PROJECT_STAGES: VisionProjectStage[] = [
  "Idea",
  "In Progress",
  "Testing",
  "Completed",
];

export const SOFT_SKILL_STAGES: SoftSkillStage[] = [
  "starting",
  "practicing",
  "mastered",
];

export const SOFT_SKILL_STAGE_LABELS: Record<SoftSkillStage, string> = {
  starting: "Только начинаю",
  practicing: "Практикую",
  mastered: "Освоил",
};

export const EXTRACURRICULAR_STATUSES: ExtracurricularStatus[] = [
  "Planned",
  "Active",
  "Achieved",
];

export const FUTURE_GOAL_STATUSES: FutureGoalStatus[] = [
  "Planned",
  "In Progress",
  "Done",
];

export const MAX_VISION_PROJECTS = 3;
export const MAX_VISION_SOFT_SKILLS = 3;
export const MAX_FUTURE_GOALS = 5;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultAcademicYear(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 7) return `${year}–${year + 1}`;
  return `${year - 1}–${year}`;
}

export function createEmptyFutureGoal(
  prefix: string,
  index: number,
): VisionFutureGoal {
  return {
    id: `${prefix}-${index + 1}`,
    text: "",
    status: "Planned",
  };
}

export function createDefaultFutureGoals(
  prefix: "fac" | "fot",
): VisionFutureGoal[] {
  return Array.from({ length: MAX_FUTURE_GOALS }, (_, index) =>
    createEmptyFutureGoal(prefix, index),
  );
}

export function createEmptyVisionExamTarget(): VisionExamTarget {
  return {
    id: uid("exam"),
    name: "",
    targetScore: "",
    deadline: "",
  };
}

export function createEmptyVisionProjectGoal(): VisionProjectGoal {
  return {
    id: uid("proj"),
    title: "",
    description: "",
    stage: "Idea",
    progress: 0,
    deliverable: "",
  };
}

export function createEmptyVisionSoftSkillGoal(): VisionSoftSkillGoal {
  return {
    id: uid("skill"),
    name: "",
    stage: "starting",
    rating: 1,
  };
}

export function createEmptyVisionExtracurricularGoal(): VisionExtracurricularGoal {
  return {
    id: uid("extra"),
    goal: "",
    plannedDate: "",
    status: "Planned",
  };
}

export function createEmptyVisionMap(): VisionMap {
  return {
    academicYear: defaultAcademicYear(),
    yearlyFocus: "",
    targetGpa: null,
    examTargets: [],
    projects: [],
    softSkills: [],
    extracurriculars: [],
    futureAcademicGoals: createDefaultFutureGoals("fac"),
    futureOtherGoals: createDefaultFutureGoals("fot"),
  };
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampRating(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProjectStage(value: unknown): VisionProjectStage {
  return VISION_PROJECT_STAGES.includes(value as VisionProjectStage)
    ? (value as VisionProjectStage)
    : "Idea";
}

function normalizeSoftSkillStage(value: unknown): SoftSkillStage {
  return SOFT_SKILL_STAGES.includes(value as SoftSkillStage)
    ? (value as SoftSkillStage)
    : "starting";
}

function normalizeExtraStatus(value: unknown): ExtracurricularStatus {
  return EXTRACURRICULAR_STATUSES.includes(value as ExtracurricularStatus)
    ? (value as ExtracurricularStatus)
    : "Planned";
}

function normalizeFutureStatus(value: unknown): FutureGoalStatus {
  return FUTURE_GOAL_STATUSES.includes(value as FutureGoalStatus)
    ? (value as FutureGoalStatus)
    : "Planned";
}

function normalizeFutureGoals(
  raw: unknown,
  prefix: "fac" | "fot",
): VisionFutureGoal[] {
  const defaults = createDefaultFutureGoals(prefix);
  const items = asArray<Record<string, unknown>>(raw).slice(0, MAX_FUTURE_GOALS);

  return defaults.map((def, index) => {
    const found = items[index];
    if (!found) return def;
    return {
      id: typeof found.id === "string" ? found.id : def.id,
      text: typeof found.text === "string" ? found.text : "",
      status: normalizeFutureStatus(found.status),
    };
  });
}

/** Поддерживает новый формат и старый (longTermVision / quarters). */
export function normalizeVisionMap(raw: unknown): VisionMap {
  const empty = createEmptyVisionMap();
  if (!isRecord(raw)) return empty;

  const yearlyFocus =
    typeof raw.yearlyFocus === "string"
      ? raw.yearlyFocus
      : typeof raw.longTermVision === "string"
        ? raw.longTermVision
        : "";

  const academicYear =
    typeof raw.academicYear === "string" && raw.academicYear.trim()
      ? raw.academicYear
      : empty.academicYear;

  const targetGpa =
    typeof raw.targetGpa === "number"
      ? raw.targetGpa
      : raw.targetGpa === null
        ? null
        : empty.targetGpa;

  const examTargets = asArray<Record<string, unknown>>(raw.examTargets).map(
    (item, index) => ({
      id: typeof item.id === "string" ? item.id : `exam-${index}`,
      name: typeof item.name === "string" ? item.name : "",
      targetScore: typeof item.targetScore === "string" ? item.targetScore : "",
      deadline: typeof item.deadline === "string" ? item.deadline : "",
    }),
  );

  const projects = asArray<Record<string, unknown>>(raw.projects)
    .slice(0, MAX_VISION_PROJECTS)
    .map((item, index) => ({
      id: typeof item.id === "string" ? item.id : `proj-${index}`,
      title: typeof item.title === "string" ? item.title : "",
      description: typeof item.description === "string" ? item.description : "",
      stage: normalizeProjectStage(item.stage),
      progress: clampPercent(
        typeof item.progress === "number" ? item.progress : 0,
      ),
      deliverable: typeof item.deliverable === "string" ? item.deliverable : "",
    }));

  const softSkills = asArray<Record<string, unknown>>(raw.softSkills)
    .slice(0, MAX_VISION_SOFT_SKILLS)
    .map((item, index) => ({
      id: typeof item.id === "string" ? item.id : `skill-${index}`,
      name: typeof item.name === "string" ? item.name : "",
      stage: normalizeSoftSkillStage(item.stage),
      rating: clampRating(typeof item.rating === "number" ? item.rating : 1),
    }));

  const extracurriculars = asArray<Record<string, unknown>>(
    raw.extracurriculars,
  ).map((item, index) => ({
    id: typeof item.id === "string" ? item.id : `extra-${index}`,
    goal: typeof item.goal === "string" ? item.goal : "",
    plannedDate: typeof item.plannedDate === "string" ? item.plannedDate : "",
    status: normalizeExtraStatus(item.status),
  }));

  return {
    academicYear,
    yearlyFocus,
    targetGpa,
    examTargets,
    projects,
    softSkills,
    extracurriculars,
    futureAcademicGoals: normalizeFutureGoals(
      raw.futureAcademicGoals,
      "fac",
    ),
    futureOtherGoals: normalizeFutureGoals(raw.futureOtherGoals, "fot"),
  };
}

export function getCurrentGpa(gpa: GpaRecord): number | null {
  return gpa.july2027 ?? gpa.january2027 ?? gpa.start ?? null;
}

export function gpaProgressPercent(
  current: number | null,
  target: number | null,
): number | null {
  if (current === null || target === null || target <= 0) return null;
  return clampPercent((current / target) * 100);
}

function softSkillProgress(skill: VisionSoftSkillGoal): number {
  const byStage: Record<SoftSkillStage, number> = {
    starting: 20,
    practicing: 60,
    mastered: 100,
  };
  const stageScore = byStage[skill.stage];
  const ratingScore = (skill.rating / 5) * 100;
  return (stageScore + ratingScore) / 2;
}

function extracurricularProgress(status: ExtracurricularStatus): number {
  if (status === "Achieved") return 100;
  if (status === "Active") return 50;
  return 0;
}

function futureGoalProgress(goal: VisionFutureGoal): number | null {
  if (!goal.text.trim()) return null;
  if (goal.status === "Done") return 100;
  if (goal.status === "In Progress") return 50;
  return 0;
}

/** Автоматический Overall Year Progress % для progress wheel. */
export function calculateYearlyProgress(
  vision: VisionMap,
  currentGpa: number | null,
): number {
  const parts: number[] = [];

  const gpaPct = gpaProgressPercent(currentGpa, vision.targetGpa);
  if (gpaPct !== null) parts.push(gpaPct);

  if (vision.projects.length > 0) {
    parts.push(
      vision.projects.reduce((sum, p) => sum + clampPercent(p.progress), 0) /
        vision.projects.length,
    );
  }

  if (vision.softSkills.length > 0) {
    parts.push(
      vision.softSkills.reduce((sum, s) => sum + softSkillProgress(s), 0) /
        vision.softSkills.length,
    );
  }

  if (vision.extracurriculars.length > 0) {
    parts.push(
      vision.extracurriculars.reduce(
        (sum, e) => sum + extracurricularProgress(e.status),
        0,
      ) / vision.extracurriculars.length,
    );
  }

  const futureScores = [
    ...vision.futureAcademicGoals,
    ...vision.futureOtherGoals,
  ]
    .map(futureGoalProgress)
    .filter((value): value is number => value !== null);

  if (futureScores.length > 0) {
    parts.push(
      futureScores.reduce((sum, value) => sum + value, 0) / futureScores.length,
    );
  }

  if (parts.length === 0) return 0;
  return clampPercent(parts.reduce((a, b) => a + b, 0) / parts.length);
}
