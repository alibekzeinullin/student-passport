import type { AuthAccount, AuthUser, StudentProfile } from "./types";

export const STORAGE_KEYS = {
  authAccounts: "today.auth.accounts.v1",
  authSessionUser: "today.auth.session.v1",
  students: "today.students.v1",
} as const;

export const STORAGE_EVENTS = {
  studentsChanged: "today:students:changed",
  authChanged: "today:auth:changed",
} as const;

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function readStoredAccounts(): AuthAccount[] | null {
  if (typeof window === "undefined") return null;
  return parseJson<AuthAccount[]>(
    window.localStorage.getItem(STORAGE_KEYS.authAccounts),
  );
}

export function writeStoredAccounts(accounts: AuthAccount[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEYS.authAccounts,
    JSON.stringify(accounts),
  );
}

export function readStoredSessionUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  return parseJson<AuthUser>(window.localStorage.getItem(STORAGE_KEYS.authSessionUser));
}

export function writeStoredSessionUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (!user) {
    window.localStorage.removeItem(STORAGE_KEYS.authSessionUser);
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.authSessionUser, JSON.stringify(user));
}

export function readStoredStudents(): StudentProfile[] | null {
  if (typeof window === "undefined") return null;
  return parseJson<StudentProfile[]>(
    window.localStorage.getItem(STORAGE_KEYS.students),
  );
}

export function writeStoredStudents(students: StudentProfile[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(students));
}

