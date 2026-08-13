"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEMO_AUTH_ACCOUNTS, INITIAL_STUDENTS } from "@/lib/mock-data";
import { buildStudentFromRegistration } from "@/lib/student-factory";
import {
  readStoredAccounts,
  readStoredSessionUser,
  readStoredStudents,
  STORAGE_EVENTS,
  writeStoredAccounts,
  writeStoredSessionUser,
  writeStoredStudents,
} from "@/lib/storage";
import type {
  AuthAccount,
  AuthUser,
  StudentRegistrationInput,
} from "@/lib/types";

interface AuthContextValue {
  user: AuthUser | null;
  loginWithCredentials: (email: string, password: string) => {
    ok: boolean;
    user?: AuthUser;
    error?: string;
  };
  registerStudent: (input: StudentRegistrationInput) => {
    ok: boolean;
    user?: AuthUser;
    error?: string;
  };
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isValidAccount(candidate: unknown): candidate is AuthAccount {
  if (!candidate || typeof candidate !== "object") return false;
  const account = candidate as Partial<AuthAccount>;
  return Boolean(
    account.id &&
      account.fullName &&
      account.email &&
      account.password &&
      (account.role === "student" || account.role === "admin"),
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const existingAccountsRaw = readStoredAccounts();
    const existingAccounts =
      existingAccountsRaw?.filter((item) => isValidAccount(item)) ?? [];
    if (existingAccounts.length === 0) {
      writeStoredAccounts(DEMO_AUTH_ACCOUNTS);
    } else if (existingAccountsRaw?.length !== existingAccounts.length) {
      writeStoredAccounts(existingAccounts);
    }

    const existingStudents = readStoredStudents();
    if (!existingStudents || existingStudents.length === 0) {
      writeStoredStudents(INITIAL_STUDENTS);
    }

    const session = readStoredSessionUser();
    if (session && (session.role === "admin" || session.role === "student")) {
      setUser(session);
    } else {
      setUser(null);
      writeStoredSessionUser(null);
    }
  }, []);

  const loginWithCredentials = useCallback((email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return { ok: false, error: "Введите email и пароль" };
    }

    const accounts = readStoredAccounts() ?? DEMO_AUTH_ACCOUNTS;
    const account = accounts.find(
      (a) => a.email.toLowerCase() === normalizedEmail && a.password === password,
    );
    if (!account) {
      return { ok: false, error: "Неверный email или пароль" };
    }

    const authUser: AuthUser = {
      id: account.id,
      name: account.fullName,
      email: account.email,
      role: account.role,
      studentId: account.studentId,
    };
    setUser(authUser);
    writeStoredSessionUser(authUser);
    window.dispatchEvent(new Event(STORAGE_EVENTS.authChanged));
    return { ok: true, user: authUser };
  }, []);

  const registerStudent = useCallback((input: StudentRegistrationInput) => {
    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();
    const className = input.className.trim();
    const school = input.school.trim();

    if (!fullName || !email || !password || !className || !school) {
      return { ok: false, error: "Заполните все обязательные поля" };
    }
    if (password.length < 6) {
      return { ok: false, error: "Пароль должен быть минимум 6 символов" };
    }

    const accounts = readStoredAccounts() ?? DEMO_AUTH_ACCOUNTS;
    const exists = accounts.some((a) => a.email.toLowerCase() === email);
    if (exists) {
      return { ok: false, error: "Пользователь с таким email уже существует" };
    }

    const student = buildStudentFromRegistration({
      ...input,
      fullName,
      email,
      password,
      className,
      school,
    });
    const students = readStoredStudents() ?? INITIAL_STUDENTS;
    writeStoredStudents([...students, student]);

    const newAccount: AuthAccount = {
      id: `acc-${Date.now().toString(36)}`,
      fullName,
      email,
      password,
      role: "student",
      studentId: student.id,
    };
    writeStoredAccounts([...accounts, newAccount]);

    const authUser: AuthUser = {
      id: newAccount.id,
      name: newAccount.fullName,
      email: newAccount.email,
      role: newAccount.role,
      studentId: newAccount.studentId,
    };
    writeStoredSessionUser(authUser);
    setUser(authUser);

    window.dispatchEvent(new Event(STORAGE_EVENTS.studentsChanged));
    window.dispatchEvent(new Event(STORAGE_EVENTS.authChanged));
    return { ok: true, user: authUser };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    writeStoredSessionUser(null);
    window.dispatchEvent(new Event(STORAGE_EVENTS.authChanged));
  }, []);

  const value = useMemo(
    () => ({ user, loginWithCredentials, registerStudent, logout }),
    [user, loginWithCredentials, registerStudent, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
