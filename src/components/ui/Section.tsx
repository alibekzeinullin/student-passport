import type { ReactNode } from "react";

export function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="border-l-4 border-burgundy pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Раздел {number}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-navy">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
