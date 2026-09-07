"use client";

import { use } from "react";
import { ParentReportPage } from "@/components/ParentReportPage";

export default function ParentProfileReportPage({
  params,
}: {
  params: Promise<{ studentToken: string }>;
}) {
  const { studentToken } = use(params);
  return (
    <ParentReportPage studentToken={studentToken} reportType="profile" />
  );
}
