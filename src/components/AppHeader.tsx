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
    <header className="border-b border-white/[0.07] bg-[#121b29]/70 text-navy backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <div className="min-w-0">
          <Link
            href={isParentGuest ? "/" : homeHref}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-gold text-sm font-semibold text-gold">
              TS
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium tracking-[0.12em] sm:text-[15px]">
                TODAY SCHOLARS
              </span>
              <span className="block text-xs font-light text-muted sm:text-sm">
                Digital Passport
              </span>
            </span>
          </Link>
        </div>

        {isParentGuest ? (
          <p className="shrink-0 text-[11px] text-muted sm:text-xs">
            Родитель · просмотр
          </p>
        ) : user ? (
          <div className="flex items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted">
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
            <Button
              variant="secondary"
              className="ml-auto shrink-0 sm:ml-0"
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
