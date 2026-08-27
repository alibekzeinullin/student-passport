"use client";

import { useState } from "react";
import { useStudents } from "@/context/StudentsContext";
import { Button } from "@/components/ui/Button";

export function ParentAccessLinkButton({ studentId }: { studentId: string }) {
  const { regenerateParentToken, getStudent } = useStudents();
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const makeUrl = (token: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/parent/${token}`
      : `/parent/${token}`;

  const generate = async () => {
    setBusy(true);
    try {
      const token = await regenerateParentToken(studentId);
      setLink(makeUrl(token));
      setCopied(false);
    } catch {
      alert("Не удалось сгенерировать ссылку. Нужны права админа.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const student = getStudent(studentId);
    const url =
      link ??
      (student?.parentAccessToken ? makeUrl(student.parentAccessToken) : "");
    if (!url) {
      await generate();
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={generate}
        disabled={busy}
      >
        {busy ? "Генерация…" : "Сгенерировать ссылку для родителей"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full sm:w-auto"
        onClick={copy}
        disabled={busy}
      >
        {copied ? "Скопировано" : "Копировать ссылку"}
      </Button>
      {link ? (
        <p className="break-all text-xs leading-relaxed text-muted sm:max-w-xs sm:text-right">
          {link}
        </p>
      ) : null}
    </div>
  );
}
