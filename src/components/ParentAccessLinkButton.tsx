"use client";

import { useEffect, useState } from "react";
import { useStudents } from "@/context/StudentsContext";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export function ParentAccessLinkButton({ studentId }: { studentId: string }) {
  const { regenerateParentToken, getStudent } = useStudents();
  const student = getStudent(studentId);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const makeUrl = (token: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/parent/${token}`
      : `/parent/${token}`;

  useEffect(() => {
    if (student?.parentAccessToken) {
      setLink(makeUrl(student.parentAccessToken));
    }
  }, [student?.parentAccessToken]);

  const regenerate = async () => {
    const ok = window.confirm(
      "Сгенерировать новую ссылку? Старая ссылка для родителей перестанет работать.",
    );
    if (!ok) return;

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
    let url = link;
    if (!url && student?.parentAccessToken) {
      url = makeUrl(student.parentAccessToken);
      setLink(url);
    }
    if (!url) {
      await regenerate();
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Не удалось скопировать. Скопируйте ссылку вручную.");
    }
  };

  return (
    <Card className="border-gold/50 sm:max-w-md">
      <CardBody className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-navy">Ссылка для родителей</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Родители видят Student Profile, Monthly Progress Review и Vision Map
            без входа. Редактирование недоступно — только просмотр.
          </p>
        </div>

        {link ? (
          <p className="break-all rounded-md border border-light-gray bg-[#fafafa] px-3 py-2 text-xs text-navy">
            {link}
          </p>
        ) : (
          <p className="text-xs text-muted">
            Ссылка ещё не создана — нажмите «Сгенерировать».
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={copy}
            disabled={busy || (!link && !student?.parentAccessToken)}
          >
            {copied ? "Скопировано ✓" : "Копировать ссылку"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={regenerate}
            disabled={busy}
          >
            {busy ? "Генерация…" : link ? "Обновить ссылку" : "Сгенерировать"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
