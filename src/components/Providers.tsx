"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { StudentsProvider } from "@/context/StudentsContext";
import { AppHeader } from "@/components/AppHeader";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const t = window.setTimeout(() => document.documentElement.classList.add("sp-seen"), 1500);
    return () => window.clearTimeout(t);
  }, []);

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
