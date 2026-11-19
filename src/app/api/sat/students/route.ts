import { createUserClient, errorResponse, getCaller, HttpError } from "@/lib/supabase/admin";
import { emailToLogin, loginToEmail } from "@/lib/accounts";
import { generatePassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";

const SAT_ROLES = ["head", "sat_teacher", "sat_senior_teacher", "sat_curator"];

/**
 * Сотрудник SAT создаёт новому ученику аккаунт и сразу зачисляет его в группу.
 * Учитель — только в свои группы, руководитель и старший учитель — в любые (проверяет база: can_edit_group).
 * Ученик попадает только на SAT — в менторских разделах его не видно.
 */
export async function POST(request: Request) {
  try {
    const caller = await getCaller(request);
    const allowed = caller.active && (caller.profileRole === "admin" || caller.roles.some((r) => SAT_ROLES.includes(r)));
    if (!allowed) throw new HttpError(403, "forbidden", "Только для сотрудников SAT");

    const body = (await request.json()) as {
      fullName?: string;
      login?: string;
      className?: string;
      school?: string;
      groupId?: string;
      startsOn?: string;
      targetScore?: number | null;
      satDate?: string | null;
    };
    const fullName = body.fullName?.trim().replace(/\s+/g, " ") ?? "";
    const login = body.login?.trim().toLowerCase() ?? "";
    const groupId = body.groupId ?? "";
    const startsOn = body.startsOn && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn) ? body.startsOn : new Date().toISOString().slice(0, 10);
    if (fullName.split(" ").length < 2) throw new HttpError(400, "bad_name", "Укажите имя и фамилию");
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw new HttpError(400, "bad_login", "Логин: латиница, цифры, точка, дефис — от 3 символов");
    if (!groupId) throw new HttpError(400, "bad_group", "Нет группы");
    const target = body.targetScore ?? null;
    if (target !== null && (!Number.isInteger(target) || target < 400 || target > 1600)) throw new HttpError(400, "bad_target", "Цель SAT — от 400 до 1600");

    // права на группу проверяет база от имени сотрудника
    const userDb = createUserClient(request);
    if (!userDb) throw new HttpError(401, "unauthorized", "Нужен вход");
    const { data: canEdit, error: rpcErr } = await userDb.rpc("can_edit_group", { p_group: groupId });
    if (rpcErr) throw rpcErr;
    if (!canEdit) throw new HttpError(403, "forbidden", "Добавлять учеников можно только в свои группы");

    const { admin } = caller;
    const { data: group } = await admin.from("groups").select("id, course_id, archived").eq("id", groupId).maybeSingle();
    const g = group as { course_id: string; archived: boolean } | null;
    if (!g || g.course_id !== "sat" || g.archived) throw new HttpError(400, "bad_group", "Группа не найдена или в архиве");

    const [firstName, ...rest] = fullName.split(" ");
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
        education_system: "Национальная",
        must_change_password: true,
      },
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) throw new HttpError(409, "exists", "Такой логин уже занят");
      throw error;
    }

    const { data: profile } = await admin.from("profiles").select("student_id").eq("id", data.user.id).maybeSingle();
    const studentId = (profile as { student_id?: string | null } | null)?.student_id;
    if (!studentId) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw new HttpError(500, "no_student", "Не удалось создать карточку ученика — попробуйте ещё раз");
    }
    const { error: eErr } = await admin.from("enrollments").insert({
      student_id: studentId,
      course_id: "sat",
      group_id: groupId,
      starts_on: startsOn,
      target_score: target,
      sat_date: body.satDate || null,
    });
    if (eErr) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw eErr;
    }
    return Response.json({ studentId, login: emailToLogin(loginToEmail(login)), password });
  } catch (err) {
    return errorResponse(err);
  }
}
