"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LoginForm } from "@/components/LoginForm";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (user.role === "admin") {
      router.replace("/admin");
    } else if (user.role === "student") {
      router.replace("/dashboard");
    } else {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted">
        Загрузка…
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-24 -z-10 size-[520px] -translate-x-1/2 rounded-full bg-gold/10 blur-[120px]"
      />
      <div className="sp-rise mx-auto flex min-h-[calc(100vh-73px)] max-w-6xl items-center px-4 py-10 sm:px-6 sm:py-16">
        <LoginForm />
      </div>
    </div>
  );
}
