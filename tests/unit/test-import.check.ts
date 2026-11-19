import { parseTestBlocks, textToBlocks, type ImportBlock } from "../../src/lib/test-import";
const typed = `Mock 5 — ноябрь
Инструкция для учителя, эта строка игнорируется
# Reading and Writing — Модуль 1 | Verbal | 32 мин
1. Текст: The scientist's findings were ______ by later studies.
Researchers repeated the experiment.
Вопрос: Which choice completes the text?
A) confirmed
B) ignored
C) hidden
D) lost
Ответ: A
Тема: Words in Context
Баллы: 1
2. Which choice best states the main idea?
A) one
B) two
Ответ: в
Тема: Central Ideas
# Math — Модуль 1 | Math | 35 мин | калькулятор
1. If $3x + 2 = 11$, what is $x$?
Ответ: 3; 3.0
Тема: Linear equations in one variable
Баллы: 2
2. What is 25% of 80?
A) 10
B) 20
C) 25
D) 40
Ответ: B
Тема: Percentages
Баллы: 1,5`;
const r = parseTestBlocks(textToBlocks(typed));
console.log(r.title, r.sections.map(s => `${s.title}|${s.section}|${s.minutes}|${s.calculator}|${s.questions.length}`));
console.log(JSON.stringify(r.sections[0].questions[0]));
console.log(JSON.stringify(r.sections[1].questions.map(q=>[q.kind,q.answer,q.points,q.topic])));
console.log("warnings:", r.warnings);
// автосписки Word: вопросы и варианты — пункты списка
const L = (t: string): ImportBlock => ({ text: t, listItem: true, heading: false, images: [] });
const P = (t: string, img = ""): ImportBlock => ({ text: t, listItem: false, heading: false, images: img ? [img] : [] });
const r2 = parseTestBlocks([P("Тест 2"), P("# Math | 35 мин"), L("Solve $x^2=4$"), P("", "data:img1"), L("2"), L("-2"), L("both"), L("none"), P("Ответ: C"), P("Тема: Nonlinear"), L("Next question?"), P("Ответ: 7"), P("Тема: Linear")]);
console.log(JSON.stringify(r2.sections[0].questions.map(q=>({k:q.kind,stem:q.stem,o:q.options,a:q.answer,img:q.image}))), r2.warnings);
