/**
 * Разбор теста из Word по шаблону TODAY Scholars.
 *
 *   # Reading and Writing — Модуль 1 | Verbal | 32 мин
 *   1. Текст вопроса (формулы — $x^2+1$)
 *   A) вариант
 *   B) вариант
 *   C) вариант
 *   D) вариант
 *   Ответ: B
 *   Тема: Words in Context
 *   Баллы: 1
 *
 *   # Math — Модуль 1 | Math | 35 мин | калькулятор
 *   1. Чему равно …?
 *   Ответ: 3/4; 0.75          ← без вариантов = ввод ответа
 *
 * Отрывок для Verbal: «Текст: …» до строки «Вопрос: …». Картинка внутри вопроса прикрепляется к нему.
 * Нумерация «1.» и «A)» может быть как набранной, так и автоматическим списком Word.
 */

export interface ImportBlock {
  text: string;
  listItem: boolean;
  images: string[];
  heading: boolean;
}

export interface ImportQuestion {
  kind: "choice" | "input";
  passage: string;
  stem: string;
  image: string;
  options: string[];
  answer: string;
  topic: string;
  points: number;
}

export interface ImportSection {
  title: string;
  section: "verbal" | "math";
  minutes: number;
  calculator: boolean;
  questions: ImportQuestion[];
}

export interface ImportResult {
  title: string;
  sections: ImportSection[];
  warnings: string[];
}

const RE_QUESTION = /^\s*(\d{1,3})\s*[.)]\s*(.*)$/;
const RE_OPTION = /^\s*([A-Fa-fА-Га-г])\s*[).]\s*(.*)$/;
const RE_FIELD = /^\s*(Ответ|Answer|Тема|Topic|Баллы|Балл|Points|Вопрос|Question|Текст|Passage)\s*[:：]\s*(.*)$/i;
const CYR_TO_LAT: Record<string, string> = { А: "A", Б: "B", В: "C", Г: "D", а: "A", б: "B", в: "C", г: "D" };

function letter(raw: string): string {
  const c = raw.trim();
  return (CYR_TO_LAT[c] ?? c).toUpperCase();
}

