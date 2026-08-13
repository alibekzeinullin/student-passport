import type { Skill } from "./types";

export const DEFAULT_SKILL_NAMES = [
  "Тайм-менеджмент и самодисциплина",
  "Навыки коммуникации и самопрезентация",
  "Лидерство и работа в команде",
  "Навык написания Эссе",
  "Цифровая гигиена",
] as const;

export function createDefaultSkills(prefix: string): Skill[] {
  return DEFAULT_SKILL_NAMES.map((name, index) => ({
    id: `${prefix}-skill-${index + 1}`,
    name,
    status: "К освоению",
    notes: "",
  }));
}

export function ensureDefaultSkills(prefix: string, skills: Skill[] = []): Skill[] {
  const extras = skills.filter(
    (skill) =>
      !DEFAULT_SKILL_NAMES.some(
        (name) => name.toLowerCase() === skill.name.trim().toLowerCase(),
      ),
  );

  const defaults = DEFAULT_SKILL_NAMES.map((name, index) => {
    const existing = skills.find(
      (skill) => skill.name.trim().toLowerCase() === name.toLowerCase(),
    );
    return (
      existing ?? {
        id: `${prefix}-skill-${index + 1}`,
        name,
        status: "К освоению" as const,
        notes: "",
      }
    );
  });

  return [...defaults, ...extras];
}
