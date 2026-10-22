"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/* Минимальные типы Web Speech API (в lib.dom их нет). */
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

/**
 * Кнопка диктовки: говорите — текст добавляется в поле.
 * Работает в Chrome, Edge и Safari; в остальных браузерах кнопка не показывается.
 */
export function VoiceButton({
  onText,
  lang = "ru-RU",
  className = "",
}: {
  onText: (text: string) => void;
  lang?: string;
  className?: string;
}) {
  const supported = useSyncExternalStore(noop, () => getCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => () => rec.current?.stop(), []);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      text = text.trim();
      if (text) onTextRef.current(text.charAt(0).toUpperCase() + text.slice(1));
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Разрешите доступ к микрофону" : "");
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setError("");
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        title={listening ? "Остановить диктовку" : "Надиктовать голосом"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
          listening
            ? "border-burgundy/60 bg-burgundy/15 text-burgundy"
            : "border-white/15 text-muted hover:border-gold/50 hover:text-navy"
        }`}
      >
        <svg viewBox="0 0 24 24" className={`size-3.5 ${listening ? "animate-pulse" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
        {listening ? "Слушаю… стоп" : "Голосом"}
      </button>
      {error ? <span className="text-xs text-burgundy">{error}</span> : null}
    </span>
  );
}

/** Добавить надиктованный текст к уже написанному. */
export function appendText(current: string, add: string): string {
  if (!current.trim()) return add;
  const sep = /[\n]$/.test(current) ? "" : /[.!?…]$/.test(current.trim()) ? " " : ". ";
  return current.replace(/\s+$/, (m) => (m.includes("\n") ? m : "")) + sep + add;
}
