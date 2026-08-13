"use client";

import type { SprintTask } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";

interface SprintTasksTableProps {
  tasks: SprintTask[];
  canEditMeta?: boolean;
  canToggleCompletion?: boolean;
  canEditArtifacts?: boolean;
  onChange?: (tasks: SprintTask[]) => void;
}

export function SprintTasksTable({
  tasks,
  canEditMeta = false,
  canToggleCompletion = false,
  canEditArtifacts = false,
  onChange,
}: SprintTasksTableProps) {
  const update = (id: string, patch: Partial<SprintTask>) => {
    if (!onChange) return;
    onChange(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const addTask = () => {
    if (!onChange) return;
    onChange([
      ...tasks,
      {
        id: `sp-${Date.now()}`,
        sprintLabel: "",
        title: "",
        completed: false,
        artifactNotion: "",
        artifactDocs: "",
        artifactDrive: "",
      },
    ]);
  };

  const removeTask = (id: string) => {
    if (!onChange) return;
    onChange(tasks.filter((t) => t.id !== id));
  };

  return (
    <Card>
      <CardHeader
        title="Спринты по групповой работе"
        subtitle="Задачи группового спринта: ученик отмечает выполнение и прикрепляет ссылки на артефакты"
        action={
          canEditMeta ? (
            <Button type="button" variant="secondary" onClick={addTask}>
              Добавить задачу
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Задачи спринта пока не назначены
          </p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-md border border-light-gray bg-[#fafafa] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {canEditMeta ? (
                    <div className="space-y-2">
                      <Input
                        value={task.sprintLabel}
                        placeholder="Спринт, напр. Спринт 1 — Август"
                        onChange={(e) =>
                          update(task.id, { sprintLabel: e.target.value })
                        }
                      />
                      <Input
                        value={task.title}
                        placeholder="Название задачи"
                        onChange={(e) =>
                          update(task.id, { title: e.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-burgundy">
                        {task.sprintLabel || "Спринт"}
                      </p>
                      <p className="mt-1 font-medium text-navy">{task.title}</p>
                    </>
                  )}
                </div>

                {canToggleCompletion ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-navy">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={(e) =>
                        update(task.id, { completed: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-light-gray accent-burgundy"
                    />
                    Выполнено
                  </label>
                ) : (
                  <span
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      task.completed
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-light-gray/60 text-muted"
                    }`}
                  >
                    {task.completed ? "Выполнено" : "В работе"}
                  </span>
                )}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["artifactNotion", "Notion"],
                    ["artifactDocs", "Google Docs"],
                    ["artifactDrive", "Google Drive"],
                  ] as const
                ).map(([key, label]) =>
                  canEditArtifacts ? (
                    <Input
                      key={key}
                      value={task[key]}
                      placeholder={`Ссылка ${label}`}
                      onChange={(e) => update(task.id, { [key]: e.target.value })}
                    />
                  ) : task[key] ? (
                    <a
                      key={key}
                      href={task[key]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm text-burgundy underline-offset-2 hover:underline"
                    >
                      {label}
                    </a>
                  ) : null,
                )}
              </div>

              {canEditMeta ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => removeTask(task.id)}
                  >
                    Удалить
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}
