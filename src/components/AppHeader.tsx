"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { canOpenGroups, homeForRole, isHead, STAFF_ROLE_LABELS, type StaffRole } from "@/lib/staff";
import type { AuthUser } from "@/lib/types";

/** Основные разделы ментора (кроме «Ученики» и «Посещаемость»). */
const ADMIN_EXTRA_MAIN: { href: string; label: string }[] = [
  { href: "/admin/essays", label: "Эссе" },
  { href: "/admin/books", label: "Книги" },
  { href: "/admin/summary", label: "Отчёт" },
];

/** Разделы SAT — одинаковые для руководителя и сотрудников SAT. */
const SAT_MAIN: { href: string; label: string }[] = [
  { href: "/admin/lessons", label: "Занятия" },
  { href: "/admin/results", label: "Результаты" },
  { href: "/admin/groups", label: "Группы" },
];

function isSatPath(pathname: string): boolean {
  return SAT_MAIN.some((i) => pathname.startsWith(i.href));
}

/** Реже нужные разделы — под «Ещё». */
const ADMIN_MORE: { href: string; label: string; show?: (u: AuthUser) => boolean; mentoringOnly?: boolean }[] = [
  { href: "/admin/team", label: "Команда", show: isHead },
  { href: "/admin/accounts", label: "Аккаунты" },
  { href: "/admin/templates", label: "Шаблоны встреч", mentoringOnly: true },
  { href: "/admin/activity", label: "История", mentoringOnly: true },
  { href: "/admin/system", label: "База и копии" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Админ / Ментор",
  staff: "Сотрудник",
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

  const homeHref = user ? homeForRole(user.role) : "/";
  const roleLabel = user
    ? user.role !== "student" && user.staffRoles?.length
      ? user.staffRoles.map((r) => STAFF_ROLE_LABELS[r as StaffRole] ?? r).join(", ")
      : (ROLE_LABELS[user.role] ?? user.role)
    : "";

  const showSwitch = Boolean(user && user.role === "admin" && canOpenGroups(user));

  return (
    <header className="border-b border-white/[0.07] bg-[#121b29]/70 text-navy backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-5">
            <Link href={isParentGuest ? "/" : homeHref} className="flex min-w-0 items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-shield.png" alt="" width={34} height={40} className="h-10 w-auto shrink-0" />
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-sm font-medium tracking-[0.12em] sm:text-[15px]">TODAY SCHOLARS</span>
                <span className="block text-xs font-light text-muted sm:text-sm">Digital Passport</span>
              </span>
            </Link>
            {showSwitch ? <SectionSwitch sat={isSatPath(pathname)} /> : null}
          </div>

          {isParentGuest ? (
            <p className="shrink-0 text-[11px] text-muted sm:text-xs">Родитель · просмотр</p>
          ) : user ? (
            <div className="flex items-center gap-3">
              <div className="hidden min-w-0 text-right sm:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted">{roleLabel}</p>
              </div>
              <Button variant="secondary" className="shrink-0" onClick={handleLogout}>
                Выйти
              </Button>
            </div>
          ) : null}
        </div>

        {!isParentGuest && user ? (
          <div className="-mb-px">
            <nav aria-label="Разделы" className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              {user.role === "staff" || (user.role === "admin" && isSatPath(pathname)) ? (
                SAT_MAIN.map((item) => (
                  <NavLink key={item.href} href={item.href} active={pathname.startsWith(item.href)}>
                    {item.label}
                  </NavLink>
                ))
              ) : user.role === "admin" ? (
                <>
                  <NavLink href="/admin" active={pathname === "/admin" || pathname.startsWith("/admin/students")}>
                    Ученики
                  </NavLink>
                  <NavLink href="/admin/attendance" active={pathname.startsWith("/admin/attendance")}>
                    Посещаемость
                  </NavLink>
                  {ADMIN_EXTRA_MAIN.map((item) => (
                    <NavLink key={item.href} href={item.href} active={pathname.startsWith(item.href)}>
                      {item.label}
                    </NavLink>
                  ))}
                  <NavLink href="/opportunities" active={pathname.startsWith("/opportunities")}>
                    Возможности
                  </NavLink>
                </>
              ) : user.role === "student" ? (
                <>
                  <NavLink href="/dashboard" active={pathname === "/dashboard"}>
                    Кабинет
                  </NavLink>
                  <NavLink href="/dashboard/essays" active={pathname.startsWith("/dashboard/essays")}>
                    Эссе
                  </NavLink>
                  <NavLink href="/dashboard/works" active={pathname.startsWith("/dashboard/works")}>
                    Проекты
                  </NavLink>
                  <NavLink href="/opportunities" active={pathname.startsWith("/opportunities")}>
                    Возможности
                  </NavLink>
                </>
              ) : null}
              {user.role === "admin" ? <MoreMenu pathname={pathname} user={user} /> : null}
            </nav>
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
      className={`border-b-2 pb-2.5 pt-1 transition ${
        active
          ? "border-gold text-navy"
          : "border-transparent text-muted hover:text-navy"
      }`}
    >
      {children}
    </Link>
  );
}

function MoreMenu({ pathname, user }: { pathname: string; user: AuthUser }) {
  const sat = isSatPath(pathname);
  const items = ADMIN_MORE.filter((i) => (!i.show || i.show(user)) && !(sat && i.mentoringOnly));
  const active = items.some((i) => pathname.startsWith(i.href));
  return (
    <details className="group relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 border-b-2 pb-2.5 pt-1 transition [&::-webkit-details-marker]:hidden ${
          active ? "border-gold text-navy" : "border-transparent text-muted hover:text-navy"
        }`}
      >
        Ещё <span aria-hidden className="text-[10px] transition group-open:rotate-180">▼</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-48 rounded-2xl border border-white/10 bg-[#172235] p-1.5 shadow-xl">
        {items.map((item) => (
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

/** Переключатель «Менторство | SAT» для руководителя: у каждого направления — свои разделы. */
function SectionSwitch({ sat }: { sat: boolean }) {
  return (
    <div role="tablist" aria-label="Направление" className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5 text-xs">
      {(
        [
          ["/admin", "Менторство", !sat],
          ["/admin/lessons", "SAT", sat],
        ] as const
      ).map(([href, label, on]) => (
        <Link
          key={href}
          href={href}
          role="tab"
          aria-selected={on}
          className={`rounded-full px-3.5 py-1.5 font-semibold tracking-wide transition ${on ? "bg-gold text-gold-ink" : "text-muted hover:text-navy"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
