"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { VoiceButton, appendText } from "@/components/ui/VoiceButton";
import {
  TEMPLATE_KIND_LABELS,
  deleteTemplate,
  fetchTemplates,
  peekTemplates,
  saveTemplate,
  type MeetingTemplate,
  type TemplateKind,
} from "@/lib/templates";

const KINDS: TemplateKind[] = ["plan", "summary", "homework"];

export default function TemplatesPage() {
  const [list, setList] = useState<MeetingTemplate[]>(() => peekTemplates() ?? []);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<(Omit<MeetingTemplate, "id"> & { id?: string }) | null>(null);

  const reload = useCallback(
    () =>
      fetchTemplates().then(
        (l) => {
          setList(l);
          setError("");
        },
        (err: unknown) => {
          console.error(err);
          setError("Шаблоны ещё не подключены: выполните supabase/setup-all.sql в Supabase → SQL Editor.");
        },
      ),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async () => {
    if (!editing || !editing.title.trim() || !editing.body.trim()) return;
    try {
      await saveTemplate(editing);
      setEditing(null);
      await reload();
    } catch (err) {
      console.error(err);
      setError("Не удалось сохранить шаблон.");
    }
  };

  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Шаблоны встреч</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Заготовки для журнала</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            В форме встречи над полями «План», «Что обсудили» и «Домашнее задание» есть кнопка «Шаблоны» — нажали на заготовку, и текст подставился. Рядом кнопка «Голосом» — можно надиктовать.
          </p>
        </div>

        {error ? <p className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</p> : null}

        {editing ? (
          <section className="sp-glass sp-rise space-y-3 rounded-3xl border border-gold/30 px-5 py-5">
            <p className="text-sm text-gold">
              {editing.id ? "Изменить" : "Новый"} шаблон · {TEMPLATE_KIND_LABELS[editing.kind]}
            </p>
            <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Короткое название кнопки" aria-label="Название" />
            <div className="flex justify-end">
              <VoiceButton onText={(t) => setEditing((ed) => (ed ? { ...ed, body: appendText(ed.body, t) } : ed))} />
            </div>
            <Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} className="!min-h-32" placeholder="Текст, который подставится" aria-label="Текст" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!editing.title.trim() || !editing.body.trim()} onClick={() => void save()}>
                Сохранить
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Отмена
              </Button>
              {editing.id ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    if (!editing.id || !window.confirm("Удалить шаблон?")) return;
                    void deleteTemplate(editing.id).then(() => {
                      setEditing(null);
                      return reload();
                    });
                  }}
                >
                  Удалить
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-3">
          {KINDS.map((kind) => {
            const items = list.filter((t) => t.kind === kind);
            return (
              <section key={kind} className="sp-glass flex flex-col rounded-3xl border px-4 py-4">
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h3 className="text-sm font-medium text-navy">{TEMPLATE_KIND_LABELS[kind]}</h3>
                  <button
                    type="button"
                    onClick={() => setEditing({ kind, title: "", body: "", sort: (items.at(-1)?.sort ?? 0) + 1 })}
                    className="text-xs text-gold hover:underline"
                  >
                    + добавить
                  </button>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {items.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setEditing({ ...t })}
                        className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-gold/40"
                      >
                        <span className="block text-sm text-navy">{t.title}</span>
                        <span className="mt-0.5 line-clamp-2 block whitespace-pre-wrap text-xs text-muted">{t.body}</span>
                      </button>
                    </li>
                  ))}
                  {items.length === 0 ? <li className="px-1 text-xs text-muted">Пока пусто</li> : null}
                </ul>
              </section>
            );
          })}
        </div>

      </div>
    </RequireAuth>
  );
}
