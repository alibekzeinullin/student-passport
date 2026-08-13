"use client";

import type { Project, ProjectStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Field";

const STATUSES: ProjectStatus[] = [
  "Идея",
  "В работе",
  "Завершён",
  "На паузе",
];

interface ProjectsGridProps {
  projects: Project[];
  editable?: boolean;
  onChange?: (projects: Project[]) => void;
}

export function ProjectsGrid({
  projects,
  editable = false,
  onChange,
}: ProjectsGridProps) {
  const updateProject = (id: string, patch: Partial<Project>) => {
    if (!onChange) return;
    onChange(
      projects.map((project) =>
        project.id === id ? { ...project, ...patch } : project,
      ),
    );
  };

  const addProject = () => {
    if (!onChange) return;
    onChange([
      ...projects,
      {
        id: `p-${Date.now()}`,
        title: "",
        role: "",
        description: "",
        status: "Идея",
        impactMetrics: "",
      },
    ]);
  };

  const removeProject = (id: string) => {
    if (!onChange) return;
    onChange(projects.filter((project) => project.id !== id));
  };

  return (
    <div className="space-y-4">
      {editable ? (
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={addProject}>
            Добавить проект
          </Button>
        </div>
      ) : null}

      {projects.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-muted">
            Проекты пока не добавлены
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id} className="overflow-hidden">
              <div className="border-b border-gold/40 bg-navy px-5 py-3 text-white">
                {editable ? (
                  <div className="space-y-2">
                    <Input
                      value={project.title}
                      placeholder="Название проекта"
                      onChange={(e) =>
                        updateProject(project.id, { title: e.target.value })
                      }
                      className="border-light-gray bg-white text-navy"
                    />
                    <Input
                      value={project.role}
                      placeholder="Роль"
                      onChange={(e) =>
                        updateProject(project.id, { role: e.target.value })
                      }
                      className="border-light-gray bg-white text-navy"
                    />
                  </div>
                ) : (
                  <>
                    <h3 className="text-base font-semibold">{project.title}</h3>
                    <p className="mt-1 text-sm text-gold">{project.role}</p>
                  </>
                )}
              </div>
              <CardBody className="space-y-3">
                {editable ? (
                  <>
                    <Textarea
                      value={project.description}
                      placeholder="Краткое описание"
                      onChange={(e) =>
                        updateProject(project.id, {
                          description: e.target.value,
                        })
                      }
                    />
                    <Select
                      value={project.status}
                      onChange={(e) =>
                        updateProject(project.id, {
                          status: e.target.value as ProjectStatus,
                        })
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={project.impactMetrics}
                      placeholder="Метрики импакта"
                      onChange={(e) =>
                        updateProject(project.id, {
                          impactMetrics: e.target.value,
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => removeProject(project.id)}
                    >
                      Удалить проект
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-muted">
                      {project.description}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-burgundy/10 px-2 py-1 font-medium text-burgundy">
                        {project.status}
                      </span>
                      <span className="rounded bg-gold/20 px-2 py-1 text-navy">
                        {project.impactMetrics}
                      </span>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
