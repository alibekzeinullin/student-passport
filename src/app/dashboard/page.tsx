"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { StudentDashboard } from "@/components/StudentDashboard";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <RequireAuth role="student">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {user?.studentId ? (
          <StudentDashboard studentId={user.studentId} accessMode="student" />
        ) : null}
      </div>
    </RequireAuth>
  );
}
