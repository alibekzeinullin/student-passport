"use client";

import { useState } from "react";
import type { StudentProfile } from "@/lib/types";
import type { ReportType } from "@/lib/report-types";
import { downloadStudentPdf } from "@/lib/pdf";
import { Button } from "@/components/ui/Button";

export function PdfDownloadButton({
  student,
  reportType,
  className = "",
}: {
  student: StudentProfile;
  reportType: ReportType;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await downloadStudentPdf(student, reportType);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className}
    >
      {loading ? "Формирование PDF…" : "Скачать PDF"}
    </Button>
  );
}
