"use client";

import { useState } from "react";

/** Сайты-агрегаторы: их значок не похож на логотип самого конкурса. */
const AGGREGATORS = [
  "borderless.so",
  "lumiere-education.com",
  "the-tech.kz",
  "t.me",
  "slc.gr",
  "olimpiada.ru",
  "docs.google.com",
  "forms.gle",
  "instagram.com",
];

const PALETTE = [
  ["#7f2231", "#f0d9a8"],
  ["#23334a", "#cbb073"],
  ["#3b2a52", "#e3cd98"],
  ["#1f4a43", "#bfe3d6"],
  ["#4a3320", "#f0d9a8"],
];

function domainOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (AGGREGATORS.some((a) => host === a || host.endsWith(`.${a}`))) return null;
    return host;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  const words = name
    .replace(/[«»"()]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(по|для|и|of|the|and|—|-)$/i.test(w));
  if (words.length === 0) return "?";
  const caps = name.match(/\b[A-Z]{2,5}\b/);
  if (caps) return caps[0].slice(0, 4);
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Логотип возможности: свой (logoUrl) → значок сайта организатора →
 * монограмма в фирменных цветах.
 */
export function OpportunityLogo({
  name,
  url,
  logoUrl,
  size = 44,
}: {
  name: string;
  url?: string | null;
  logoUrl?: string | null;
  size?: number;
}) {
  const domain = url ? domainOf(url) : null;
  const sources = [
    logoUrl || null,
    domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : null,
  ].filter((s): s is string => Boolean(s));
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  const hash = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [bg, fg] = PALETTE[hash % PALETTE.length];

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10"
      style={{ width: size, height: size, background: src ? "#f4f2ec" : bg }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-[70%] object-contain"
          onError={() => setFailed((f) => f + 1)}
          onLoad={(e) => {
            // Пустой значок по умолчанию (16×16 «глобус») — показываем монограмму
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalWidth < 20) setFailed((f) => f + 1);
          }}
        />
      ) : (
        <span className="font-semibold tracking-tight" style={{ color: fg, fontSize: size * 0.32 }}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
