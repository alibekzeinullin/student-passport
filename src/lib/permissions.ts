import type { AccessMode, DashboardPermissions } from "./types";

export function getDashboardPermissions(
  accessMode: AccessMode,
): DashboardPermissions {
  const isAdmin = accessMode === "admin";
  const isStudent = accessMode === "student";
  const isParent = accessMode === "parent";

  return {
    canEditHeader: isAdmin,
    canEditMentorNote: isAdmin,
    canEditMentorSummary: isAdmin,
    canEditGrowthZones: isAdmin,
    canEditScores: isAdmin,
    canEditGpa: isAdmin,
    canEditTestScores: isAdmin,
    canEditAcademicActivities: isAdmin || isStudent,
    canEditProjects: isAdmin || isStudent,
    canEditBooks: isAdmin || isStudent,
    canEditSkills: isAdmin || isStudent,
    canEditFocuses: isAdmin,
    canEditSprintMeta: isAdmin,
    canToggleSprintCompletion: isAdmin || isStudent,
    canEditSprintArtifacts: isAdmin || isStudent,
    canDownloadPdf: isAdmin || isParent,
    canGenerateParentLink: isAdmin,
    isReadOnly: isParent,
  };
}
