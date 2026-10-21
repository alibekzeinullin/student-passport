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
      <div className="px-1">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gold">
          <span className="inline-block size-1.5 rounded-full bg-gold" aria-hidden />
          Раздел {number}
        </p>
        <h2 className="mt-1.5 text-xl font-medium leading-snug tracking-tight text-navy sm:text-2xl">
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
