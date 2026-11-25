"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { DEFAULT_FOLDERS, deleteLink, loadLinks, saveLink, type UsefulLink } from "@/lib/links";

/** Полезные ссылки курса по папкам. editable — добавлять, править и удалять. */
export function LinksBoard({ courseId, editable }: { courseId: string; editable: boolean }) {
  const [links, setLinks] = useState<UsefulLink[] | null>(null);
  const [editing, setEditing] = useState<(Partial<UsefulLink> & { course_id: string }) | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => setLinks(await loadLinks([courseId])), [courseId]);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  const run = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!links) return <p className="text-sm text-muted">Загрузка…</p>;
  const folders = Array.from(new Set(links.map((l) => l.folder)));
  const folderOptions = Array.from(new Set([...(DEFAULT_FOLDERS[courseId] ?? []), ...folders]));

  return (
    <div className="space-y-4">
      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setEditing({ course_id: courseId, folder: folderOptions[0] ?? "Разное", title: "", url: "", description: "" })}>
            + Добавить ссылку
          </Button>
          {error ? <span className="text-sm text-burgundy">{error}</span> : null}
        </div>
      ) : null}

      {editing ? (
        <LinkForm
          draft={editing}
          folders={folderOptions}
          onCancel={() => setEditing(null)}
          onSave={(d) =>
            run(async () => {
              await saveLink({ course_id: courseId, folder: d.folder ?? "Разное", title: d.title ?? "", url: d.url ?? "", description: d.description ?? "", id: d.id, sort: d.sort });
              setEditing(null);
            })
          }
        />
      ) : null}

      {folders.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {folders.map((f) => (
            <section key={f} className="sp-glass rounded-3xl border px-5 py-4">
              <h3 className="flex items-center gap-2 text-lg text-navy">
                <span aria-hidden>📁</span> {f}
              </h3>
              <ul className="mt-2 space-y-2">
                {links
                  .filter((l) => l.folder === f)
                  .map((l) => (
                    <li key={l.id} className="text-sm">
                      <a href={l.url} target="_blank" rel="noreferrer" className="font-semibold text-gold hover:underline">
                        {l.title}
                      </a>
                      {l.description ? <p className="text-muted">{l.description}</p> : null}
                      {editable ? (
                        <span className="flex gap-3 text-xs">
                          <button type="button" onClick={() => setEditing({ ...l })} className="text-navy hover:underline">
                            изменить
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              run(async () => {
                                if (!window.confirm(`Удалить ссылку «${l.title}»?`)) return;
                                await deleteLink(l.id);
                              })
                            }
                            className="text-burgundy hover:underline"
                          >
                            удалить
                          </button>
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-3xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted">
          {editable ? "Ссылок пока нет — добавьте первую." : "Ссылок пока нет."}
        </p>
      )}
    </div>
  );
}

function LinkForm({
  draft,
  folders,
  onSave,
  onCancel,
}: {
  draft: Partial<UsefulLink>;
  folders: string[];
  onSave: (d: Partial<UsefulLink>) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState(draft);
  return (
    <section className="sp-rise grid gap-3 rounded-3xl border border-gold/30 bg-gold/[0.04] px-5 py-5 sm:grid-cols-2">
      <div>
        <Label htmlFor="ln-folder">Папка</Label>
        <Input id="ln-folder" list="ln-folders" value={d.folder ?? ""} onChange={(e) => setD({ ...d, folder: e.target.value })} />
        <datalist id="ln-folders">
          {folders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
      <div>
        <Label htmlFor="ln-title">Название</Label>
        <Input id="ln-title" value={d.title ?? ""} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Cambridge IELTS 18 — тесты" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="ln-url">Ссылка</Label>
        <Input id="ln-url" value={d.url ?? ""} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://drive.google.com/…" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="ln-desc">Пояснение (по желанию)</Label>
        <Input id="ln-desc" value={d.description ?? ""} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Для 9–10 классов, решать по одному тесту в неделю" />
      </div>
      <div className="flex gap-3 sm:col-span-2">
        <Button type="button" disabled={!d.title?.trim() || !d.url?.trim()} onClick={() => onSave(d)}>
          Сохранить
        </Button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-navy">
          Отмена
        </button>
      </div>
    </section>
  );
}
