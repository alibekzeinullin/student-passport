"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LoginForm } from "@/components/LoginForm";

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") {
      router.replace("/admin");
    } else if (user.role === "student") {
      router.replace("/dashboard");
    } else {
      router.replace("/");
    }
  }, [user, router]);

  if (user) return null;

  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_#e4d8b8_0%,_#ececec_45%,_#d1d1d1_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-48 bg-[linear-gradient(180deg,rgba(127,34,49,0.08),transparent)]"
      />
      <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-6xl items-center px-4 py-16 sm:px-6">
        <LoginForm />
      </div>
    </div>
  );
}
