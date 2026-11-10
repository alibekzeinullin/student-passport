"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { AuthUser, UserRole } from "@/lib/types";
import { ForcePasswordChange } from "@/components/ForcePasswordChange";
import { homeForRole } from "@/lib/staff";

export function RequireAuth({
  role,
  allow,
  children,
}: {
  /** Одна роль или несколько допустимых */
  role?: UserRole | UserRole[];
  /** Дополнительная проверка (например, только руководитель) */
  allow?: (user: AuthUser) => boolean;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const roles = role ? (Array.isArray(role) ? role : [role]) : null;
  const permitted = (u: AuthUser) => (!roles || roles.includes(u.role)) && (!allow || allow(u));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!permitted(user)) {
      router.replace(homeForRole(user.role));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, role, router, pathname]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted">
        Загрузка…
      </div>
    );
  }
  if (!user) return null;
  if (!permitted(user)) return null;
  if (user.mustChangePassword) return <ForcePasswordChange />;

  return <>{children}</>;
}
