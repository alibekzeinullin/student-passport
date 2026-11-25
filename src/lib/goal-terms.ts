/** Четверти и прогресс целей — без зависимостей, можно и на сервере. */

/**
 * Четверть по дате (школы Казахстана): сен–окт — 1, ноя–дек — 2, янв–мар — 3, апр–авг — 4.
 * Ключ «2026-27:2».
 */
export function termOf(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 9 ? y : y - 1;
  const q = m >= 9 && m <= 10 ? 1 : m >= 11 ? 2 : m <= 3 ? 3 : 4;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}:${q}`;
}

export function termLabel(term: string): string {
  const [year, q] = term.split(":");
  return `${q} четверть ${year.replace("-", "–")}`;
}

/** Соседние четверти: предыдущая, текущая, следующая — для выбора у ментора. */
export function nearbyTerms(current: string): string[] {
  const [year, qs] = current.split(":");
  const start = Number(year.split("-")[0]);
  const q = Number(qs);
  const key = (s: number, n: number) => `${s}-${String((s + 1) % 100).padStart(2, "0")}:${n}`;
  const prev = q === 1 ? key(start - 1, 4) : key(start, q - 1);
  const next = q === 4 ? key(start + 1, 1) : key(start, q + 1);
  return [prev, current, next];
}

export function goalPct(g: { done: number; target: number }): number {
  return Math.min(100, Math.round((100 * g.done) / Math.max(1, g.target)));
}

