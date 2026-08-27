"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { splitFullName } from "@/lib/supabase/mappers";
import type { DbProfile } from "@/lib/supabase/database.types";
import type {
  AuthUser,
  StudentRegistrationInput,
} from "@/lib/types";

interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  error?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginWithCredentials: (
    email: string,
    password: string,
  ) => Promise<AuthResult>;
  registerStudent: (input: StudentRegistrationInput) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadAuthUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, student_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    console.error("Failed to load profile", error);
    return null;
  }

  const typed = profile as DbProfile;
  return {
    id: typed.id,
    name: typed.full_name || user.email || "User",
    email: user.email ?? "",
    role: typed.role,
    studentId: typed.student_id ?? undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const next = await loadAuthUser();
      setUser(next);
    } catch (error) {
      console.error(error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    void refreshUser();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshUser();
    });

    return () => subscription.unsubscribe();
  }, [refreshUser]);

  const loginWithCredentials = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!isSupabaseConfigured()) {
        return {
          ok: false,
          error: "Supabase не настроен. Проверьте .env.local",
        };
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !password) {
        return { ok: false, error: "Введите email и пароль" };
      }

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("invalid login credentials")) {
          return {
            ok: false,
            error:
              "Неверный email/пароль, или email ещё не подтверждён. В Supabase: Authentication → Providers → Email → выключите Confirm email, затем войдите снова.",
          };
        }
        if (msg.includes("email not confirmed")) {
          return {
            ok: false,
            error:
              "Email не подтверждён. В Supabase выключите Confirm email (Authentication → Providers → Email) или подтвердите пользователя в Authentication → Users.",
          };
        }
        return { ok: false, error: error.message };
      }

      const next = await loadAuthUser();
      if (!next) {
        return {
          ok: false,
          error: "Вход выполнен, но профиль не найден. Проверьте schema.sql",
        };
      }

      setUser(next);
      return { ok: true, user: next };
    },
    [],
  );

  const registerStudent = useCallback(
    async (input: StudentRegistrationInput): Promise<AuthResult> => {
      if (!isSupabaseConfigured()) {
        return {
          ok: false,
          error: "Supabase не настроен. Проверьте .env.local",
        };
      }

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

      const { firstName, lastName } = splitFullName(fullName);
      const supabase = createClient();

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: "student",
            full_name: fullName,
            first_name: firstName,
            last_name: lastName,
            class_name: className,
            school,
            education_system: input.educationSystem,
          },
        },
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      // Если confirm email выключен — сессия уже есть.
      // Если включён — попробуем сразу войти.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const login = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (login.error) {
          return {
            ok: false,
            error:
              "Аккаунт создан, но войти нельзя: в Supabase включено подтверждение email. Откройте Authentication → Providers → Email → выключите Confirm email. Потом войдите тем же email и паролем (вкладка «Вход»).",
          };
        }
      }

      // Триггер создаёт student+profile — небольшая пауза и повтор
      let next: AuthUser | null = null;
      for (let i = 0; i < 5; i += 1) {
        next = await loadAuthUser();
        if (next?.studentId) break;
        await new Promise((r) => setTimeout(r, 300));
      }

      if (!next) {
        return {
          ok: false,
          error:
            "Аккаунт создан, но профиль не появился. Проверьте, что schema.sql выполнен.",
        };
      }

      setUser(next);
      return { ok: true, user: next };
    },
    [],
  );

  const logout = useCallback(async () => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      loginWithCredentials,
      registerStudent,
      logout,
      refreshUser,
    }),
    [user, loading, loginWithCredentials, registerStudent, logout, refreshUser],
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
