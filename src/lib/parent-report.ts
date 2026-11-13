/** Месячный отчёт родителям — общий для предпросмотра на сайте и отправки ботом. */

const MONTHS_PREP = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const NUM = ["1⃣", "2⃣", "3⃣", "4⃣", "5⃣", "6⃣"];

export function monthGenitive(prefix: string): string {
  return MONTHS_GEN[Number(prefix.slice(5, 7)) - 1] ?? "";
}

export function monthNominative(prefix: string): string {
  return MONTHS_NOM[Number(prefix.slice(5, 7)) - 1] ?? "";
}

export function monthPrepositional(prefix: string): string {
  return MONTHS_PREP[Number(prefix.slice(5, 7)) - 1] ?? "";
}

export interface MeetingParentNote {
  date: string; // YYYY-MM-DD
  win: string;
  focus: string;
  help: string;
}

export interface ReportFacts {
  individualHeld: number;
  individualAttended: number;
  groupHeld: number;
  groupAttended: number;
  homeworkCompletion: number | null; // 0–100
  essaysAccepted: number;
  essaysAverage: number | null;
  essaysSubmitted: number;
  deadlinesSubmitted: string[];
}

export interface ReportInput {
  firstName: string;
  month: string; // YYYY-MM
  overall: string;
  groupNote: string;
  help: string;
  facts: ReportFacts;
  notes: MeetingParentNote[];
  link: string;
}

function lines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[-—•\s]+/, "").trim())
    .filter(Boolean);
}

/** Уникальные пункты: одинаковые фразы с двух встреч не повторяем. */
function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.toLowerCase().replace(/[.!\s]+$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildReportMessage(input: ReportInput): string {
  const { facts } = input;
  const out: string[] = [];
  out.push(`Салем! Итоги ${monthGenitive(input.month)} у ${input.firstName}`);
  if (input.overall.trim()) out.push("", input.overall.trim());

  const stats: string[] = [];
  if (facts.individualHeld || facts.groupHeld) {
    const parts: string[] = [];
    if (facts.individualHeld) parts.push(`индивидуальные ${facts.individualAttended} из ${facts.individualHeld}`);
    if (facts.groupHeld) parts.push(`групповые ${facts.groupAttended} из ${facts.groupHeld}`);
    stats.push(`Встречи: ${parts.join(", ")}`);
  }
  if (facts.homeworkCompletion !== null) stats.push(`Домашние задания: ${facts.homeworkCompletion}%`);
  if (facts.essaysAccepted || facts.essaysSubmitted) {
    const parts: string[] = [];
    if (facts.essaysAccepted) parts.push(`принято ${facts.essaysAccepted}${facts.essaysAverage !== null ? ` (средняя оценка ${facts.essaysAverage.toFixed(1).replace(".0", "")}/10)` : ""}`);
    if (facts.essaysSubmitted > facts.essaysAccepted) parts.push(`сдано ${facts.essaysSubmitted}`);
    stats.push(`Эссе: ${parts.join(", ")}`);
  }
  if (facts.deadlinesSubmitted.length) stats.push(`Подали заявки: ${facts.deadlinesSubmitted.join(", ")}`);
  if (stats.length) out.push("", ...stats);

  const wins = uniq(input.notes.flatMap((n) => lines(n.win)));
  const focus = uniq(input.notes.flatMap((n) => lines(n.focus)));
  const help = uniq([...input.notes.flatMap((n) => lines(n.help)), ...lines(input.help)]);
  const group = lines(input.groupNote);

  const blocks: [string, string[]][] = [
    ["Что получилось", wins],
    ["Над чем работаем", focus],
    ["Групповые встречи", group],
    ["Чем помочь дома", help],
  ];
  let n = 0;
  for (const [title, items] of blocks) {
    if (!items.length) continue;
    out.push("", `${NUM[n] ?? `${n + 1}.`} ${title}:`);
    items.forEach((i) => out.push(`— ${i}`));
    n += 1;
  }

  out.push("", `Полный отчёт: ${input.link}`, "", "Спасибо, что вы с нами! 💡");
  return out.join("\n");
}

/** Месяц для рассылки: в первую неделю — прошлый, потом — текущий. */
export function defaultReportMonth(now = new Date()): string {
  const local = new Date(now.getTime() + 5 * 3600 * 1000);
  const back = local.getUTCDate() <= 7 ? 1 : 0;
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
