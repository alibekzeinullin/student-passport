"use client";

import type { ReactNode } from "react";
import type {
  ExtracurricularStatus,
  FutureGoalStatus,
  SoftSkillStage,
  StudentProfile,
  VisionExamTarget,
  VisionExtracurricularGoal,
  VisionFutureGoal,
  VisionMap,
  VisionProjectGoal,
  VisionProjectStage,
  VisionSoftSkillGoal,
} from "@/lib/types";
import {
  EXTRACURRICULAR_STATUSES,
  FUTURE_GOAL_STATUSES,
  MAX_FUTURE_GOALS,
  MAX_VISION_PROJECTS,
  MAX_VISION_SOFT_SKILLS,
  SOFT_SKILL_STAGE_LABELS,
  SOFT_SKILL_STAGES,
  VISION_PROJECT_STAGES,
  calculateYearlyProgress,
  createEmptyVisionExamTarget,
  createEmptyVisionExtracurricularGoal,
  createEmptyVisionProjectGoal,
  createEmptyVisionSoftSkillGoal,
  getCurrentGpa,
  gpaProgressPercent,
  normalizeVisionMap,
} from "@/lib/vision-map";
import { Section } from "@/components/ui/Section";
import { ZoneBand } from "@/components/ui/ZoneBand";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ProgressBar({ value, tone = "navy" }: { value: number; tone?: "navy" | "burgundy" | "gold" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const fill =
    tone === "burgundy"
      ? "bg-burgundy"
      : tone === "gold"
        ? "bg-gold"
        : "bg-navy";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>Progress</span>
        <span className="text-navy">{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-light-gray/70">
        <div
          className={`h-full rounded-full transition-all ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "navy" | "burgundy" | "gold" | "done";
}) {
  const styles: Record<string, string> = {
    muted: "bg-light-gray/50 text-muted",
    navy: "bg-navy/10 text-navy",
    burgundy: "bg-burgundy/10 text-burgundy",
    gold: "bg-gold/30 text-navy",
    done: "bg-emerald-50 text-emerald-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide ${styles[tone]}`}
    >
      {label}
    </span>
  );
}

function projectBadgeTone(stage: VisionProjectStage) {
  if (stage === "Completed") return "done" as const;
  if (stage === "Testing") return "gold" as const;
  if (stage === "In Progress") return "navy" as const;
  return "muted" as const;
}

function extraBadgeTone(status: ExtracurricularStatus) {
  if (status === "Achieved") return "done" as const;
  if (status === "Active") return "navy" as const;
  return "muted" as const;
}

function RatingStars({
  value,
  editable,
  onChange,
}: {
  value: number;
  editable?: boolean;
  onChange?: (rating: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;
        if (!editable) {
          return (
            <span
              key={star}
              className={`text-lg leading-none ${active ? "text-gold" : "text-light-gray"}`}
              aria-hidden
            >
              ★
            </span>
          );
        }
        return (
          <button
            key={star}
            type="button"
            className={`text-lg leading-none transition ${active ? "text-gold" : "text-light-gray hover:text-gold/70"}`}
            onClick={() => onChange?.(star)}
            aria-label={`${star} из 5`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function ProgressWheel({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const size = 140;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative mx-auto flex h-[140px] w-[140px] items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#d1d1d1"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#7f2231"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-semibold text-navy">{pct}%</p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Year Progress
        </p>
      </div>
    </div>
  );
}

function ReadText({ value }: { value: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy">
      {value.trim() || "—"}
    </p>
  );
}

export function VisionMapView({
  student,
  editable = false,
  onChange,
}: {
  student: StudentProfile;
  editable?: boolean;
  onChange?: (patch: Partial<StudentProfile>) => void;
}) {
  const vision: VisionMap = normalizeVisionMap(student.visionMap);
  const currentGpa = getCurrentGpa(student.gpa);
  const gpaPct = gpaProgressPercent(currentGpa, vision.targetGpa);
  const yearlyPct = calculateYearlyProgress(vision, currentGpa);

  const commit = (patch: Partial<VisionMap>) => {
    onChange?.({ visionMap: { ...vision, ...patch } });
  };

  const updateExam = (id: string, patch: Partial<VisionExamTarget>) => {
    commit({
      examTargets: vision.examTargets.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  };

  const updateProject = (id: string, patch: Partial<VisionProjectGoal>) => {
    commit({
      projects: vision.projects.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  };

  const updateSoftSkill = (id: string, patch: Partial<VisionSoftSkillGoal>) => {
    commit({
      softSkills: vision.softSkills.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  };

  const updateExtra = (
    id: string,
    patch: Partial<VisionExtracurricularGoal>,
  ) => {
    commit({
      extracurriculars: vision.extracurriculars.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  };

  const updateFutureGoal = (
    kind: "academic" | "other",
    id: string,
    patch: Partial<VisionFutureGoal>,
  ) => {
    if (kind === "academic") {
      commit({
        futureAcademicGoals: vision.futureAcademicGoals.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      });
      return;
    }
    commit({
      futureOtherGoals: vision.futureOtherGoals.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  };

  const renderFutureGoalList = (
    kind: "academic" | "other",
    goals: VisionFutureGoal[],
    title: string,
  ) => (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-navy">{title}</h3>
          <span className="text-xs text-muted">
            {goals.filter((g) => g.text.trim()).length}/{MAX_FUTURE_GOALS}
          </span>
        </div>
        <div className="space-y-3">
          {goals.map((goal, index) => (
            <div
              key={goal.id}
              className="rounded-md border border-light-gray bg-[#fafafa] p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Цель {index + 1}
                </p>
                <StatusBadge
                  label={goal.status}
                  tone={
                    goal.status === "Done"
                      ? "done"
                      : goal.status === "In Progress"
                        ? "navy"
                        : "muted"
                  }
                />
              </div>
              {editable ? (
                <div className="space-y-2">
                  <Input
                    value={goal.text}
                    onChange={(e) =>
                      updateFutureGoal(kind, goal.id, { text: e.target.value })
                    }
                    placeholder={
                      kind === "academic"
                        ? "Например: GPA 4.0 / IELTS 7.5 / олимпиада…"
                        : "Например: лидерство, проект, волонтёрство…"
                    }
                  />
                  <Select
                    value={goal.status}
                    onChange={(e) =>
                      updateFutureGoal(kind, goal.id, {
                        status: e.target.value as FutureGoalStatus,
                      })
                    }
                  >
                    {FUTURE_GOAL_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-navy">
                  {goal.text.trim() || "—"}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header + Year Progress */}
      <ZoneBand tone="other">
        <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
          <Card className="border-gold/40">
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldBlock label="Учебный год (Academic Year)">
                  {editable ? (
                    <Input
                      value={vision.academicYear}
                      onChange={(e) =>
                        commit({ academicYear: e.target.value })
                      }
                      placeholder="2026–2027"
                    />
                  ) : (
                    <p className="text-lg font-semibold text-navy">
                      {vision.academicYear || "—"}
                    </p>
                  )}
                </FieldBlock>
                <div className="rounded-md bg-navy/5 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Goal Dashboard
                  </p>
                  <p className="mt-1 text-sm text-navy">
                    Долгосрочное планирование и трекинг целей учебного года
                  </p>
                </div>
              </div>
              <FieldBlock label="Главный девиз / Фокус года (Yearly Focus)">
                {editable ? (
                  <Textarea
                    value={vision.yearlyFocus}
                    onChange={(e) => commit({ yearlyFocus: e.target.value })}
                    placeholder="Одно вдохновляющее предложение или ключевая цель года"
                  />
                ) : (
                  <p className="text-base font-medium italic leading-relaxed text-navy">
                    {vision.yearlyFocus.trim()
                      ? `“${vision.yearlyFocus.trim()}”`
                      : "—"}
                  </p>
                )}
              </FieldBlock>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col items-center justify-center gap-2 py-5">
              <ProgressWheel value={yearlyPct} />
              <p className="text-center text-xs text-muted">
                Overall Year Progress
              </p>
            </CardBody>
          </Card>
        </div>
      </ZoneBand>

      {/* Academic Goals */}
      <ZoneBand tone="academic">
        <Section
          number="1"
          title="Академические цели"
          description="Academic Goals — GPA и целевые экзамены / сертификаты"
        >
          <div className="space-y-4">
            <Card>
              <CardBody className="grid gap-4 sm:grid-cols-3">
                <FieldBlock label="Целевой GPA (Target GPA)">
                  {editable ? (
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      step={0.01}
                      value={vision.targetGpa ?? ""}
                      onChange={(e) =>
                        commit({
                          targetGpa:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      placeholder="5.0"
                    />
                  ) : (
                    <p className="text-xl font-semibold text-navy">
                      {vision.targetGpa ?? "—"}
                    </p>
                  )}
                </FieldBlock>
                <div>
                  <Label>Текущий GPA</Label>
                  <p className="text-xl font-semibold text-navy">
                    {currentGpa === null ? "—" : currentGpa.toFixed(2)}
                  </p>
                </div>
                <div>
                  <Label>Прогресс к цели</Label>
                  {gpaPct === null ? (
                    <p className="text-sm text-muted">Задайте target GPA</p>
                  ) : (
                    <ProgressBar value={gpaPct} tone="burgundy" />
                  )}
                </div>
              </CardBody>
            </Card>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy">
                  Целевые экзамены / сертификаты
                </p>
                {editable ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      commit({
                        examTargets: [
                          ...vision.examTargets,
                          createEmptyVisionExamTarget(),
                        ],
                      })
                    }
                  >
                    + Экзамен
                  </Button>
                ) : null}
              </div>

              {vision.examTargets.length === 0 ? (
                <Card>
                  <CardBody>
                    <p className="text-sm text-muted">
                      IELTS, SAT, AP, олимпиады — ещё не добавлены.
                    </p>
                  </CardBody>
                </Card>
              ) : (
                vision.examTargets.map((exam) => (
                  <Card key={exam.id}>
                    <CardBody className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
                      {editable ? (
                        <>
                          <FieldBlock label="Название">
                            <Input
                              value={exam.name}
                              onChange={(e) =>
                                updateExam(exam.id, { name: e.target.value })
                              }
                              placeholder="IELTS / SAT / AP…"
                            />
                          </FieldBlock>
                          <FieldBlock label="Целевой балл">
                            <Input
                              value={exam.targetScore}
                              onChange={(e) =>
                                updateExam(exam.id, {
                                  targetScore: e.target.value,
                                })
                              }
                              placeholder="7.5 / 1500"
                            />
                          </FieldBlock>
                          <FieldBlock label="Дедлайн">
                            <Input
                              value={exam.deadline}
                              onChange={(e) =>
                                updateExam(exam.id, {
                                  deadline: e.target.value,
                                })
                              }
                              placeholder="Март 2027"
                            />
                          </FieldBlock>
                          <div className="flex items-end">
                            <Button
                              variant="secondary"
                              onClick={() =>
                                commit({
                                  examTargets: vision.examTargets.filter(
                                    (item) => item.id !== exam.id,
                                  ),
                                })
                              }
                            >
                              Удалить
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="font-medium text-navy">
                              {exam.name || "—"}
                            </p>
                            <p className="text-xs text-muted">Exam / Certificate</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted">Target</p>
                            <p className="font-semibold text-navy">
                              {exam.targetScore || "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted">Deadline</p>
                            <p className="font-semibold text-navy">
                              {exam.deadline || "—"}
                            </p>
                          </div>
                        </>
                      )}
                    </CardBody>
                  </Card>
                ))
              )}
            </div>
          </div>
        </Section>
      </ZoneBand>

      {/* Projects */}
      <ZoneBand tone="growth">
        <Section
          number="2"
          title="Проекты и портфолио"
          description="Projects & Portfolio — до 3 ключевых проектов за год"
        >
          <div className="space-y-3">
            {vision.projects.length === 0 ? (
              <Card>
                <CardBody>
                  <p className="text-sm text-muted">Проекты ещё не добавлены.</p>
                </CardBody>
              </Card>
            ) : (
              vision.projects.map((project, index) => (
                <Card key={project.id}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Проект {index + 1} / {MAX_VISION_PROJECTS}
                      </p>
                      <StatusBadge
                        label={project.stage}
                        tone={projectBadgeTone(project.stage)}
                      />
                    </div>

                    {editable ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <FieldBlock label="Название">
                            <Input
                              value={project.title}
                              onChange={(e) =>
                                updateProject(project.id, {
                                  title: e.target.value,
                                })
                              }
                            />
                          </FieldBlock>
                          <FieldBlock label="Этап">
                            <Select
                              value={project.stage}
                              onChange={(e) =>
                                updateProject(project.id, {
                                  stage: e.target.value as VisionProjectStage,
                                })
                              }
                            >
                              {VISION_PROJECT_STAGES.map((stage) => (
                                <option key={stage} value={stage}>
                                  {stage}
                                </option>
                              ))}
                            </Select>
                          </FieldBlock>
                        </div>
                        <FieldBlock label="Краткое описание">
                          <Textarea
                            value={project.description}
                            onChange={(e) =>
                              updateProject(project.id, {
                                description: e.target.value,
                              })
                            }
                          />
                        </FieldBlock>
                        <FieldBlock label="Готовность (0–100%)">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={project.progress}
                            onChange={(e) =>
                              updateProject(project.id, {
                                progress: Math.max(
                                  0,
                                  Math.min(100, Number(e.target.value) || 0),
                                ),
                              })
                            }
                          />
                        </FieldBlock>
                        <ProgressBar value={project.progress} />
                        <FieldBlock label="Ключевой результат (Deliverable)">
                          <Input
                            value={project.deliverable}
                            onChange={(e) =>
                              updateProject(project.id, {
                                deliverable: e.target.value,
                              })
                            }
                          />
                        </FieldBlock>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            commit({
                              projects: vision.projects.filter(
                                (item) => item.id !== project.id,
                              ),
                            })
                          }
                        >
                          Удалить проект
                        </Button>
                      </>
                    ) : (
                      <>
                        <h3 className="text-lg font-semibold text-navy">
                          {project.title || "—"}
                        </h3>
                        <ReadText value={project.description} />
                        <ProgressBar value={project.progress} />
                        <p className="text-sm text-navy">
                          <span className="font-semibold">Deliverable:</span>{" "}
                          {project.deliverable.trim() || "—"}
                        </p>
                      </>
                    )}
                  </CardBody>
                </Card>
              ))
            )}

            {editable && vision.projects.length < MAX_VISION_PROJECTS ? (
              <Button
                variant="secondary"
                onClick={() =>
                  commit({
                    projects: [
                      ...vision.projects,
                      createEmptyVisionProjectGoal(),
                    ],
                  })
                }
              >
                + Добавить проект ({vision.projects.length}/{MAX_VISION_PROJECTS})
              </Button>
            ) : null}
          </div>
        </Section>
      </ZoneBand>

      {/* Soft Skills */}
      <ZoneBand tone="growth">
        <Section
          number="3"
          title="Личное развитие и Soft Skills"
          description="Personal Growth — 2–3 ключевых навыка на год"
        >
          <div className="space-y-3">
            {vision.softSkills.length === 0 ? (
              <Card>
                <CardBody>
                  <p className="text-sm text-muted">Навыки ещё не добавлены.</p>
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {vision.softSkills.map((skill) => (
                  <Card key={skill.id}>
                    <CardBody className="space-y-3">
                      {editable ? (
                        <>
                          <FieldBlock label="Навык">
                            <Input
                              value={skill.name}
                              onChange={(e) =>
                                updateSoftSkill(skill.id, {
                                  name: e.target.value,
                                })
                              }
                              placeholder="Публичные выступления…"
                            />
                          </FieldBlock>
                          <FieldBlock label="Этап">
                            <Select
                              value={skill.stage}
                              onChange={(e) =>
                                updateSoftSkill(skill.id, {
                                  stage: e.target.value as SoftSkillStage,
                                })
                              }
                            >
                              {SOFT_SKILL_STAGES.map((stage) => (
                                <option key={stage} value={stage}>
                                  {SOFT_SKILL_STAGE_LABELS[stage]}
                                </option>
                              ))}
                            </Select>
                          </FieldBlock>
                          <div>
                            <Label>Оценка 1–5</Label>
                            <RatingStars
                              value={skill.rating}
                              editable
                              onChange={(rating) =>
                                updateSoftSkill(skill.id, { rating })
                              }
                            />
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              commit({
                                softSkills: vision.softSkills.filter(
                                  (item) => item.id !== skill.id,
                                ),
                              })
                            }
                          >
                            Удалить
                          </Button>
                        </>
                      ) : (
                        <>
                          <h3 className="font-semibold text-navy">
                            {skill.name || "—"}
                          </h3>
                          <StatusBadge
                            label={SOFT_SKILL_STAGE_LABELS[skill.stage]}
                            tone={
                              skill.stage === "mastered"
                                ? "done"
                                : skill.stage === "practicing"
                                  ? "navy"
                                  : "muted"
                            }
                          />
                          <RatingStars value={skill.rating} />
                        </>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}

            {editable && vision.softSkills.length < MAX_VISION_SOFT_SKILLS ? (
              <Button
                variant="secondary"
                onClick={() =>
                  commit({
                    softSkills: [
                      ...vision.softSkills,
                      createEmptyVisionSoftSkillGoal(),
                    ],
                  })
                }
              >
                + Навык ({vision.softSkills.length}/{MAX_VISION_SOFT_SKILLS})
              </Button>
            ) : null}
          </div>
        </Section>
      </ZoneBand>

      {/* Extracurricular */}
      <ZoneBand tone="other">
        <Section
          number="4"
          title="Внеклассная активность и достижения"
          description="Extracurricular & Milestones"
        >
          <div className="space-y-3">
            {editable ? (
              <Button
                variant="secondary"
                onClick={() =>
                  commit({
                    extracurriculars: [
                      ...vision.extracurriculars,
                      createEmptyVisionExtracurricularGoal(),
                    ],
                  })
                }
              >
                + Активность
              </Button>
            ) : null}

            {vision.extracurriculars.length === 0 ? (
              <Card>
                <CardBody>
                  <p className="text-sm text-muted">
                    Соревнования, стажировки, волонтёрство, клубы — пока пусто.
                  </p>
                </CardBody>
              </Card>
            ) : (
              vision.extracurriculars.map((item) => (
                <Card key={item.id}>
                  <CardBody className="grid gap-3 sm:grid-cols-[1.4fr_0.8fr_0.7fr_auto]">
                    {editable ? (
                      <>
                        <FieldBlock label="Цель">
                          <Input
                            value={item.goal}
                            onChange={(e) =>
                              updateExtra(item.id, { goal: e.target.value })
                            }
                          />
                        </FieldBlock>
                        <FieldBlock label="Планируемый срок">
                          <Input
                            value={item.plannedDate}
                            onChange={(e) =>
                              updateExtra(item.id, {
                                plannedDate: e.target.value,
                              })
                            }
                            placeholder="Ноябрь 2026"
                          />
                        </FieldBlock>
                        <FieldBlock label="Статус">
                          <Select
                            value={item.status}
                            onChange={(e) =>
                              updateExtra(item.id, {
                                status: e.target
                                  .value as ExtracurricularStatus,
                              })
                            }
                          >
                            {EXTRACURRICULAR_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </Select>
                        </FieldBlock>
                        <div className="flex items-end">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              commit({
                                extracurriculars: vision.extracurriculars.filter(
                                  (row) => row.id !== item.id,
                                ),
                              })
                            }
                          >
                            Удалить
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-navy">
                          {item.goal || "—"}
                        </p>
                        <p className="text-sm text-muted">
                          {item.plannedDate || "—"}
                        </p>
                        <StatusBadge
                          label={item.status}
                          tone={extraBadgeTone(item.status)}
                        />
                      </>
                    )}
                  </CardBody>
                </Card>
              ))
            )}
          </div>
        </Section>
      </ZoneBand>

      {/* Future Review */}
      <ZoneBand tone="other">
        <Section
          number="5"
          title="Future Review"
          description="Цели на год: 5 академических и 5 остальных"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {renderFutureGoalList(
              "academic",
              vision.futureAcademicGoals,
              "Академические цели (5)",
            )}
            {renderFutureGoalList(
              "other",
              vision.futureOtherGoals,
              "Остальные цели (5)",
            )}
          </div>
        </Section>
      </ZoneBand>
    </div>
  );
}
