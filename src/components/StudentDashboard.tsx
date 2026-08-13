"use client";

import type { AccessMode, StudentProfile } from "@/lib/types";
import { getDashboardPermissions } from "@/lib/permissions";
import { useStudents } from "@/context/StudentsContext";
import { ProfileHeader } from "@/components/ProfileHeader";
import { MentorSummaryBlock } from "@/components/MentorSummaryBlock";
import { ScoreCircles } from "@/components/ScoreCircles";
import { GpaTable } from "@/components/GpaTable";
import { TestScoresCard } from "@/components/TestScoresCard";
import { AcademicActivityTable } from "@/components/AcademicActivityTable";
import { SprintTasksTable } from "@/components/SprintTasksTable";
import { ProjectsGrid } from "@/components/ProjectsGrid";
import { BooksTable } from "@/components/BooksTable";
import { SkillsTable } from "@/components/SkillsTable";
import { GrowthZonesBlock } from "@/components/GrowthZonesBlock";
import { MonthlyFocuses } from "@/components/MonthlyFocuses";
import { PdfDownloadButton } from "@/components/PdfDownloadButton";
import { ParentAccessLinkButton } from "@/components/ParentAccessLinkButton";
import { Section } from "@/components/ui/Section";

interface StudentDashboardProps {
  studentId: string;
  accessMode: AccessMode;
}

export function StudentDashboard({
  studentId,
  accessMode,
}: StudentDashboardProps) {
  const {
    getStudent,
    updateStudent,
    updateAcademicActivities,
    updateProjects,
    updateSprintTasks,
  } = useStudents();
  const student = getStudent(studentId);
  const perms = getDashboardPermissions(accessMode);

  if (!student) {
    return (
      <div className="rounded-lg border border-light-gray bg-card p-8 text-center text-muted">
        Профиль ученика не найден.
      </div>
    );
  }

  const patchStudent = (patch: Partial<StudentProfile>) => {
    updateStudent(studentId, patch);
  };

  const titleByMode: Record<AccessMode, string> = {
    student: "Личный кабинет",
    admin: "Профиль ученика (редактирование)",
    parent: "Паспорт ученика (только просмотр)",
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-burgundy">
              {titleByMode[accessMode]}
            </p>
            <h2 className="text-2xl font-semibold text-navy">
              {student.lastName} {student.firstName}
            </h2>
            {accessMode === "parent" ? (
              <p className="mt-1 text-sm text-muted">
                Режим родителя / гостя — изменения недоступны
              </p>
            ) : null}
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            {perms.canDownloadPdf ? (
              <PdfDownloadButton student={student} />
            ) : null}
            {perms.canGenerateParentLink ? (
              <ParentAccessLinkButton studentId={studentId} />
            ) : null}
          </div>
        </div>
      </div>

      <ProfileHeader
        student={student}
        editable={perms.canEditHeader}
        canEditMentorNote={perms.canEditMentorNote}
        onChange={
          perms.canEditHeader || perms.canEditMentorNote
            ? patchStudent
            : undefined
        }
      />

      <MentorSummaryBlock
        summary={student.mentorSummary}
        editable={perms.canEditMentorSummary}
        onChange={
          perms.canEditMentorSummary
            ? (mentorSummary) => patchStudent({ mentorSummary })
            : undefined
        }
      />

      <ScoreCircles
        student={student}
        editable={perms.canEditScores}
        onChange={perms.canEditScores ? patchStudent : undefined}
      />

      <Section
        number="1"
        title="Академическая динамика"
        description="GPA, SAT/IELTS и академическая активность"
      >
        <div className="space-y-4">
          <GpaTable
            gpa={student.gpa}
            editable={perms.canEditGpa}
            onChange={
              perms.canEditGpa
                ? (gpa) => updateStudent(studentId, { gpa })
                : undefined
            }
          />
          <TestScoresCard
            scores={student.testScores}
            editable={perms.canEditTestScores}
            onChange={
              perms.canEditTestScores
                ? (testScores) => patchStudent({ testScores })
                : undefined
            }
          />
          <AcademicActivityTable
            activities={student.academicActivities}
            editable={perms.canEditAcademicActivities}
            onChange={
              perms.canEditAcademicActivities
                ? (activities) =>
                    updateAcademicActivities(studentId, activities)
                : undefined
            }
          />
        </div>
      </Section>

      <Section
        number="2"
        title="Спринты по групповой работе"
        description="Задачи группового спринта и артефакты (Notion, Docs, Drive)"
      >
        <SprintTasksTable
          tasks={student.sprintTasks}
          canEditMeta={perms.canEditSprintMeta}
          canToggleCompletion={perms.canToggleSprintCompletion}
          canEditArtifacts={perms.canEditSprintArtifacts}
          onChange={
            perms.canToggleSprintCompletion ||
            perms.canEditSprintArtifacts ||
            perms.canEditSprintMeta
              ? (sprintTasks) => updateSprintTasks(studentId, sprintTasks)
              : undefined
          }
        />
      </Section>

      <Section
        number="3"
        title="Внеучебная деятельность"
        description="Extracurricular Activities — проекты, роли и метрики импакта"
      >
        <ProjectsGrid
          projects={student.projects}
          editable={perms.canEditProjects}
          onChange={
            perms.canEditProjects
              ? (projects) => updateProjects(studentId, projects)
              : undefined
          }
        />
      </Section>

      <Section number="4" title="Книги" description="Книги к прочтению">
        <BooksTable
          books={student.books}
          editable={perms.canEditBooks}
          onChange={
            perms.canEditBooks
              ? (books) => patchStudent({ books })
              : undefined
          }
        />
      </Section>

      <Section number="5" title="Навыки" description="Навыки для освоения">
        <SkillsTable
          skills={student.skills}
          editable={perms.canEditSkills}
          onChange={
            perms.canEditSkills
              ? (skills) => patchStudent({ skills })
              : undefined
          }
        />
      </Section>

      <Section
        number="6"
        title="Зоны роста"
        description="Что нужно улучшить — заполняет ментор"
      >
        <GrowthZonesBlock
          zones={student.growthZones}
          editable={perms.canEditGrowthZones}
          onChange={
            perms.canEditGrowthZones
              ? (growthZones) => patchStudent({ growthZones })
              : undefined
          }
        />
      </Section>

      <Section
        number="7"
        title="Личные ежемесячные фокусы"
        description="Индивидуальные приоритеты ученика на каждый месяц"
      >
        <MonthlyFocuses
          focuses={student.monthlyFocuses}
          editable={perms.canEditFocuses}
          onChange={
            perms.canEditFocuses
              ? (monthlyFocuses) => patchStudent({ monthlyFocuses })
              : undefined
          }
        />
      </Section>
    </div>
  );
}
