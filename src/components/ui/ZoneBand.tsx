import type { ReactNode } from "react";

const ZONE_STYLES = {
  academic: "border-navy/15 bg-[#e6edf5]",
  growth: "border-gold/40 bg-[#f3ecdc]",
  other: "border-burgundy/15 bg-[#f1e8ea]",
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
      className={`min-w-0 space-y-5 rounded-xl border px-3 py-4 sm:space-y-6 sm:px-5 sm:py-5 ${ZONE_STYLES[tone]}`}
    >
      {children}
    </div>
  );
}
