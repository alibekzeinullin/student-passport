"use client";

import type { StudentProfile } from "@/lib/types";
import type { ReportType } from "@/lib/report-types";
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
import { MonthlyProgressReviewView } from "@/components/MonthlyProgressReviewView";
import { VisionMapView } from "@/components/VisionMapView";
import { Section } from "@/components/ui/Section";
import { ZoneBand } from "@/components/ui/ZoneBand";
import { TermLabel } from "@/components/ui/TermHint";

export function StudentReportView({
  student,
  reportType,
  editable = false,
  onChange,
}: {
  student: StudentProfile;
  reportType: ReportType;
  editable?: boolean;
  onChange?: (patch: Partial<StudentProfile>) => void;
}) {
  if (reportType === "monthly") {
    return (
      <MonthlyProgressReviewView
        student={student}
        editable={editable}
        onChange={onChange}
      />
    );
  }

  if (reportType === "vision") {
    return (
      <VisionMapView
        student={student}
        editable={editable}
        onChange={onChange}
      />
    );
  }

  const patch = (next: Partial<StudentProfile>) => {
    onChange?.(next);
  };

  return (
    <>
      <ZoneBand tone="other">
        <ProfileHeader
          student={student}
          editable={editable}
          canEditMentorNote={editable}
          onChange={editable ? patch : undefined}
        />
        <ScoreCircles student={student} />
      </ZoneBand>

      <ZoneBand tone="academic">
        <Section
          number="1"
          title="Академическая динамика"
          description="GPA, SAT/IELTS и академическая активность"
        >
          <div className="space-y-4">
            <GpaTable
              gpa={student.gpa}
              editable={editable}
              onChange={editable ? (gpa) => patch({ gpa }) : undefined}
            />
            <TestScoresCard
              scores={student.testScores}
              editable={editable}
              onChange={
                editable ? (testScores) => patch({ testScores }) : undefined
              }
            />
            <AcademicActivityTable
              activities={student.academicActivities}
              editable={editable}
              onChange={
                editable
                  ? (academicActivities) => patch({ academicActivities })
                  : undefined
              }
            />
          </div>
        </Section>
      </ZoneBand>

      <ZoneBand tone="other">
        <Section
          number="2"
          title="Спринты по групповой работе"
          description="Общие спринты программы. Список тем может меняться."
        >
          <SprintTasksTable
            tasks={student.sprintTasks}
            canEditMeta={editable}
            canToggleCompletion={editable}
            canEditArtifacts={editable}
            onChange={
              editable
                ? (sprintTasks) => patch({ sprintTasks })
                : undefined
            }
          />
        </Section>
      </ZoneBand>

      <ZoneBand tone="growth">
        <Section
          number="3"
          title={
            <TermLabel term="Extracurricular">Внеучебная деятельность</TermLabel>
          }
          description="Extracurricular Activities — проекты, роли и метрики импакта"
        >
          <ProjectsGrid
            projects={student.projects}
            editable={editable}
            onChange={
              editable ? (projects) => patch({ projects }) : undefined
            }
          />
        </Section>

        <Section
          number="4"
          title="Книги"
          description="Рекомендации программы и личный список чтения"
        >
          <BooksTable
            books={student.books}
            editable={editable}
            onChange={editable ? (books) => patch({ books }) : undefined}
          />
        </Section>

        <Section number="5" title="Навыки" description="Навыки для освоения">
          <SkillsTable
            skills={student.skills}
            editable={editable}
            onChange={editable ? (skills) => patch({ skills }) : undefined}
          />
        </Section>
      </ZoneBand>

      <ZoneBand tone="other">
        <Section
          number="6"
          title="Зоны роста"
          description="Что нужно улучшить — заполняет ментор"
        >
          <GrowthZonesBlock
            zones={student.growthZones}
            editable={editable}
            onChange={
              editable
                ? (growthZones) => patch({ growthZones })
                : undefined
            }
          />
        </Section>
      </ZoneBand>
    </>
  );
}