function parseHeader(text: string, index: number): Omit<ImportSection, "questions"> {
  const parts = text
    .replace(/^#+\s*/, "")
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  const title = parts[0] || `Модуль ${index}`;
  const all = parts.join(" ").toLowerCase();
  const section: "verbal" | "math" = /math|матем/.test(all) && !/verbal|reading|writing/.test(parts.slice(1).join(" ").toLowerCase()) ? "math" : /verbal|reading|writing/.test(all) ? "verbal" : "math";
  const minutesMatch = all.match(/(\d{1,3})\s*(мин|min)/);
  const calculator = /калькул|calculator|desmos/.test(all);
  return { title, section, minutes: minutesMatch ? Number(minutesMatch[1]) : section === "math" ? 35 : 32, calculator: calculator || false };
}

function emptyQuestion(): ImportQuestion {
  return { kind: "choice", passage: "", stem: "", image: "", options: [], answer: "", topic: "", points: 1 };
}

function join(a: string, b: string): string {
  return a ? `${a}\n${b}` : b;
}

export function parseTestBlocks(blocks: ImportBlock[], fallbackTitle = "Тест"): ImportResult {
  const sections: ImportSection[] = [];
  const warnings: string[] = [];
  let title = "";
  let sec: ImportSection | null = null;
  let q: ImportQuestion | null = null;
  let mode: "stem" | "passage" | "options" | "after" = "stem";

  const closeQuestion = () => {
    if (q && sec) {
      if (q.stem || q.passage || q.options.length || q.image) sec.questions.push(q);
    }
    q = null;
  };

  for (const b of blocks) {
    const text = b.text.replace(/ /g, " ").trim();
    if (!text && !b.images.length) continue;
    if (text.startsWith("//")) continue;

    // Заголовок модуля
    if (text.startsWith("#") || (b.heading && /модул|module|section|math|verbal|reading/i.test(text))) {
      closeQuestion();
      sec = { ...parseHeader(text, sections.length + 1), questions: [] };
      sections.push(sec);
      mode = "stem";
      continue;
    }
    // До первого модуля: первая строка — название теста, остальное — инструкции
    if (!sec) {
      if (!title && text) title = text.replace(/^название\s*[:：]\s*/i, "");
      continue;
    }

    const field = text.match(RE_FIELD);
    const qm = text.match(RE_QUESTION);
    const om = text.match(RE_OPTION);

    // Новый вопрос: набранное «12. …» (кроме середины отрывка) или пункт автосписка Word после закрытого вопроса
    const typedStart = Boolean(qm) && !om && mode !== "passage";
    const listStart = b.listItem && !om && !field && (!q || mode === "after");
    if (typedStart || listStart) {
      closeQuestion();
      q = emptyQuestion();
      mode = "stem";
      const rest = qm ? qm[2] : text;
      if (/^(Текст|Passage)\s*[:：]/i.test(rest)) {
        mode = "passage";
        q.passage = rest.replace(/^(Текст|Passage)\s*[:：]\s*/i, "");
      } else q.stem = rest;
      if (b.images[0]) q.image = b.images[0];
      continue;
    }
    if (!q) {
      // текст между заголовком модуля и первым вопросом — пропускаем
      continue;
    }
    if (b.images[0] && !q.image) q.image = b.images[0];

    if (field) {
      const key = field[1].toLowerCase();
      const value = field[2].trim();
      if (key === "ответ" || key === "answer") {
        q.answer = value;
        mode = "after";
      } else if (key === "тема" || key === "topic") {
        q.topic = value;
        mode = "after";
      } else if (key.startsWith("балл") || key === "points") {
        const n = Number(value.replace(",", "."));
        q.points = Number.isFinite(n) && n >= 0 ? n : 1;
        mode = "after";
      } else if (key === "вопрос" || key === "question") {
        if (q.stem && !q.passage) q.passage = q.stem;
        q.stem = value;
        mode = "stem";
      } else if (key === "текст" || key === "passage") {
        q.passage = join(q.passage, value);
        mode = "passage";
      }
      continue;
    }
    if (om && mode !== "after") {
      q.options.push(om[2].trim());
      mode = "options";
      continue;
    }
    if (b.listItem && (mode === "options" || (q.stem && mode === "stem" && !qm))) {
      // автоматический список Word для вариантов A) B) C) D)
      q.options.push(text);
      mode = "options";
      continue;
    }
    if (!text) continue;
    if (mode === "passage") q.passage = join(q.passage, text);
    else if (mode === "options" && q.options.length) q.options[q.options.length - 1] = join(q.options[q.options.length - 1], text);
    else if (mode === "stem") q.stem = join(q.stem, text);
  }
  closeQuestion();

  // Проверки
  sections.forEach((s, si) => {
    if (!s.questions.length) warnings.push(`Модуль «${s.title}»: нет вопросов`);
    s.questions.forEach((qq, qi) => {
      const where = `«${s.title}», вопрос ${qi + 1}`;
      qq.kind = qq.options.length >= 2 ? "choice" : "input";
      if (qq.kind === "choice") {
        qq.answer = letter(qq.answer);
        const allowed = qq.options.map((_, i) => String.fromCharCode(65 + i));
        if (!qq.answer) warnings.push(`${where}: нет ответа`);
        else if (!allowed.includes(qq.answer)) warnings.push(`${where}: ответ «${qq.answer}», а вариантов ${allowed.join("/")}`);
      } else {
        if (qq.options.length === 1) warnings.push(`${where}: один вариант ответа — проверьте A) B) C) D)`);
        if (!qq.answer) warnings.push(`${where}: нет ответа`);
      }
      if (!qq.topic) warnings.push(`${where}: нет темы`);
      if (!qq.stem && !qq.passage) warnings.push(`${where}: пустой текст вопроса`);
    });
    if (!s.title) s.title = `Модуль ${si + 1}`;
  });
  if (!sections.length) warnings.push("Не нашлось ни одного модуля: строка модуля начинается с «#», например «# Math — Модуль 1 | Math | 35 мин»");
  return { title: title || fallbackTitle, sections, warnings };
}

/** HTML от mammoth → блоки (абзацы, пункты списков, картинки). Только в браузере. */
export function htmlToBlocks(html: string): ImportBlock[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const out: ImportBlock[] = [];
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "ol" || tag === "ul") {
        for (const li of Array.from(child.children)) {
          const nested = Array.from(li.children).filter((c) => ["ol", "ul"].includes(c.tagName.toLowerCase()));
          const clone = li.cloneNode(true) as Element;
          clone.querySelectorAll("ol,ul").forEach((n) => n.remove());
          out.push({ text: clone.textContent ?? "", listItem: true, heading: false, images: Array.from(clone.querySelectorAll("img")).map((i) => i.getAttribute("src") ?? "").filter(Boolean) });
          nested.forEach((n) => walk({ children: [n] } as unknown as Element));
        }
      } else if (tag === "table") {
        // таблицы — построчно, ячейки через « | »
        for (const tr of Array.from(child.querySelectorAll("tr"))) {
          out.push({ text: Array.from(tr.children).map((td) => (td.textContent ?? "").trim()).join(" | "), listItem: false, heading: false, images: [] });
        }
      } else {
        out.push({
          text: child.textContent ?? "",
          listItem: false,
          heading: /^h[1-6]$/.test(tag),
          images: Array.from(child.querySelectorAll("img")).map((i) => i.getAttribute("src") ?? "").filter(Boolean),
        });
      }
    }
  };
  walk(doc.body.firstElementChild as Element);
  return out;
}

/** Обычный текст (вставка из буфера) → блоки построчно. */
export function textToBlocks(text: string): ImportBlock[] {
  return text.split(/\r?\n/).map((line) => ({ text: line, listItem: false, heading: false, images: [] }));
}
