import { createBrowserClient } from "@supabase/ssr";

function readSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  return { url, key };
}

function looksLikePlaceholder(value: string) {
  const lower = value.toLowerCase();
  return (
    !value ||
    value.includes("…") ||
    value.includes("...") ||
    lower.includes("your_project") ||
    lower.includes("your_anon") ||
    lower.includes("anon key") ||
    lower.includes("из supabase") ||
    lower.includes("example")
  );
}

export function isSupabaseConfigured() {
  const { url, key } = readSupabaseEnv();
  if (looksLikePlaceholder(url) || looksLikePlaceholder(key)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname.endsWith("supabase.co") ||
        parsed.hostname.endsWith("supabase.in"))
    );
  } catch {
    return false;
  }
}

export function createClient() {
  const { url, key } = readSupabaseEnv();

  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase не настроен. Добавьте реальные NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local (локально) или в Vercel → Settings → Environment Variables (продакшен), затем сделайте Redeploy.",
    );
  }

  return createBrowserClient(url, key);
}
