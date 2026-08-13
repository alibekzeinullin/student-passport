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

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const homeHref = user
    ? user.role === "admin"
      ? "/admin"
      : "/dashboard"
    : "/";

  return (
    <header className="border-b border-gold/40 bg-navy text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div>
          <Link href={isParentGuest ? "/" : homeHref} className="block">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">
              TODAY Scholars
            </p>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              Digital Passport TODAY Scholars
            </h1>
          </Link>
        </div>

        {isParentGuest ? (
          <p className="text-xs text-light-gray">Родитель / Гость · Read-only</p>
        ) : user ? (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-light-gray">
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
            <Button
              variant="secondary"
              className="border-gold/60 bg-white/95"
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
