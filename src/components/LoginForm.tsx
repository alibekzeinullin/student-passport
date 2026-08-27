"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { EducationSystem } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Field";

const SYSTEMS: EducationSystem[] = ["IB", "AP", "A-Level", "Национальная"];

export function LoginForm() {
  const { loginWithCredentials, registerStudent } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    fullName: "",
    email: "",
    password: "",
    className: "",
    school: "",
    educationSystem: "IB" as EducationSystem,
  });

  const doLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await loginWithCredentials(
        loginForm.email,
        loginForm.password,
      );
      if (!result.ok) {
        setError(result.error ?? "Ошибка входа");
        return;
      }
      router.push(result.user?.role === "admin" ? "/admin" : "/dashboard");
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await registerStudent(signupForm);
      if (!result.ok) {
        setError(result.error ?? "Ошибка регистрации");
        return;
      }
      router.push(result.user?.role === "admin" ? "/admin" : "/dashboard");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-burgundy">
          TODAY Scholars
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy">
          Digital Passport TODAY Scholars
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Вход через Supabase. Зарегистрируйте ученика или войдите как админ.
        </p>
      </div>

      <Card className="border-gold/50">
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 rounded-md border border-light-gray p-1">
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm font-medium ${
                mode === "login" ? "bg-navy text-white" : "text-navy"
              }`}
              onClick={() => setMode("login")}
            >
              Вход
            </button>
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm font-medium ${
                mode === "register" ? "bg-burgundy text-white" : "text-navy"
              }`}
              onClick={() => setMode("register")}
            >
              Регистрация ученика
            </button>
          </div>

          {mode === "login" ? (
            <div className="space-y-3">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={loginForm.email}
                  onChange={(e) =>
                    setLoginForm((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="you@email.com"
                />
              </div>
              <div>
                <Label>Пароль</Label>
                <Input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm((p) => ({ ...p, password: e.target.value }))
                  }
                  placeholder="Введите пароль"
                />
              </div>
              <Button className="w-full" onClick={doLogin} disabled={busy}>
                {busy ? "Вход…" : "Войти"}
              </Button>
              <p className="text-xs text-muted">
                После первой регистрации админа выполните SQL из SUPABASE_SETUP.md,
                чтобы назначить роль admin.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>ФИО</Label>
                <Input
                  value={signupForm.fullName}
                  onChange={(e) =>
                    setSignupForm((p) => ({ ...p, fullName: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={signupForm.email}
                  onChange={(e) =>
                    setSignupForm((p) => ({ ...p, email: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Пароль</Label>
                <Input
                  type="password"
                  value={signupForm.password}
                  onChange={(e) =>
                    setSignupForm((p) => ({ ...p, password: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Класс</Label>
                <Input
                  value={signupForm.className}
                  onChange={(e) =>
                    setSignupForm((p) => ({ ...p, className: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Школа</Label>
                <Input
                  value={signupForm.school}
                  onChange={(e) =>
                    setSignupForm((p) => ({ ...p, school: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Образовательная система</Label>
                <Select
                  value={signupForm.educationSystem}
                  onChange={(e) =>
                    setSignupForm((p) => ({
                      ...p,
                      educationSystem: e.target.value as EducationSystem,
                    }))
                  }
                >
                  {SYSTEMS.map((system) => (
                    <option key={system} value={system}>
                      {system}
                    </option>
                  ))}
                </Select>
              </div>
              <Button className="w-full" onClick={doRegister} disabled={busy}>
                {busy ? "Регистрация…" : "Зарегистрироваться"}
              </Button>
            </div>
          )}

          {error ? <p className="text-sm text-burgundy">{error}</p> : null}
        </CardBody>
      </Card>
    </div>
  );
}
