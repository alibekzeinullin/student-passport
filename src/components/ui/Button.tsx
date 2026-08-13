import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-burgundy text-white hover:bg-[#6a1c29] focus-visible:ring-burgundy/40",
  secondary:
    "bg-white text-navy border border-light-gray hover:bg-[#f5f5f5] focus-visible:ring-gold/50",
  ghost:
    "bg-transparent text-navy hover:bg-light-gray/50 focus-visible:ring-light-gray/60",
  danger:
    "bg-white text-burgundy border border-burgundy/30 hover:bg-burgundy/5 focus-visible:ring-burgundy/20",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
}

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
