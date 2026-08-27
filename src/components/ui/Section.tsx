import type { ReactNode } from "react";

export function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-4">
      <div className="border-l-4 border-burgundy pl-3 sm:pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted sm:tracking-[0.14em]">
          Раздел {number}
        </p>
        <h2 className="mt-1 text-lg font-semibold leading-snug text-navy sm:text-xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
