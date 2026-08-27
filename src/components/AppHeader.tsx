"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";

const ROLE_LABELS: Record<string, string> = {
  admin: "Админ / Ментор",
  student: "Ученик",
  parent: "Родитель / Гость",
};

export function AppHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isParentGuest = pathname.startsWith("/parent/");

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const homeHref = user
    ? user.role === "admin"
      ? "/admin"
      : "/dashboard"
    : "/";

  return (
    <header className="border-b border-gold/40 bg-navy text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <div className="min-w-0">
          <Link href={isParentGuest ? "/" : homeHref} className="block min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-gold sm:text-xs sm:tracking-[0.18em]">
              TODAY Scholars
            </p>
            <h1 className="text-base font-semibold leading-snug tracking-tight sm:text-xl">
              <span className="sm:hidden">Digital Passport</span>
              <span className="hidden sm:inline">
                Digital Passport TODAY Scholars
              </span>
            </h1>
          </Link>
        </div>

        {isParentGuest ? (
          <p className="shrink-0 text-[11px] text-light-gray sm:text-xs">
            Родитель · просмотр
          </p>
        ) : user ? (
          <div className="flex items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-light-gray">
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
            <Button
              variant="secondary"
              className="ml-auto shrink-0 border-gold/60 bg-white/95 sm:ml-0"
              onClick={handleLogout}
            >
              Выйти
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
