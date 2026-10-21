import type { CellState } from "@/lib/attendance";

export const CELL_CLASS: Record<CellState, string> = {
  present: "bg-burgundy text-[#121b29] border border-burgundy",
  late: "bg-gold text-gold-ink border border-gold",
  absent: "bg-transparent text-burgundy border-[1.5px] border-burgundy/75",
  unmarked: "bg-white/[0.04] text-muted border border-white/25",
  none: "bg-white/[0.02] text-transparent border border-dashed border-white/15",
};

export const CELL_MARK: Record<CellState, string> = {
  present: "✓",
  late: "✓",
  absent: "×",
  unmarked: "?",
  none: "",
};

export const CELL_WORD: Record<CellState, string> = {
  present: "был",
  late: "опоздал",
  absent: "не пришёл",
  unmarked: "не отмечено",
  none: "не назначена",
};

/** Маленький квадратик истории. */
export const DOT_CLASS: Record<CellState, string> = {
  present: "bg-burgundy",
  late: "bg-gold",
  absent: "border-[1.5px] border-burgundy/80",
  unmarked: "border border-white/30",
  none: "border border-dashed border-white/15",
};
