"use client";

import { useState } from "react";
import type { StudentProfile } from "@/lib/types";
import { downloadStudentPdf } from "@/lib/pdf";
import { Button } from "@/components/ui/Button";

export function PdfDownloadButton({ student }: { student: StudentProfile }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await downloadStudentPdf(student);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" onClick={handleClick} disabled={loading}>
      {loading ? "Формирование PDF…" : "Скачать PDF-отчет для родителей"}
    </Button>
  );
}
