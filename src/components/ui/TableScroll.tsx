import type { ReactNode } from "react";

export function TableScroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}
    >
      {children}
    </div>
  );
}
