"use client";

/**
 * Простой кэш данных на время сессии (stale-while-revalidate):
 * при повторном открытии страницы сразу показываем то, что уже загружали,
 * и тихо обновляем в фоне. Без «Загрузка…» и мигания.
 */
const store = new Map<string, unknown>();

export function peek<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const data = await fetcher();
  store.set(key, data);
  return data;
}

/** Сбросить кэш по префиксу (после выхода из аккаунта). */
export function clearCache(prefix = ""): void {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Анимации появления — только при первом показе в сессии. */
const played = new Set<string>();

export function firstTime(key: string): boolean {
  if (played.has(key)) return false;
  played.add(key);
  return true;
}

export function markPlayed(key: string): void {
  played.add(key);
}

export function hasPlayed(key: string): boolean {
  return played.has(key);
}
