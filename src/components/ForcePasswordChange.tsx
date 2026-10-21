"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";

/** Первый вход с временным паролем: попросить придумать свой. */
export function ForcePasswordChange() {
  const { user, refreshUser, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (password.length < 8) {
      setError("Минимум 8 символов");
      return;
    }
    if (password !== repeat) {
      setError("Пароли не совпадают");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    if (err) {
      setError(
        err.message.toLowerCase().includes("different")
          ? "Новый пароль должен отличаться от временного"
          : "Не удалось сохранить пароль. Попробуйте ещё раз.",
      );
      setBusy(false);
      return;
    }
    await refreshUser();
    setBusy(false);
  };

  return (
    <div className="sp-rise mx-auto flex min-h-[calc(100vh-73px)] max-w-md items-center px-4 py-10">
      <div className="sp-glass w-full rounded-3xl border px-6 py-7">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Первый вход</p>
        <h2 className="mt-2 text-2xl font-light text-navy">
          {user?.name ? `${user.name.split(" ")[0]}, придумайте свой пароль` : "Придумайте свой пароль"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Вы вошли по временному паролю от ментора. Задайте свой — его будете знать только вы.
        </p>
        <div className="mt-5 space-y-3">
          <div>
            <Label htmlFor="np1">Новый пароль</Label>
            <Input id="np1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="np2">Ещё раз</Label>
            <Input
              id="np2"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          {error ? <p className="text-sm text-burgundy">{error}</p> : null}
          <Button type="button" className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? "Сохраняю…" : "Сохранить пароль"}
          </Button>
          <button type="button" onClick={() => void logout()} className="w-full text-center text-sm text-muted hover:text-navy">
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}
