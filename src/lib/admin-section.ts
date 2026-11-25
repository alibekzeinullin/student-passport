/** Раздел админки (Менторство / SAT). Общие страницы остаются в том разделе, откуда в них пришли. */

/** Разделы SAT — одинаковые для руководителя и сотрудников SAT. */
export const SAT_MAIN: { href: string; label: string }[] = [
  { href: "/admin/lessons", label: "Занятия" },
  { href: "/admin/results", label: "Результаты" },
  { href: "/admin/tests", label: "Тесты" },
  { href: "/admin/groups", label: "Группы" },
  { href: "/admin/sat-links", label: "Ссылки" },
];

const SHARED_PATHS = ["/admin/team", "/admin/accounts", "/admin/system"];
export const SECTION_KEY = "sp-admin-section";

export function isSatPath(pathname: string): boolean {
  return SAT_MAIN.some((i) => pathname.startsWith(i.href));
}

export function isSharedPath(pathname: string): boolean {
  return SHARED_PATHS.some((p) => pathname.startsWith(p));
}

/** Раздел SAT: страница SAT или общая страница, на которую перешли из SAT. */
export function inSatSection(pathname: string): boolean {
  if (isSatPath(pathname)) return true;
  if (!isSharedPath(pathname) || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SECTION_KEY) === "sat";
  } catch {
    return false;
  }
}

export function rememberSection(pathname: string) {
  if (isSharedPath(pathname)) return;
  try {
    localStorage.setItem(SECTION_KEY, isSatPath(pathname) ? "sat" : "mentoring");
  } catch {
    /* без запоминания */
  }
}
