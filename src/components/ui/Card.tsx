import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-lg border border-light-gray bg-card shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-light-gray px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold leading-snug text-navy">{title}</h3>
        {subtitle ? (
          <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 sm:ml-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-4 py-3 sm:px-5 sm:py-4 ${className}`}>{children}</div>;
}
