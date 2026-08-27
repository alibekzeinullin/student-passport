"use client";

import type { StudentProfile } from "@/lib/types";
import type { ReportType } from "@/lib/report-types";
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
import { Section } from "@/components/ui/Section";
import { ZoneBand } from "@/components/ui/ZoneBand";
import { TermLabel } from "@/components/ui/TermHint";

export function StudentReportView({
  student,
  reportType,
}: {
  student: StudentProfile;
  reportType: ReportType;
}) {
  if (reportType === "short") {
    return (
      <>
        <ZoneBand tone="other">
          <ProfileHeader student={student} showMentorNote={false} />
          <MentorSummaryBlock summary={student.mentorSummary} />
          <ScoreCircles student={student} />
        </ZoneBand>

        <ZoneBand tone="other">
          <Section
            number="1"
            title="Личные ежемесячные фокусы"
            description="Индивидуальные приоритеты ученика на каждый месяц"
          >
            <MonthlyFocuses focuses={student.monthlyFocuses} />
          </Section>

          <Section
            number="2"
            title="Спринты по групповой работе"
            description="Задачи группового спринта и артефакты"
          >
            <SprintTasksTable tasks={student.sprintTasks} />
          </Section>
        </ZoneBand>
      </>
    );
  }

  return (
    <>
      <ZoneBand tone="other">
        <ProfileHeader student={student} />
        <MentorSummaryBlock summary={student.mentorSummary} />
        <ScoreCircles student={student} />
      </ZoneBand>

      <ZoneBand tone="academic">
        <Section
          number="1"
          title="Академическая динамика"
          description="GPA, SAT/IELTS и академическая активность"
        >
          <div className="space-y-4">
            <GpaTable gpa={student.gpa} />
            <TestScoresCard scores={student.testScores} />
            <AcademicActivityTable activities={student.academicActivities} />
          </div>
        </Section>
      </ZoneBand>

      <ZoneBand tone="other">
        <Section
          number="2"
          title="Личные ежемесячные фокусы"
          description="Индивидуальные приоритеты ученика на каждый месяц"
        >
          <MonthlyFocuses focuses={student.monthlyFocuses} />
        </Section>

        <Section
          number="3"
          title="Спринты по групповой работе"
          description="Задачи группового спринта и артефакты"
        >
          <SprintTasksTable tasks={student.sprintTasks} />
        </Section>
      </ZoneBand>

      <ZoneBand tone="growth">
        <Section
          number="4"
          title={
            <TermLabel term="Extracurricular">Внеучебная деятельность</TermLabel>
          }
          description="Extracurricular Activities — проекты, роли и метрики импакта"
        >
          <ProjectsGrid projects={student.projects} />
        </Section>

        <Section number="5" title="Книги" description="Книги к прочтению">
          <BooksTable books={student.books} />
        </Section>

        <Section number="6" title="Навыки" description="Навыки для освоения">
          <SkillsTable skills={student.skills} />
        </Section>
      </ZoneBand>

      <ZoneBand tone="other">
        <Section
          number="7"
          title="Зоны роста"
          description="Что нужно улучшить — заполняет ментор"
        >
          <GrowthZonesBlock zones={student.growthZones} />
        </Section>
      </ZoneBand>
    </>
  );
}
