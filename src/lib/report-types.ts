export type ReportType = "profile" | "monthly" | "vision";

export const REPORT_TYPES: ReportType[] = ["profile", "monthly", "vision"];

export const REPORT_LABELS: Record<ReportType, string> = {
  profile: "Student Profile",
  monthly: "Monthly Progress Review",
  vision: "Vision Map",
};

export const REPORT_DESCRIPTIONS: Record<ReportType, string> = {
  profile:
    "Полный паспорт ученика: академическая и внеучебная динамика за период менторства.",
  monthly:
    "Ежемесячный обзор прогресса: посещаемость, soft/hard skills, портфолио, достижения и рефлексия.",
  vision:
    "Goal Dashboard на учебный год: GPA, проекты, soft skills, extracurriculars и Future Review (5+5 целей).",
};
