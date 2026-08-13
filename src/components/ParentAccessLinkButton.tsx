"use client";

import { useState } from "react";
import { useStudents } from "@/context/StudentsContext";
import { Button } from "@/components/ui/Button";

export function ParentAccessLinkButton({ studentId }: { studentId: string }) {
  const { regenerateParentToken, getStudent } = useStudents();
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const generate = () => {
    const token = regenerateParentToken(studentId);
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/parent/${token}`
        : `/parent/${token}`;
    setLink(url);
    setCopied(false);
  };

  const copy = async () => {
    const student = getStudent(studentId);
    const url =
      link ??
      (typeof window !== "undefined" && student
        ? `${window.location.origin}/parent/${student.parentAccessToken}`
        : student
          ? `/parent/${student.parentAccessToken}`
          : "");
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button type="button" variant="secondary" onClick={generate}>
        Сгенерировать ссылку для родителей
      </Button>
      <Button type="button" variant="ghost" onClick={copy}>
        {copied ? "Скопировано" : "Копировать ссылку"}
      </Button>
      {link ? (
        <p className="text-xs text-muted sm:max-w-xs sm:truncate">{link}</p>
      ) : null}
    </div>
  );
}
