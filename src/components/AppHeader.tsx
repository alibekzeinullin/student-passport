"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";

/** Основные разделы ментора (кроме «Ученики» и «Посещаемость»). */
const ADMIN_EXTRA_MAIN: { href: string; label: string }[] = [
  { href: "/admin/essays", label: "Эссе" },
  { href: "/admin/summary", label: "Отчёт" },
];

/** Реже нужные разделы — под «Ещё». */
const ADMIN_MORE: { href: string; label: string }[] = [
  { href: "/admin/accounts", label: "Аккаунты" },
  { href: "/admin/templates", label: "Шаблоны встреч" },
  { href: "/admin/activity", label: "История" },
  { href: "/admin/system", label: "База и копии" },
];

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
            <nav aria-label="Разделы" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <NavLink href={homeHref} active={pathname === homeHref || (user.role === "admin" && pathname.startsWith("/admin/students"))}>
                {user.role === "admin" ? "Ученики" : "Кабинет"}
              </NavLink>
              {user.role === "admin" ? (
                <>
                  <NavLink href="/admin/attendance" active={pathname.startsWith("/admin/attendance")}>
                    Посещаемость
                  </NavLink>
                  {ADMIN_EXTRA_MAIN.map((item) => (
                    <NavLink key={item.href} href={item.href} active={pathname.startsWith(item.href)}>
                      {item.label}
                    </NavLink>
                  ))}
                </>
              ) : user.role === "student" ? (
                <NavLink href="/dashboard/essays" active={pathname.startsWith("/dashboard/essays")}>
                  Эссе
                </NavLink>
              ) : null}
              <NavLink href="/opportunities" active={pathname.startsWith("/opportunities")}>
                Возможности
              </NavLink>
              {user.role === "admin" ? <MoreMenu pathname={pathname} /> : null}
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

function MoreMenu({ pathname }: { pathname: string }) {
  const active = ADMIN_MORE.some((i) => pathname.startsWith(i.href));
  return (
    <details className="group relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 border-b-2 py-1.5 transition [&::-webkit-details-marker]:hidden ${
          active ? "border-gold text-navy" : "border-transparent text-muted hover:text-navy"
        }`}
      >
        Ещё <span aria-hidden className="text-[10px] transition group-open:rotate-180">▼</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-48 rounded-2xl border border-white/10 bg-[#172235] p-1.5 shadow-xl">
        {ADMIN_MORE.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
            aria-current={pathname.startsWith(item.href) ? "page" : undefined}
            className={`block rounded-xl px-3 py-2 text-sm transition hover:bg-white/5 ${
              pathname.startsWith(item.href) ? "text-gold" : "text-navy"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
