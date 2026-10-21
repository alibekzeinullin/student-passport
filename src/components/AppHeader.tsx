"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <nav aria-label="Разделы" className="flex items-center gap-5 text-sm">
              <NavLink href={homeHref} active={pathname === homeHref || (user.role === "admin" && pathname.startsWith("/admin"))}>
                {user.role === "admin" ? "Ученики" : "Кабинет"}
              </NavLink>
              <NavLink href="/opportunities" active={pathname.startsWith("/opportunities")}>
                Возможности
              </NavLink>
            </nav>
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
          </div>
        ) : null}
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`border-b-2 py-1.5 transition ${
        active
          ? "border-gold text-navy"
          : "border-transparent text-muted hover:text-navy"
      }`}
    >
      {children}
    </Link>
  );
}
