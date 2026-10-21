import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-gold text-gold-ink font-semibold hover:bg-[#d9c18a] hover:shadow-[0_0_24px_rgba(203,176,115,0.35)] focus-visible:ring-gold/50",
  secondary:
    "bg-transparent text-navy border border-white/20 hover:border-gold/60 hover:bg-white/5 focus-visible:ring-gold/50",
  ghost:
    "bg-transparent text-navy hover:bg-white/5 focus-visible:ring-white/20",
  danger:
    "bg-transparent text-burgundy border border-burgundy/40 hover:bg-burgundy/10 focus-visible:ring-burgundy/30",
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
      className={`inline-flex max-w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
