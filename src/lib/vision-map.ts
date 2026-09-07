import type {
  ExtracurricularStatus,
  GpaRecord,
  QuarterCheckpointStatus,
  SoftSkillStage,
  VisionExamTarget,
  VisionExtracurricularGoal,
  VisionMap,
  VisionProjectGoal,
  VisionProjectStage,
  VisionQuarterCheckpoint,
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

export const QUARTER_STATUSES: QuarterCheckpointStatus[] = [
  "Not started",
  "In progress",
  "Done",
];

export const MAX_VISION_PROJECTS = 3;
export const MAX_VISION_SOFT_SKILLS = 3;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultAcademicYear(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  // academic year typically starts in August/September
  if (month >= 7) return `${year}–${year + 1}`;
  return `${year - 1}–${year}`;
}

export function createDefaultQuarters(): VisionQuarterCheckpoint[] {
  return [
    {
      id: "q1",
      label: "Q1 Review (Осень)",
      status: "Not started",
      notes: "",
    },
    {
      id: "q2",
      label: "Q2 Review (Зима)",
      status: "Not started",
      notes: "",
    },
    {
      id: "q3",
      label: "Q3 Review (Весна)",
      status: "Not started",
      notes: "",
    },
    {
      id: "q4",
      label: "Q4 Review (Лето / Финал)",
      status: "Not started",
      notes: "",
    },
  ];
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
    quarters: createDefaultQuarters(),
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

function normalizeQuarterStatus(value: unknown): QuarterCheckpointStatus {
  return QUARTER_STATUSES.includes(value as QuarterCheckpointStatus)
    ? (value as QuarterCheckpointStatus)
    : "Not started";
}

/** Поддерживает новый формат и старый (longTermVision / milestones). */
export function normalizeVisionMap(raw: unknown): VisionMap {
  const empty = createEmptyVisionMap();
  if (!isRecord(raw)) return empty;

  // legacy → yearlyFocus
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

  const defaults = createDefaultQuarters();
  const rawQuarters = asArray<Record<string, unknown>>(raw.quarters);
  const quarters = defaults.map((def) => {
    const found = rawQuarters.find((q) => q.id === def.id);
    if (!found) return def;
    return {
      ...def,
      label: typeof found.label === "string" && found.label ? found.label : def.label,
      status: normalizeQuarterStatus(found.status),
      notes: typeof found.notes === "string" ? found.notes : "",
    };
  });

  return {
    academicYear,
    yearlyFocus,
    targetGpa,
    examTargets,
    projects,
    softSkills,
    extracurriculars,
    quarters,
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

function quarterProgress(status: QuarterCheckpointStatus): number {
  if (status === "Done") return 100;
  if (status === "In progress") return 50;
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

  if (vision.quarters.length > 0) {
    parts.push(
      vision.quarters.reduce((sum, q) => sum + quarterProgress(q.status), 0) /
        vision.quarters.length,
    );
  }

  if (parts.length === 0) return 0;
  return clampPercent(parts.reduce((a, b) => a + b, 0) / parts.length);
}
