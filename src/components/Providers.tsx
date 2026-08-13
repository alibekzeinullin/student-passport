"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { StudentsProvider } from "@/context/StudentsContext";
import { AppHeader } from "@/components/AppHeader";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StudentsProvider>
        <div className="flex min-h-full flex-col">
          <AppHeader />
          <main className="flex-1">{children}</main>
        </div>
      </StudentsProvider>
    </AuthProvider>
  );
}
