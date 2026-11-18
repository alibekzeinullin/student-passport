"use client";

import { useEffect } from "react";

/** Светлая тема SAT: включена, пока хоть один «потребитель» активен (страница SAT или вкладка SAT ученика). */
let users = 0;

function apply() {
  if (typeof document === "undefined") return;
  if (users > 0) document.documentElement.dataset.theme = "sat";
  else delete document.documentElement.dataset.theme;
}

export function useSatTheme(active: boolean) {
  useEffect(() => {
    if (!active) return;
    users += 1;
    apply();
    return () => {
      users = Math.max(0, users - 1);
      apply();
    };
  }, [active]);
}
