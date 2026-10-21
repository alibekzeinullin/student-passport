/** Общие для браузера и сервера правила логинов и паролей. */

/** Логин без «@» превращается в служебный email на этом домене. */
export const LOGIN_DOMAIN = "students.todayscholars.local";

export function loginToEmail(login: string): string {
  const value = login.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${LOGIN_DOMAIN}`;
}

export function emailToLogin(email: string): string {
  const suffix = `@${LOGIN_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** «Айлин Дуйсенова» → «aylin.duysenova» */
export function suggestLogin(fullName: string): string {
  return fullName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) =>
      [...part].map((ch) => TRANSLIT[ch] ?? (/[a-z0-9]/.test(ch) ? ch : "")).join(""),
    )
    .filter(Boolean)
    .join(".");
}

export interface AccountRow {
  studentId: string | null;
  userId: string | null;
  name: string;
  className: string;
  status: "active" | "paused";
  login: string;
  email: string;
  lastSignInAt: string | null;
  createdAt: string | null;
  mustChangePassword: boolean;
}

export function inviteMessage(params: { name: string; login: string; password: string; url: string }): string {
  const first = params.name.trim().split(/\s+/)[0] || "";
  return [
    `Привет${first ? `, ${first}` : ""}! Твой вход в Digital Passport TODAY Scholars:`,
    params.url,
    `Логин: ${params.login}`,
    `Пароль: ${params.password}`,
    "При первом входе сайт попросит придумать свой пароль.",
  ].join("\n");
}
