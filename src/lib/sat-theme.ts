"use client";

import { useEffect } from "react";

/**
 * Светлая тема SAT: включена, пока хоть один «потребитель» активен (страница SAT или вкладка SAT ученика).
 *
 * Чтобы при загрузке не было вспышки тёмной темы, скрипт в <head> (SAT_THEME_BOOT) ставит
 * data-theme="sat" ещё до отрисовки — по адресу страницы и по тому, какая тема была на этом
 * адресе в прошлый раз. Эта догадка держится, пока страница не «определилась» (useSatThemeReady):
 * до этого момента тема не снимается, даже если потребителей ещё нет.
 */
let users = 0;
let settled = false;
/** Запоминаем тему страницы только для вошедшего пользователя: при выходе тема снимается, но не записывается. */
let signedIn = false;

/** Вызывается в шапке при каждой отрисовке — до того, как сработают эффекты выхода. */
export function setThemeUser(hasUser: boolean) {
  signedIn = hasUser;
}

const STORE_PREFIX = "sp-theme:";

function remember(sat: boolean) {
  if (!signedIn) return;
  try {
    localStorage.setItem(STORE_PREFIX + location.pathname, sat ? "sat" : "");
  } catch {
    /* localStorage недоступен — просто без запоминания */
  }
}

function apply() {
  if (typeof document === "undefined") return;
  if (users > 0) {
    document.documentElement.dataset.theme = "sat";
    remember(true);
  } else if (settled) {
    delete document.documentElement.dataset.theme;
    remember(false);
  }
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

/**
 * Страница знает, нужна ли ей светлая тема (данные загружены). Пока ready=false, тему,
 * поставленную скриптом в <head>, не трогаем.
 */
export function useSatThemeReady(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    settled = true;
    apply();
  }, [ready]);
}

/** Выполняется в <head> до первой отрисовки. Пути SAT — те же, что в AppHeader (SAT_MAIN) + прохождение теста. */
export const SAT_THEME_BOOT = `(function(){try{var p=location.pathname;var sat=/^\\/(admin\\/(lessons|results|tests|groups)|test\\/)/.test(p);var s=localStorage.getItem("${STORE_PREFIX}"+p);if(s!==null)sat=s==="sat";if(sat)document.documentElement.dataset.theme="sat";}catch(e){}})();`;
