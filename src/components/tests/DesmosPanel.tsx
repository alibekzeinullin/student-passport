"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Desmos?: { GraphingCalculator: (el: HTMLElement, opts?: Record<string, unknown>) => { destroy: () => void } };
  }
}

const KEY = process.env.NEXT_PUBLIC_DESMOS_API_KEY?.trim() ?? "";

/**
 * Калькулятор Desmos для модулей Math. С ключом API (NEXT_PUBLIC_DESMOS_API_KEY в Vercel) — прямо на странице,
 * без ключа — кнопка, которая открывает Desmos в отдельном окне.
 */
export function DesmosPanel({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!KEY);

  useEffect(() => {
    if (!KEY || !box.current) return;
    let calc: { destroy: () => void } | null = null;
    const mount = () => {
      if (window.Desmos && box.current) calc = window.Desmos.GraphingCalculator(box.current, { keypad: true, expressions: true, settingsMenu: false, links: false });
    };
    if (window.Desmos) mount();
    else {
      const s = document.createElement("script");
      s.src = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${encodeURIComponent(KEY)}`;
      s.async = true;
      s.onload = mount;
      s.onerror = () => setFailed(true);
      document.head.appendChild(s);
    }
    return () => calc?.destroy();
  }, []);

  return (
    <aside className="flex w-full max-w-[28rem] shrink-0 flex-col border-l border-navy/10 bg-white" aria-label="Калькулятор Desmos">
      <div className="flex items-center justify-between border-b border-navy/10 px-3 py-2">
        <span className="text-sm font-semibold text-navy">Desmos</span>
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-navy">
          скрыть
        </button>
      </div>
      {failed ? (
        <div className="space-y-3 p-4 text-sm text-navy">
          <p>Калькулятор откроется в отдельном окне — держите его рядом с тестом.</p>
          <button
            type="button"
            className="rounded-full bg-gold px-4 py-2 font-semibold text-gold-ink"
            onClick={() => window.open("https://www.desmos.com/calculator", "desmos", "width=520,height=720,noopener")}
          >
            Открыть Desmos
          </button>
        </div>
      ) : (
        <div ref={box} className="min-h-0 flex-1" />
      )}
    </aside>
  );
}
