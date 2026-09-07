"use client";

import { use } from "react";
import { ParentReportPage } from "@/components/ParentReportPage";

export default function ParentVisionReportPage({
  params,
}: {
  params: Promise<{ studentToken: string }>;
}) {
  const { studentToken } = use(params);
  return <ParentReportPage studentToken={studentToken} reportType="vision" />;
}
