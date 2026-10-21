"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { OpportunitiesFeed } from "@/components/OpportunitiesFeed";

export default function OpportunitiesPage() {
  return (
    <RequireAuth>
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <OpportunitiesFeed />
      </div>
    </RequireAuth>
  );
}
