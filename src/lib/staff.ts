/** Сотрудники, роли и группы — общее для браузера и сервера. */

import type { AuthUser, UserRole } from "./types";

export const STAFF_ROLES = ["head", "mentor", "sat_curator", "sat_teacher", "sat_senior_teacher"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  head: "Руководитель",
  mentor: "Ментор",
  sat_curator: "Куратор SAT",
  sat_teacher: "Учитель SAT",
  sat_senior_teacher: "Старший учитель SAT",
};

export const STAFF_ROLE_HINTS: Record<StaffRole, string> = {
  head: "видит и меняет всё, управляет командой",
  mentor: "менторская часть сайта",
  sat_curator: "все SAT-ученики, правит свои группы",
  sat_teacher: "все SAT-ученики, правит свои группы",
  sat_senior_teacher: "правит все SAT-группы",
};

/** Синонимы для массового ввода «ФИО; роль; группа». */
const ROLE_ALIASES: Record<string, StaffRole> = {
  руководитель: "head",
  директор: "head",
  head: "head",
  ментор: "mentor",
  mentor: "mentor",
  куратор: "sat_curator",
  "куратор sat": "sat_curator",
  curator: "sat_curator",
  учитель: "sat_teacher",
  "учитель sat": "sat_teacher",
  преподаватель: "sat_teacher",
  teacher: "sat_teacher",
  "старший учитель": "sat_senior_teacher",
  "старший учитель sat": "sat_senior_teacher",
  "старший преподаватель": "sat_senior_teacher",
  senior: "sat_senior_teacher",
};

export function parseRole(text: string): StaffRole | null {
  const key = text.trim().toLowerCase().replace(/\s+/g, " ");
  if ((STAFF_ROLES as readonly string[]).includes(key)) return key as StaffRole;
  return ROLE_ALIASES[key] ?? null;
}

/** В группе сотрудник — учитель или куратор. */
export type GroupStaffRole = "teacher" | "curator";
export const GROUP_STAFF_LABELS: Record<GroupStaffRole, string> = {
  teacher: "учитель",
  curator: "куратор",
};

export function defaultGroupRole(roles: readonly string[]): GroupStaffRole {
  return roles.includes("sat_curator") && !roles.includes("sat_teacher") && !roles.includes("sat_senior_teacher")
    ? "curator"
    : "teacher";
}

export function isHead(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.staffRoles?.includes("head"));
}

export function isSatStaff(user: AuthUser | null | undefined): boolean {
  const r = user?.staffRoles ?? [];
  return r.includes("sat_teacher") || r.includes("sat_senior_teacher") || r.includes("sat_curator");
}

/** Кто может открыть страницу групп SAT. */
export function canOpenGroups(user: AuthUser | null | undefined): boolean {
  return isHead(user) || isSatStaff(user);
}

/** Создавать группы, назначать учителей, править любую SAT-группу. */
export function canManageSat(user: AuthUser | null | undefined): boolean {
  return isHead(user) || Boolean(user?.staffRoles?.includes("sat_senior_teacher"));
}

/** Стартовая страница после входа. */
export function homeForRole(role: UserRole | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "staff") return "/admin/groups";
  return "/dashboard";
}

export interface StaffGroupRef {
  groupId: string;
  groupName: string;
  role: GroupStaffRole;
}

export interface StaffRow {
  userId: string;
  fullName: string;
  login: string;
  city: string;
  roles: StaffRole[];
  active: boolean;
  groups: StaffGroupRef[];
  lastSignInAt: string | null;
  mustChangePassword: boolean;
}

export interface StaffAuditRow {
  id: number;
  actorName: string;
  targetName: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface GroupOption {
  id: string;
  name: string;
  streamName: string;
  courseId: string;
}

export const AUDIT_LABELS: Record<string, string> = {
  create: "создан сотрудник",
  roles: "изменены роли",
  update: "изменены данные",
  reset_password: "сброшен пароль",
  disable: "отключён",
  enable: "включён снова",
  groups: "изменены группы",
};

export function staffInviteMessage(params: { name: string; login: string; password: string; url: string; roles: StaffRole[] }): string {
  const first = params.name.trim().split(/\s+/)[0] || "";
  return [
    `Здравствуйте${first ? `, ${first}` : ""}! Ваш вход в Digital Passport TODAY Scholars:`,
    params.url,
    `Логин: ${params.login}`,
    `Пароль: ${params.password}`,
    `Роль: ${params.roles.map((r) => STAFF_ROLE_LABELS[r]).join(", ")}`,
    "При первом входе сайт попросит придумать свой пароль.",
  ].join("\n");
}

export interface BulkLine {
  line: number;
  raw: string;
  fullName: string;
  role: StaffRole | null;
  groupName: string;
  groupId: string | null;
  problem: string | null;
}

/** Разбор строк «ФИО; роль; группа» (группа необязательна, разделитель ; или табуляция). */
export function parseBulk(text: string, groups: GroupOption[]): BulkLine[] {
  const byName = new Map(groups.map((g) => [g.name.trim().toLowerCase(), g.id]));
  return text
    .split(/\r?\n/)
    .map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter((l) => l.raw)
    .map(({ raw, line }) => {
      const [name = "", roleText = "", groupName = ""] = raw.split(/;|\t/).map((p) => p.trim());
      const role = parseRole(roleText);
      const groupId = groupName ? (byName.get(groupName.toLowerCase()) ?? null) : null;
      let problem: string | null = null;
      if (name.split(/\s+/).length < 2) problem = "нужны имя и фамилия";
      else if (!role) problem = roleText ? `неизвестная роль «${roleText}»` : "не указана роль";
      else if (groupName && !groupId) problem = `нет группы «${groupName}»`;
      return { line, raw, fullName: name, role, groupName, groupId, problem };
    });
}
