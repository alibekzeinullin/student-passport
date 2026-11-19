"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { canOpenGroups } from "@/lib/staff";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Field";
import { MathText } from "@/components/tests/MathText";
import { loadResults, type TopicRow } from "@/lib/results";
import { htmlToBlocks, parseTestBlocks, textToBlocks, type ImportResult } from "@/lib/test-import";
import { compressImage, createEmptyTest, createTestFromImport, loadTests, matchTopic, type AssignmentRow, type SectionRow, type TestRow } from "@/lib/tests";

export default function TestsPage() {
  const router = useRouter();
  const [data, setData] = useState<{ tests: TestRow[]; sections: SectionRow[]; counts: Map<string, number>; assignments: AssignmentRow[] } | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([loadTests(), loadResults().catch(() => null)]);
      setData(d);
      setTopics(r?.topics ?? []);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const readWord = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const mammoth = (await import("mammoth")).default;
      const buf = await file.arrayBuffer();
      const { value: html } = await mammoth.convertToHtml(
        { arrayBuffer: buf },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const b64 = await image.read("base64");
            return { src: await compressImage(`data:${image.contentType};base64,${b64}`) };
          }),
        },
      );
      const result = parseTestBlocks(htmlToBlocks(html), file.name.replace(/\.docx$/i, ""));
      setParsed(result);
    } catch (err) {
      setError(`Не удалось прочитать файл: ${(err as Error).message}. Нужен .docx (Word 2007 и новее).`);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!parsed) return;
    setBusy(true);
    setError("");
    try {
      const id = await createTestFromImport(parsed, topics);
      router.push(`/admin/tests/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const totalQ = parsed?.sections.reduce((s, x) => s + x.questions.length, 0) ?? 0;
  const unmatched = parsed
    ? Array.from(new Set(parsed.sections.flatMap((s) => s.questions.map((q) => q.topic && matchTopic(q.topic, s.section, topics).topic_label)).filter(Boolean) as string[]))
    : [];

  return (
    <RequireAuth role={["admin", "staff"]} allow={canOpenGroups}>
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">SAT</p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Тесты на сайте</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Загрузите тест из Word по шаблону — сайт сам разложит модули и вопросы. Проверьте ответы, темы и баллы, затем опубликуйте для групп. После теста — отчёт по темам.
            </p>
          </div>
          <a href="/sat-test-template.docx" download className="text-sm text-gold underline">
            Скачать шаблон Word
          </a>
        </div>

        {error ? <div className="rounded-2xl border border-burgundy/30 bg-burgundy/10 px-4 py-3 text-sm text-burgundy">{error}</div> : null}

        {!parsed ? (
          <section className="sp-glass flex flex-wrap items-center gap-3 rounded-3xl border px-5 py-5 sm:px-6">
            <label className={`inline-flex cursor-pointer items-center rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink ${busy ? "opacity-60" : "hover:opacity-90"}`}>
              {busy ? "Читаю файл…" : "Загрузить из Word (.docx)"}
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void readWord(f);
                }}
              />
            </label>
            <Button type="button" variant="secondary" onClick={() => setPasteOpen((v) => !v)}>
              Вставить текстом
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const title = window.prompt("Название теста", "Mock");
                if (!title) return;
                try {
                  router.push(`/admin/tests/${await createEmptyTest(title)}`);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              + Пустой тест
            </Button>
            {pasteOpen ? (
              <div className="w-full space-y-2">
                <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} className="min-h-48 font-mono text-xs" placeholder={"Mock 1\n# Math — Модуль 1 | Math | 35 мин | калькулятор\n1. What is 25% of 80?\nA) 10\nB) 20\nC) 25\nD) 40\nОтвет: B\nТема: Percentages\nБаллы: 1"} />
                <Button type="button" disabled={!paste.trim()} onClick={() => setParsed(parseTestBlocks(textToBlocks(paste), "Тест"))}>
                  Разобрать
                </Button>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="sp-glass space-y-4 rounded-3xl border border-gold/40 px-5 py-5 sm:px-6" aria-label="Проверка импорта">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1">
                <Label htmlFor="imp-title">Название теста</Label>
                <Input id="imp-title" value={parsed.title} onChange={(e) => setParsed({ ...parsed, title: e.target.value })} />
              </div>
              <p className="text-sm text-muted">
                Модулей: <span className="text-navy">{parsed.sections.length}</span> · вопросов: <span className="text-navy">{totalQ}</span> · баллов:{" "}
                <span className="text-navy">{parsed.sections.reduce((s, x) => s + x.questions.reduce((a, q) => a + q.points, 0), 0)}</span>
              </p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {parsed.sections.map((s, i) => (
                <li key={i} className="rounded-2xl border border-white/10 px-4 py-3 text-sm">
                  <p className="text-navy">{s.title}</p>
                  <p className="text-xs text-muted">
                    {s.section === "math" ? "Math" : "Verbal"} · {s.minutes} мин{s.calculator ? " · калькулятор" : ""} · вопросов: {s.questions.length} (
                    {s.questions.filter((q) => q.kind === "input").length} с вводом ответа, картинок: {s.questions.filter((q) => q.image).length})
                  </p>
                </li>
              ))}
            </ul>
            {parsed.warnings.length ? (
              <div className="rounded-2xl border border-gold/40 bg-gold/[0.07] px-4 py-3 text-sm">
                <p className="font-semibold text-navy">Проверьте ({parsed.warnings.length}) — можно исправить после создания:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-navy">
                  {parsed.warnings.slice(0, 20).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                {parsed.warnings.length > 20 ? <p className="mt-1 text-xs text-muted">… и ещё {parsed.warnings.length - 20}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-emerald-300">Ошибок не нашлось ✓</p>
            )}
            {unmatched.length ? (
              <p className="text-xs text-muted">
                Темы не из списка SAT (останутся подписью, в отчёте будут отдельно): {unmatched.join(", ")}
              </p>
            ) : null}
            {parsed.sections[0]?.questions[0] ? (
              <div className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm">
                <p className="text-xs text-muted">Первый вопрос — как увидит ученик:</p>
                {parsed.sections[0].questions[0].passage ? <MathText text={parsed.sections[0].questions[0].passage} className="mt-1 block text-muted" /> : null}
                <MathText text={parsed.sections[0].questions[0].stem} className="mt-1 block text-navy" />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || !totalQ} onClick={() => void create()}>
                {busy ? "Создаю…" : "Создать тест и открыть редактор"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setParsed(null)}>
                Отмена
              </Button>
            </div>
          </section>
        )}

        {data ? (
          data.tests.length ? (
            <ul className="space-y-2">
              {data.tests.map((t) => {
                const secs = data.sections.filter((s) => s.test_id === t.id);
                const pubs = data.assignments.filter((a) => a.test_id === t.id);
                return (
                  <li key={t.id}>
                    <Link href={`/admin/tests/${t.id}`} className="sp-glass flex flex-wrap items-center gap-4 rounded-3xl border px-5 py-4 hover:border-gold/50">
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg text-navy">{t.title}</span>
                        <span className="block text-xs text-muted">
                          {secs.map((s) => `${s.section === "math" ? "Math" : "Verbal"} ${s.minutes} мин`).join(" · ") || "нет модулей"} · вопросов: {data.counts.get(t.id) ?? 0}
                        </span>
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs ${pubs.length ? "bg-emerald-500/15 text-emerald-300" : "border border-white/15 text-muted"}`}>
                        {pubs.length ? `опубликован · групп: ${pubs.length}` : "черновик"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">Тестов пока нет. Скачайте шаблон, заполните его и загрузите.</p>
          )
        ) : !error ? (
          <p className="text-muted">Загрузка…</p>
        ) : null}
      </div>
    </RequireAuth>
  );
}
