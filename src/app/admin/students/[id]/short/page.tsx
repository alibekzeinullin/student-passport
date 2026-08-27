"use client";

import { use } from "react";
import { AdminReportPage } from "@/components/AdminReportPage";

export default function AdminShortReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <AdminReportPage studentId={id} reportType="short" />;
}
