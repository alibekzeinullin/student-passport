"use client";

import { MathText } from "@/components/tests/MathText";

/** Справочник формул для модулей Math — как «Reference Sheet» в Bluebook. */
const ITEMS: [string, string][] = [
  ["Круг", "$A = \\pi r^2$, $\\quad C = 2\\pi r$"],
  ["Прямоугольник", "$A = \\ell w$"],
  ["Треугольник", "$A = \\tfrac{1}{2} b h$"],
  ["Теорема Пифагора", "$c^2 = a^2 + b^2$"],
  ["Треугольник 30°–60°–90°", "стороны $x$, $x\\sqrt{3}$, $2x$"],
  ["Треугольник 45°–45°–90°", "стороны $s$, $s$, $s\\sqrt{2}$"],
  ["Прямоугольный параллелепипед", "$V = \\ell w h$"],
  ["Цилиндр", "$V = \\pi r^2 h$"],
  ["Шар", "$V = \\tfrac{4}{3}\\pi r^3$"],
  ["Конус", "$V = \\tfrac{1}{3}\\pi r^2 h$"],
  ["Пирамида", "$V = \\tfrac{1}{3} \\ell w h$"],
];

export function ReferenceSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Справочник формул"
      className="absolute right-3 top-3 z-30 flex max-h-[calc(100%-1.5rem)] w-[min(92vw,24rem)] flex-col overflow-hidden rounded-2xl border border-navy/15 bg-white shadow-2xl"
    >
      <div className="flex items-center justify-between bg-navy px-4 py-2.5 text-white">
        <span className="text-sm font-semibold">Справочник формул</span>
        <button type="button" onClick={onClose} className="text-sm text-white/80 hover:text-white" aria-label="Закрыть справочник">
          ✕
        </button>
      </div>
      <div className="space-y-2.5 overflow-y-auto px-4 py-3 text-sm text-navy">
        {ITEMS.map(([name, f]) => (
          <div key={name} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-navy/5 pb-2">
            <span className="text-muted">{name}</span>
            <MathText text={f} />
          </div>
        ))}
        <p className="pt-1 text-muted">
          В окружности 360° или <MathText text="$2\pi$" /> радиан. Сумма углов треугольника равна 180°.
        </p>
        <p className="text-muted">
          Обозначения: <MathText text="$r$" /> — радиус, <MathText text="$\ell$" /> — длина, <MathText text="$w$" /> — ширина,{" "}
          <MathText text="$h$" /> — высота, <MathText text="$b$" /> — основание.
        </p>
      </div>
    </div>
  );
}

/** Инструкция к модулю — как «Directions» в Bluebook. */
export function Directions({ section, onClose }: { section: "verbal" | "math"; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Инструкция к модулю"
      className="absolute left-3 top-3 z-30 w-[min(92vw,34rem)] rounded-2xl border border-navy/15 bg-white p-5 text-sm leading-relaxed text-navy shadow-2xl"
    >
      {section === "verbal" ? (
        <>
          <p>Вопросы проверяют ключевые навыки чтения и письма. В каждом вопросе есть один или несколько текстов, иногда таблица или график.</p>
          <p className="mt-2">Внимательно прочитайте текст и вопрос, затем выберите лучший ответ. У каждого вопроса один лучший ответ.</p>
        </>
      ) : (
        <>
          <p>Вопросы проверяют ключевые навыки по математике. Можно пользоваться калькулятором Desmos и справочником формул (кнопки сверху справа).</p>
          <p className="mt-2">Если не сказано иное: все переменные и выражения — действительные числа, рисунки выполнены в масштабе, все фигуры лежат в плоскости.</p>
          <p className="mt-2 font-semibold">Вопросы с выбором ответа</p>
          <p>Выберите один правильный вариант.</p>
          <p className="mt-2 font-semibold">Вопросы с вводом ответа</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Если правильных ответов несколько, введите любой один.</li>
            <li>Можно вводить целое число, дробь (3/4) или десятичную (0.75), в том числе отрицательные.</li>
            <li>Смешанные числа вводите как обычную дробь: 3 1/2 → 7/2 или 3.5.</li>
            <li>Знаки %, $ и единицы измерения не пишите.</li>
          </ul>
        </>
      )}
      <div className="mt-4 text-right">
        <button type="button" onClick={onClose} className="rounded-full bg-navy px-5 py-1.5 font-semibold text-white">
          Закрыть
        </button>
      </div>
    </div>
  );
}
