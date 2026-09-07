"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { StudentProfile } from "@/lib/types";
import type { ReportType } from "@/lib/report-types";
import {
  REPORT_DESCRIPTIONS,
  REPORT_LABELS,
  REPORT_TYPES,
} from "@/lib/report-types";
import { PdfDownloadButton } from "@/components/PdfDownloadButton";

interface ReportPageShellProps {
  student: StudentProfile;
  reportType: ReportType;
  basePath: string;
  backHref?: string;
  backLabel?: string;
  readOnly?: boolean;
  children: ReactNode;
}

export function ReportPageShell({
  student,
  reportType,
  basePath,
  backHref,
  backLabel,
  readOnly = false,
  children,
}: ReportPageShellProps) {
  return (
    <div className="min-w-0 space-y-5">
      {readOnly ? (
        <div className="rounded-lg border border-gold/50 bg-gold/15 px-4 py-3 text-sm text-navy">
          Режим родителя: все разделы доступны только для просмотра. Изменения
          недоступны.
        </div>
      ) : null}

      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex text-sm font-medium text-muted underline-offset-2 hover:text-burgundy hover:underline"
        >
          {backLabel ?? "← Назад"}
        </Link>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-burgundy sm:tracking-[0.14em]">
            {REPORT_LABELS[reportType]}
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-snug text-navy sm:text-2xl">
            {student.lastName} {student.firstName}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {REPORT_DESCRIPTIONS[reportType]}
          </p>
        </div>
        <PdfDownloadButton
          student={student}
          reportType={reportType}
          className="w-full shrink-0 sm:w-auto"
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-light-gray bg-card p-1 sm:flex-row sm:flex-wrap">
        {REPORT_TYPES.map((type) => (
          <Link
            key={type}
            href={`${basePath}/${type}`}
            className={`rounded-md px-3 py-2 text-center text-sm font-medium leading-snug transition sm:px-4 sm:py-2 sm:text-left ${
              type === reportType
                ? "bg-navy text-white"
                : "text-navy hover:bg-light-gray/40"
            }`}
          >
            {REPORT_LABELS[type]}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
