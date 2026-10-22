"use client";

import type { AccessMode, StudentProfile } from "@/lib/types";
import { getDashboardPermissions } from "@/lib/permissions";
import { useStudents } from "@/context/StudentsContext";
import { ProfileHeader } from "@/components/ProfileHeader";
import { ScoreCircles } from "@/components/ScoreCircles";
import { GpaTable } from "@/components/GpaTable";
import { TestScoresCard } from "@/components/TestScoresCard";
import { AcademicActivityTable } from "@/components/AcademicActivityTable";
import { SprintTasksTable } from "@/components/SprintTasksTable";
import { ProjectsGrid } from "@/components/ProjectsGrid";
import { BooksTable } from "@/components/BooksTable";
import { SkillsTable } from "@/components/SkillsTable";
import { GrowthZonesBlock } from "@/components/GrowthZonesBlock";
import { MeetingsJournal } from "@/components/MeetingsJournal";
import { StudentOverview } from "@/components/StudentOverview";
import { TermGradesChart } from "@/components/TermGradesChart";
import Link from "next/link";
import { ParentAccessLinkButton } from "@/components/ParentAccessLinkButton";
import { Section } from "@/components/ui/Section";
import { ZoneBand } from "@/components/ui/ZoneBand";
import { TermLabel } from "@/components/ui/TermHint";

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
    loading,
    updateStudent,
    updateAcademicActivities,
    updateProjects,
    updateSprintTasks,
    refreshStudents,
  } = useStudents();
  const student = getStudent(studentId);
  const perms = getDashboardPermissions(accessMode);

  if (loading && !student) {
    return (
      <div className="rounded-2xl border border-light-gray bg-card p-8 text-center text-muted">
        Загрузка профиля…
      </div>
    );
  }

  if (!student) {
    return (
      <div className="rounded-2xl border border-light-gray bg-card p-8 text-center text-muted">
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
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
              {titleByMode[accessMode]}
            </p>
            {accessMode === "parent" ? (
              <p className="mt-1 text-sm text-muted">
                Режим родителя / гостя — изменения недоступны
              </p>
            ) : null}
          </div>

          {accessMode === "student" ? (
            <nav aria-label="Разделы ученика" className="flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
              <Link
                href="/dashboard/vision"
                className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-navy"
              >
                Vision Map — мои цели на год
              </Link>
              <Link
                href="/dashboard/essays"
                className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-navy"
              >
                Эссе — 100 тем
              </Link>
            </nav>
          ) : null}
          {accessMode === "admin" ? (
            <nav
              aria-label="Отчёты ученика"
              className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 sm:rounded-full"
            >
              <Link
                href={`/admin/students/${studentId}/profile`}
                className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-navy"
              >
                Student Profile
              </Link>
              <Link
                href={`/admin/students/${studentId}/monthly`}
                className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-navy"
              >
                Monthly Review
              </Link>
              <Link
                href={`/admin/students/${studentId}/vision`}
                className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-navy"
              >
                Vision Map
              </Link>
            </nav>
          ) : null}
        </div>

        {accessMode === "admin" && student.status === "paused" ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-navy sm:flex-row sm:items-center sm:justify-between">
            <span>
              Ученик на паузе
              {student.pausedAt
                ? ` с ${new Date(student.pausedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`
                : ""}
              . Он скрыт из реестра и «Что требует внимания», данные сохранены.
            </span>
            <button
              type="button"
              onClick={() => patchStudent({ status: "active", pausedAt: null })}
              className="self-start rounded-full border border-gold/50 px-4 py-1.5 text-gold transition hover:bg-gold/10 sm:self-auto"
            >
              Вернуть в активные
            </button>
          </div>
        ) : null}

        {perms.canGenerateParentLink ? (
          <ParentAccessLinkButton studentId={studentId} />
        ) : null}
      </div>

      {accessMode !== "parent" ? (
        <StudentOverview
          student={student}
          mode={accessMode === "admin" ? "admin" : "student"}
        />
      ) : null}

      <div id="sec-profile" className="scroll-mt-24" />
      <ZoneBand tone="other">
        <ProfileHeader
          student={student}
          editable={perms.canEditHeader}
          canEditMentorNote={perms.canEditMentorNote}
          onChange={
            perms.canEditHeader || perms.canEditMentorNote
              ? patchStudent
              : undefined
          }
          onAvatarChange={
            perms.canEditAvatar
              ? (avatarUrl) => patchStudent({ avatarUrl })
              : undefined
          }
        />

        <ScoreCircles student={student} />
      </ZoneBand>

      {accessMode !== "parent" ? (
        <div id="sec-journal" className="scroll-mt-24">
        <ZoneBand tone="other">
          <MeetingsJournal
            studentId={studentId}
            mode={accessMode === "admin" ? "admin" : "student"}
            studentName={`${student.lastName} ${student.firstName}`.trim()}
            onScoresChanged={() => {
              void refreshStudents();
            }}
          />
        </ZoneBand>
        </div>
      ) : null}

      <ZoneBand tone="academic">
        <Section
          id="sec-academic"
          number="1"
          title="Академическая динамика"
          description="GPA, SAT/IELTS и академическая активность"
        >
          <div className="space-y-4">
            <TermGradesChart
              student={student}
              mode={accessMode}
              onTermSystemChange={
                perms.canEditGpa
                  ? (termSystem) => patchStudent({ termSystem })
                  : undefined
              }
            />
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
      </ZoneBand>

      <ZoneBand tone="other">
        <Section
          id="sec-sprints"
          number="2"
          title="Спринты по групповой работе"
          description="Общие спринты программы. Список тем может меняться."
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
      </ZoneBand>

      <ZoneBand tone="growth">
        <Section
          id="sec-projects"
          number="3"
          title={
            <TermLabel term="Extracurricular">Внеучебная деятельность</TermLabel>
          }
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

        <Section
          id="sec-books"
          number="4"
          title="Книги"
          description="Рекомендации программы и личный список чтения"
        >
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

        <Section id="sec-skills" number="5" title="Навыки" description="Навыки для освоения">
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
      </ZoneBand>

      {accessMode !== "student" ? (
      <ZoneBand tone="other">
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
      </ZoneBand>
      ) : null}
    </div>
  );
}
