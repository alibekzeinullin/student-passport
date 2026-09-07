"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { MonthlyProgressReview, StudentProfile } from "@/lib/types";
import {
  clampAttendanceOutOfTwo,
  clampPercent,
  createEmptyMonthlyProgressReview,
} from "@/lib/monthly-progress";
import { Section } from "@/components/ui/Section";
import { ZoneBand } from "@/components/ui/ZoneBand";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Field";

function ReadValue({ value, fallback = "—" }: { value: string; fallback?: string }) {
  const text = value.trim();
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy">
      {text || fallback}
    </p>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function MonthlyProgressReviewView({
  student,
  editable = false,
  onChange,
}: {
  student: StudentProfile;
  editable?: boolean;
  onChange?: (patch: Partial<StudentProfile>) => void;
}) {
  const reviews = student.monthlyProgressReviews ?? [];
  const [selectedId, setSelectedId] = useState(reviews[0]?.id ?? "");

  useEffect(() => {
    if (!reviews.some((r) => r.id === selectedId)) {
      setSelectedId(reviews[0]?.id ?? "");
    }
  }, [reviews, selectedId]);

  const selected =
    reviews.find((r) => r.id === selectedId) ?? reviews[0] ?? null;

  const commitReviews = (next: MonthlyProgressReview[]) => {
    onChange?.({ monthlyProgressReviews: next });
  };

  const updateSelected = (patch: Partial<MonthlyProgressReview>) => {
    if (!selected || !editable) return;
    commitReviews(
      reviews.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)),
    );
  };

  const addReview = () => {
    const next = createEmptyMonthlyProgressReview();
    commitReviews([next, ...reviews]);
    setSelectedId(next.id);
  };

  const removeSelected = () => {
    if (!selected || !editable) return;
    const next = reviews.filter((r) => r.id !== selected.id);
    commitReviews(next);
    setSelectedId(next[0]?.id ?? "");
  };

  if (!selected) {
    return (
      <ZoneBand tone="other">
        <Card>
          <CardBody className="space-y-4 text-center">
            <p className="text-sm text-muted">
              Пока нет Monthly Progress Review. Админ может создать первый обзор
              месяца.
            </p>
            {editable ? (
              <Button onClick={addReview}>Добавить обзор месяца</Button>
            ) : null}
          </CardBody>
        </Card>
      </ZoneBand>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <Label>Месяц обзора</Label>
          {reviews.length > 1 || editable ? (
            <select
              className="w-full min-w-0 rounded-md border border-light-gray bg-white px-3 py-2.5 text-base text-navy outline-none transition focus:border-navy focus:ring-2 focus:ring-gold/40 sm:max-w-xs sm:py-2 sm:text-sm"
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {reviews.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.monthYear || "Без названия"}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm font-medium text-navy">{selected.monthYear}</p>
          )}
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={addReview}>
              + Новый месяц
            </Button>
            <Button variant="secondary" onClick={removeSelected}>
              Удалить
            </Button>
          </div>
        ) : null}
      </div>

      <ZoneBand tone="other">
        <Section
          number="1"
          title="Основная информация"
          description="Месяц, посещаемость и выполнение"
        >
          <Card>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <FieldBlock label="Месяц и год (Month & Year)">
                {editable ? (
                  <Input
                    value={selected.monthYear}
                    onChange={(e) =>
                      updateSelected({ monthYear: e.target.value })
                    }
                    placeholder="Сентябрь 2026"
                  />
                ) : (
                  <ReadValue value={selected.monthYear} />
                )}
              </FieldBlock>

              <FieldBlock label="Homework Completion (0–100%)">
                {editable ? (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={selected.homeworkCompletion}
                    onChange={(e) =>
                      updateSelected({
                        homeworkCompletion: clampPercent(
                          Number(e.target.value),
                        ),
                      })
                    }
                  />
                ) : (
                  <ReadValue value={`${selected.homeworkCompletion}%`} />
                )}
              </FieldBlock>

              <FieldBlock label="Индивидуальные занятия (из 2)">
                {editable ? (
                  <Input
                    type="number"
                    min={0}
                    max={2}
                    value={selected.individualSessionsAttended ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        individualSessionsAttended: clampAttendanceOutOfTwo(
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                        ),
                      })
                    }
                    placeholder="0–2"
                  />
                ) : (
                  <ReadValue
                    value={
                      selected.individualSessionsAttended === null
                        ? ""
                        : `${selected.individualSessionsAttended} из 2`
                    }
                  />
                )}
              </FieldBlock>

              <FieldBlock label="Групповые занятия (из 2)">
                {editable ? (
                  <Input
                    type="number"
                    min={0}
                    max={2}
                    value={selected.groupSessionsAttended ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        groupSessionsAttended: clampAttendanceOutOfTwo(
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                        ),
                      })
                    }
                    placeholder="0–2"
                  />
                ) : (
                  <ReadValue
                    value={
                      selected.groupSessionsAttended === null
                        ? ""
                        : `${selected.groupSessionsAttended} из 2`
                    }
                  />
                )}
              </FieldBlock>
            </CardBody>
          </Card>
        </Section>
      </ZoneBand>

      <ZoneBand tone="growth">
        <Section
          number="2"
          title="Личное развитие"
          description="Personal Development / Soft Skills"
        >
          <Card>
            <CardBody className="space-y-4">
              <FieldBlock label="Фокус месяца">
                {editable ? (
                  <Input
                    value={selected.personalFocus}
                    onChange={(e) =>
                      updateSelected({ personalFocus: e.target.value })
                    }
                    placeholder="Тайм-менеджмент, коммуникация, самодисциплина…"
                  />
                ) : (
                  <ReadValue value={selected.personalFocus} />
                )}
              </FieldBlock>
              <FieldBlock label="Прогресс и заметки по личному развитию">
                {editable ? (
                  <Textarea
                    value={selected.personalProgressNotes}
                    onChange={(e) =>
                      updateSelected({ personalProgressNotes: e.target.value })
                    }
                  />
                ) : (
                  <ReadValue value={selected.personalProgressNotes} />
                )}
              </FieldBlock>
            </CardBody>
          </Card>
        </Section>
      </ZoneBand>

      <ZoneBand tone="academic">
        <Section
          number="3"
          title="Академический фокус"
          description="Academic Focus / Hard Skills"
        >
          <Card>
            <CardBody className="space-y-4">
              <FieldBlock label="Как идут дела с уроками (текущий статус)">
                {editable ? (
                  <Textarea
                    value={selected.academicStatus}
                    onChange={(e) =>
                      updateSelected({ academicStatus: e.target.value })
                    }
                  />
                ) : (
                  <ReadValue value={selected.academicStatus} />
                )}
              </FieldBlock>
              <FieldBlock label="Прогресс по проблемным урокам / предметам">
                {editable ? (
                  <Textarea
                    value={selected.problemSubjectsProgress}
                    onChange={(e) =>
                      updateSelected({
                        problemSubjectsProgress: e.target.value,
                      })
                    }
                  />
                ) : (
                  <ReadValue value={selected.problemSubjectsProgress} />
                )}
              </FieldBlock>
              <FieldBlock label="Академические навыки">
                {editable ? (
                  <Textarea
                    value={selected.academicSkills}
                    onChange={(e) =>
                      updateSelected({ academicSkills: e.target.value })
                    }
                    placeholder="Эссе, исследование, синтаксис…"
                  />
                ) : (
                  <ReadValue value={selected.academicSkills} />
                )}
              </FieldBlock>
            </CardBody>
          </Card>
        </Section>
      </ZoneBand>

      <ZoneBand tone="growth">
        <Section
          number="4"
          title="Портфолио"
          description="Portfolio & Projects"
        >
          <Card>
            <CardBody className="space-y-4">
              <FieldBlock label="Основной проект">
                {editable ? (
                  <Textarea
                    value={selected.mainProjectProgress}
                    onChange={(e) =>
                      updateSelected({ mainProjectProgress: e.target.value })
                    }
                  />
                ) : (
                  <ReadValue value={selected.mainProjectProgress} />
                )}
              </FieldBlock>
              <FieldBlock label="Параллельные активности">
                {editable ? (
                  <Textarea
                    value={selected.parallelActivities}
                    onChange={(e) =>
                      updateSelected({ parallelActivities: e.target.value })
                    }
                  />
                ) : (
                  <ReadValue value={selected.parallelActivities} />
                )}
              </FieldBlock>
            </CardBody>
          </Card>
        </Section>
      </ZoneBand>

      <ZoneBand tone="other">
        <Section
          number="5"
          title="Главные достижения месяца"
          description="Highlights"
        >
          <Card>
            <CardBody>
              <FieldBlock label="Ключевые успехи и победы">
                {editable ? (
                  <Textarea
                    value={selected.highlights}
                    onChange={(e) =>
                      updateSelected({ highlights: e.target.value })
                    }
                  />
                ) : (
                  <ReadValue value={selected.highlights} />
                )}
              </FieldBlock>
            </CardBody>
          </Card>
        </Section>

        <Section
          number="6"
          title="Точки роста"
          description="Growth Areas"
        >
          <Card>
            <CardBody>
              <FieldBlock label="Что улучшить в следующем месяце">
                {editable ? (
                  <Textarea
                    value={selected.growthAreas}
                    onChange={(e) =>
                      updateSelected({ growthAreas: e.target.value })
                    }
                  />
                ) : (
                  <ReadValue value={selected.growthAreas} />
                )}
              </FieldBlock>
            </CardBody>
          </Card>
        </Section>

        <Section
          number="7"
          title="Обратная связь и рефлексия"
          description="Feedback & Reflection"
        >
          <Card>
            <CardBody className="space-y-4">
              <FieldBlock label="Комментарий / обратная связь ментора">
                {editable ? (
                  <Textarea
                    value={selected.mentorFeedback}
                    onChange={(e) =>
                      updateSelected({ mentorFeedback: e.target.value })
                    }
                  />
                ) : (
                  <ReadValue value={selected.mentorFeedback} />
                )}
              </FieldBlock>
              <FieldBlock label="Рефлексия ученика (самооценка)">
                {editable ? (
                  <Textarea
                    value={selected.studentReflection}
                    onChange={(e) =>
                      updateSelected({ studentReflection: e.target.value })
                    }
                  />
                ) : (
                  <ReadValue value={selected.studentReflection} />
                )}
              </FieldBlock>
            </CardBody>
          </Card>
        </Section>
      </ZoneBand>
    </div>
  );
}
