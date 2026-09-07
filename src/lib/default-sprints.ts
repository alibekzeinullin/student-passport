import type { SprintTask } from "./types";

export const DEFAULT_SPRINT_DEFS = [
  {
    key: "jul-aug-2026",
    sprintLabel: "Июль–август 2026",
    title: "Time management",
  },
  {
    key: "sep-oct-2026",
    sprintLabel: "Сентябрь–октябрь 2026",
    title: "Writing skills",
  },
  {
    key: "oct-nov-2026",
    sprintLabel: "Октябрь–ноябрь 2026",
    title: "Public speaking and leadership",
  },
  {
    key: "dec-2026",
    sprintLabel: "Декабрь 2026",
    title: "Data and technology",
  },
] as const;

export function createDefaultSprintTasks(prefix: string): SprintTask[] {
  return DEFAULT_SPRINT_DEFS.map((sprint, index) => ({
    id: `${prefix}-sp-${sprint.key}`,
    sprintLabel: sprint.sprintLabel,
    title: sprint.title,
    completed: false,
    artifactNotion: "",
    artifactDocs: "",
    artifactDrive: "",
  }));
}

function matchesDefault(task: SprintTask, title: string, label: string) {
  const t = task.title.trim().toLowerCase();
  const l = task.sprintLabel.trim().toLowerCase();
  return (
    t === title.toLowerCase() ||
    l === label.toLowerCase() ||
    (t.includes(title.toLowerCase()) && l.includes(label.split("–")[0].toLowerCase().slice(0, 4)))
  );
}

/** Общие спринты программы: сохраняем прогресс/артефакты, если уже есть. */
export function ensureDefaultSprintTasks(
  prefix: string,
  tasks: SprintTask[] = [],
): SprintTask[] {
  const defaults = DEFAULT_SPRINT_DEFS.map((sprint, index) => {
    const existing = tasks.find((task) =>
      matchesDefault(task, sprint.title, sprint.sprintLabel),
    );
    if (existing) {
      return {
        ...existing,
        sprintLabel: sprint.sprintLabel,
        title: sprint.title,
      };
    }
    return {
      id: `${prefix}-sp-${sprint.key}`,
      sprintLabel: sprint.sprintLabel,
      title: sprint.title,
      completed: false,
      artifactNotion: "",
      artifactDocs: "",
      artifactDrive: "",
    };
  });

  const extras = tasks.filter(
    (task) =>
      !DEFAULT_SPRINT_DEFS.some((sprint) =>
        matchesDefault(task, sprint.title, sprint.sprintLabel),
      ),
  );

  return [...defaults, ...extras];
}
