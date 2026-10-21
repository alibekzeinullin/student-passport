import type { ReactNode } from "react";

const ZONE_STYLES = {
  academic: "border-navy-soft/15 bg-navy-deep/35",
  growth: "border-gold/15 bg-gold/[0.03]",
  other: "border-white/[0.07] bg-white/[0.015]",
} as const;

export type ZoneTone = keyof typeof ZONE_STYLES;

export function ZoneBand({
  tone,
  children,
}: {
  tone: ZoneTone;
  children: ReactNode;
}) {
  return (
    <div
      className={`sp-rise min-w-0 space-y-5 rounded-3xl border px-3 py-4 sm:space-y-6 sm:px-6 sm:py-6 ${ZONE_STYLES[tone]}`}
    >
      {children}
    </div>
  );
}
