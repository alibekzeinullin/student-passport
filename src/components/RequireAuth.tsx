"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/lib/types";

export function RequireAuth({
  role,
  children,
}: {
  role?: UserRole;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (role && user.role !== role) {
      if (user.role === "admin") {
        router.replace("/admin");
      } else if (user.role === "student") {
        router.replace("/dashboard");
      } else {
        router.replace("/");
      }
    }
  }, [user, role, router, pathname]);

  if (!user) return null;
  if (role && user.role !== role) return null;

  return <>{children}</>;
}
