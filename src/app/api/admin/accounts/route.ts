import { errorResponse, HttpError, requireAdmin } from "@/lib/supabase/admin";
import { emailToLogin, loginToEmail, type AccountRow } from "@/lib/accounts";
import { randomInt } from "node:crypto";

export const dynamic = "force-dynamic";

/** Временный пароль: легко продиктовать, без похожих символов (0/O, 1/l). */
function generatePassword(): string {
  const words = ["sky", "sun", "star", "moon", "river", "peak", "wind", "leaf", "wave", "fox", "owl", "bear"];
  const caps = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const word = words[randomInt(words.length)];
  const digits = String(randomInt(1000, 10000));
  return `${caps[randomInt(caps.length)]}${word}-${digits}`;
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  status?: string | null;
}

interface ProfileRow {
  id: string;
  role: string;
  full_name: string;
  student_id: string | null;
}

/** Список аккаунтов учеников с последним входом. */
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);

    const users: { id: string; email?: string; last_sign_in_at?: string | null; created_at?: string; user_metadata?: Record<string, unknown> }[] = [];
    for (let page = 1; page < 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }

    const { data: profiles, error: pErr } = await admin.from("profiles").select("id, role, full_name, student_id");
    if (pErr) throw pErr;
    const { data: students, error: sErr } = await admin.from("students").select("*");
    if (sErr) throw sErr;

    const userById = new Map(users.map((u) => [u.id, u]));
    const profileByStudent = new Map(
      ((profiles as ProfileRow[]) ?? [])
        .filter((p) => p.student_id && p.role === "student")
        .map((p) => [p.student_id as string, p]),
    );

    const rows: AccountRow[] = ((students as StudentRow[]) ?? []).map((s) => {
      const profile = profileByStudent.get(s.id);
      const user = profile ? userById.get(profile.id) : undefined;
      const email = user?.email ?? "";
      return {
        studentId: s.id,
        userId: user?.id ?? null,
        name: `${s.last_name} ${s.first_name}`.trim(),
        className: s.class_name ?? "",
        status: s.status === "paused" ? "paused" : "active",
        login: emailToLogin(email),
        email,
        lastSignInAt: user?.last_sign_in_at ?? null,
        createdAt: user?.created_at ?? null,
        mustChangePassword: Boolean(user?.user_metadata?.must_change_password),
      };
    });
    rows.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return Response.json({ accounts: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Создать аккаунт ученика с временным паролем. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = (await request.json()) as {
      fullName?: string;
      login?: string;
      className?: string;
      school?: string;
      educationSystem?: string;
    };
    const fullName = body.fullName?.trim() ?? "";
    const login = body.login?.trim().toLowerCase() ?? "";
    if (!fullName || !login) throw new HttpError(400, "bad_request", "Укажите имя и логин");
    if (!login.includes("@") && !/^[a-z0-9._-]{3,40}$/.test(login)) {
      throw new HttpError(400, "bad_login", "Логин: латиница, цифры, точка, дефис — от 3 символов");
    }

    const [firstName, ...rest] = fullName.split(/\s+/);
    const password = generatePassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: loginToEmail(login),
      password,
      email_confirm: true,
      user_metadata: {
        role: "student",
        full_name: fullName,
        first_name: firstName,
        last_name: rest.join(" "),
        class_name: body.className?.trim() ?? "",
        school: body.school?.trim() ?? "",
        education_system: body.educationSystem || "Национальная",
        must_change_password: true,
      },
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        throw new HttpError(409, "exists", "Такой логин уже занят");
      }
      throw error;
    }
    return Response.json({ userId: data.user?.id, login: emailToLogin(loginToEmail(login)), password });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Сбросить пароль: новый временный, при входе попросит сменить. */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = (await request.json()) as { userId?: string };
    if (!body.userId) throw new HttpError(400, "bad_request", "Нет userId");

    const { data: target, error: getErr } = await admin.auth.admin.getUserById(body.userId);
    if (getErr || !target.user) throw new HttpError(404, "not_found", "Аккаунт не найден");

    const { data: profile } = await admin.from("profiles").select("role").eq("id", body.userId).maybeSingle();
    if ((profile as { role?: string } | null)?.role === "admin") {
      throw new HttpError(403, "forbidden", "Пароль ментора здесь не сбрасывается");
    }

    const password = generatePassword();
    const { error } = await admin.auth.admin.updateUserById(body.userId, {
      password,
      user_metadata: { ...(target.user.user_metadata ?? {}), must_change_password: true },
    });
    if (error) throw error;
    return Response.json({ login: emailToLogin(target.user.email ?? ""), password });
  } catch (err) {
    return errorResponse(err);
  }
}
