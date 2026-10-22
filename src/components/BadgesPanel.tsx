"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BADGE_GROUP_LABELS, pickShowcase, type Badge, type BadgeGroup } from "@/lib/achievements";

/**
 * Достижения в карточке: до 6 полученных + 3 ближайшие цели с прогрессом.
 * Полный список — по кнопке «Все», в отдельном окне по группам.
 */
export function BadgesPanel({
  badges,
  studentId,
  ready,
  celebrate,
}: {
  badges: Badge[];
  studentId: string;
  ready: boolean;
  celebrate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<Badge[]>([]);
  const { earned, next } = pickShowcase(badges);
  const total = badges.filter((b) => b.earned).length;
  const earnedKey = badges
    .filter((b) => b.earned)
    .map((b) => b.id)
    .join(",");

  // Поздравление ученику: только новые значки с прошлого визита
  useEffect(() => {
    if (!celebrate || !ready) return;
    const key = `sp-badges-${studentId}`;
    const now = earnedKey ? earnedKey.split(",") : [];
    let seen: string[] | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      seen = raw === null ? null : (JSON.parse(raw) as string[]);
      window.localStorage.setItem(key, JSON.stringify(now));
    } catch {
      return;
    }
    if (seen === null) return; // первый визит — без салюта за всё сразу
    const added = now.filter((id) => !seen.includes(id));
    if (!added.length) return;
    const show = window.setTimeout(() => setFresh(
          added
            .map((id) => badges.find((b) => b.id === id))
            .filter((b): b is Badge => Boolean(b))
            .sort((a, b) => Number(Boolean(b.rare)) - Number(Boolean(a.rare))),
        ), 600);
    const hide = window.setTimeout(() => setFresh([]), 7000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
    // badges пересчитываются каждый рендер; достаточно списка полученных
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate, ready, studentId, earnedKey]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Достижения</h3>
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted underline-offset-2 hover:text-gold hover:underline">
          {total} из {badges.length} · все →
        </button>
      </div>

      {earned.length ? (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {earned.map((b) => (
            <Tile key={b.id} badge={b} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Первое достижение — уже близко.</p>
      )}

      {next.length ? (
        <div className="mt-4">
          <p className="text-[11px] text-muted">Следующие цели</p>
          <ul className="mt-2 flex flex-col gap-2.5">
            {next.map((b) => (
              <NextRow key={b.id} badge={b} />
            ))}
          </ul>
        </div>
      ) : null}

      {open ? createPortal(<AllBadges badges={badges} onClose={() => setOpen(false)} />, document.body) : null}

      {fresh.length ? createPortal(
        <div
          role="status"
          className="sp-rise fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-gold/40 bg-[#1b2638] px-4 py-3 shadow-2xl"
        >
          <BadgeIcon icon={fresh[0].icon} earned rare={fresh[0].rare} large />
          <div className="text-sm">
            <p className="text-[11px] uppercase tracking-[0.14em] text-gold">
              {fresh.length > 1 ? `Новые достижения: ${fresh.length}` : "Новое достижение"}
            </p>
            <p className="text-navy">
              {fresh.slice(0, 2).map((b) => b.title).join(", ")}
              {fresh.length > 2 ? ` и ещё ${fresh.length - 2}` : ""}
            </p>
          </div>
          <button type="button" onClick={() => setFresh([])} className="ml-2 text-lg text-muted hover:text-navy" aria-label="Закрыть">
            ×
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function Tile({ badge }: { badge: Badge }) {
  return (
    <li
      className={`flex flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-3 text-center ${
        badge.rare ? "border-gold/60 bg-gradient-to-b from-gold/20 to-burgundy/10" : "border-gold/30 bg-gold/[0.08]"
      }`}
      title={badge.hint}
    >
      <BadgeIcon icon={badge.icon} earned rare={badge.rare} />
      <span className="text-[11px] leading-tight text-navy">{badge.title}</span>
    </li>
  );
}

function NextRow({ badge }: { badge: Badge }) {
  const pr = badge.progress;
  const pct = pr ? (pr.value / pr.goal) * 100 : 0;
  return (
    <li className="flex items-center gap-3" title={badge.hint}>
      <span className="opacity-60">
        <BadgeIcon icon={badge.icon} earned={false} small />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate text-navy">{badge.title}</span>
          {pr ? (
            <span className="shrink-0 tabular-nums text-muted">
              {pr.value}/{pr.goal}
            </span>
          ) : null}
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gold/70" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </li>
  );
}

function AllBadges({ badges, onClose }: { badges: Badge[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = (Object.keys(BADGE_GROUP_LABELS) as BadgeGroup[])
    .map((g) => ({ g, list: badges.filter((b) => b.group === g) }))
    .filter((x) => x.list.length);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Все достижения"
        onClick={(e) => e.stopPropagation()}
        className="sp-rise max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#152031] px-5 py-5 sm:rounded-3xl sm:px-7"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-light text-navy">
            Все достижения{" "}
            <span className="text-sm text-muted">
              {badges.filter((b) => b.earned).length} из {badges.length}
            </span>
          </h3>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-muted hover:text-navy" aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="mt-4 space-y-5">
          {groups.map(({ g, list }) => (
            <section key={g}>
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{BADGE_GROUP_LABELS[g]}</h4>
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.map((b) => (
                  <li
                    key={b.id}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                      b.earned
                        ? b.rare
                          ? "border-gold/60 bg-gradient-to-r from-gold/15 to-burgundy/10"
                          : "border-gold/30 bg-gold/[0.07]"
                        : "border-white/[0.06] bg-white/[0.02]"
                    }`}
                  >
                    <span className={b.earned ? "" : "opacity-50"}>
                      <BadgeIcon icon={b.icon} earned={b.earned} rare={b.rare} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${b.earned ? "text-navy" : "text-muted"}`}>
                        {b.title}
                        {b.earned ? <span className="ml-1.5 text-xs text-gold">✓</span> : null}
                      </span>
                      <span className="block text-[11px] leading-snug text-muted">{b.hint}</span>
                      {!b.earned && b.progress && b.progress.value > 0 ? (
                        <span className="mt-1 flex items-center gap-2">
                          <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                            <span className="block h-full rounded-full bg-gold/60" style={{ width: `${(b.progress.value / b.progress.goal) * 100}%` }} />
                          </span>
                          <span className="text-[10px] tabular-nums text-muted">
                            {b.progress.value}/{b.progress.goal}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BadgeIcon({
  icon,
  earned,
  rare,
  small,
  large,
}: {
  icon: Badge["icon"];
  earned: boolean;
  rare?: boolean;
  small?: boolean;
  large?: boolean;
}) {
  const stroke = earned ? (rare ? "#e8cf8f" : "var(--gold)") : "var(--muted)";
  const paths: Record<Badge["icon"], ReactNode> = {
    flame: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" />,
    star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
    book: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7" />,
    trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6" />,
    target: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01" />,
    rocket: <path d="M14 4c3 0 6 3 6 6l-6 6-6-6c0-3 3-6 6-6zM8 16l-3 3M10 18l-2 3M6 14l-3 2M15 9h.01" />,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
    check: <path d="M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0zM8.5 12l2.5 2.5 4.5-5" />,
    pen: <path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3M4 20h7" />,
    chart: <path d="M4 20V4M4 20h16M7 15l4-4 3 3 5-6M15 8h4v4" />,
    medal: <path d="M8 3l2 6M16 3l-2 6M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 13v4M10.5 14.5 12 13" />,
    crown: <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 19h14" />,
  };
  const size = large ? "size-8" : small ? "size-5" : "size-6";
  return (
    <svg
      viewBox="0 0 24 24"
      className={size}
      fill="none"
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={earned ? { filter: `drop-shadow(0 0 ${rare ? 9 : 6}px rgba(203,176,115,${rare ? 0.7 : 0.45}))` } : undefined}
    >
      {paths[icon]}
    </svg>
  );
}
