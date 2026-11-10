"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { canOpenMentoring } from "@/lib/staff";
import { OpportunitiesFeed } from "@/components/OpportunitiesFeed";

export default function OpportunitiesPage() {
  return (
    <RequireAuth allow={canOpenMentoring}>
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <OpportunitiesFeed />
      </div>
    </RequireAuth>
  );
}
