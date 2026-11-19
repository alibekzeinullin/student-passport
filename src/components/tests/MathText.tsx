"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment, useMemo } from "react";

/** Текст с формулами: $…$ — в строке, $$…$$ — отдельной строкой. Переносы строк сохраняются. */
export function MathText({ text, className = "" }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    const out: { math?: string; display?: boolean; text?: string }[] = [];
    const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index! > last) out.push({ text: text.slice(last, m.index) });
      out.push({ math: m[1] ?? m[2], display: Boolean(m[1]) });
      last = m.index! + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }, [text]);

  return (
    <span className={`whitespace-pre-wrap ${className}`}>
      {parts.map((p, i) =>
        p.math !== undefined ? (
          <span
            key={i}
            className={p.display ? "my-2 block text-center" : ""}
            // KaTeX сам экранирует ввод; trust=false — без ссылок и команд
            dangerouslySetInnerHTML={{ __html: katex.renderToString(p.math, { throwOnError: false, displayMode: p.display, trust: false, strict: "ignore" }) }}
          />
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </span>
  );
}
