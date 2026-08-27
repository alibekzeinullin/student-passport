"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { StudentsProvider } from "@/context/StudentsContext";
import { AppHeader } from "@/components/AppHeader";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StudentsProvider>
        <div className="flex min-h-full min-w-0 flex-col">
          <AppHeader />
          <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
        </div>
      </StudentsProvider>
    </AuthProvider>
  );
}
