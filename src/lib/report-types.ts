export type ReportType = "short" | "long";

export const REPORT_LABELS: Record<ReportType, string> = {
  short: "Краткосрочный отчёт",
  long: "Долгосрочный отчёт",
};

export const REPORT_DESCRIPTIONS: Record<ReportType, string> = {
  short:
    "Актуальные обновления месяца: базовая информация, комментарии ментора, индикаторы, фокусы и спринты.",
  long: "Полный паспорт ученика: вся академическая и внеучебная динамика за период менторства.",
};
