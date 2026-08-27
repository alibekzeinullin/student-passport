"use client";

import { use } from "react";
import { ParentReportPage } from "@/components/ParentReportPage";

export default function ParentShortReportPage({
  params,
}: {
  params: Promise<{ studentToken: string }>;
}) {
  const { studentToken } = use(params);
  return (
    <div className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <ParentReportPage studentToken={studentToken} reportType="short" />
    </div>
  );
}
