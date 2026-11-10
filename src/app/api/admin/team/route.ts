import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, HttpError, requireHead, type Caller } from "@/lib/supabase/admin";
import { emailToLogin, loginToEmail, suggestLogin } from "@/lib/accounts";
import { generatePassword } from "@/lib/passwords";
import {
  STAFF_ROLES,
  type GroupOption,
  type GroupStaffRole,
  type StaffAuditRow,
  type StaffRole,
  type StaffRow,
} from "@/lib/staff";

export const dynamic = "force-dynamic";

const LOGIN_RE = /^[a-z0-9._-]{3,40}$/;

function cleanRoles(input: unknown): StaffRole[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((r): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(r as string)))];
}

function today(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
}

/** Понятное сообщение вместо текста ошибки базы. */
function dbMessage(err: { message?: string } | null): string {
  const msg = err?.message ?? "Ошибка базы";
  if (msg.includes("последнего руководителя")) return "Нельзя убрать последнего руководителя";
  if (msg.includes("staff_members") && msg.includes("does not exist")) {
    return "В базе нет таблиц сотрудников — выполните supabase/setup-all.sql";
  }
  return msg;
}

async function audit(
  admin: SupabaseClient,
  caller: Caller,
  target: { id: string; name: string },
  action: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await admin.from("staff_audit").insert({
    actor_id: caller.userId,
    actor_name: caller.name,
    target_id: target.id,
    target_name: target.name,
    action,
    details,
  });
  if (error) console.error("staff_audit", error);
}

async function memberName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from("staff_members").select("full_name").eq("user_id", userId).maybeSingle();
  return (data as { full_name?: string } | null)?.full_name ?? "";
}

/** Список сотрудников, группы для выбора и журнал. */
export async function GET(request: Request) {
  try {
    const caller = await requireHead(request);
    const { admin } = caller;

    const { data: members, error: mErr } = await admin
      .from("staff_members")
      .select("user_id, full_name, city, active, staff_roles(role)")
      .order("full_name");
    if (mErr) throw new HttpError(500, "db", dbMessage(mErr));

    const { data: gs } = await admin
      .from("group_staff")
      .select("user_id, role, starts_on, ends_on, groups(id, name)")
      .lte("starts_on", today())
      .or(`ends_on.is.null,ends_on.gte.${today()}`);

    const { data: groups } = await admin
      .from("groups")
      .select("id, name, course_id, archived, streams(name)")
      .eq("archived", false)
      .order("name");

    const { data: log } = await admin
      .from("staff_audit")
      .select("id, actor_name, target_name, action, details, created_at")
      .order("created_at", { ascending: false })
      .limit(60);

    const users = new Map<string, { email?: string; last_sign_in_at?: string | null; user_metadata?: Record<string, unknown> }>();
    for (let page = 1; page < 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      data.users.forEach((u) => users.set(u.id, u));
      if (data.users.length < 1000) break;
    }

    type GsRow = { user_id: string; role: GroupStaffRole; groups: { id: string; name: string } | null };
    const groupsByUser = new Map<string, StaffRow["groups"]>();
    ((gs as unknown as GsRow[] | null) ?? []).forEach((r) => {
      if (!r.groups) return;
      const list = groupsByUser.get(r.user_id) ?? [];
      list.push({ groupId: r.groups.id, groupName: r.groups.name, role: r.role });
      groupsByUser.set(r.user_id, list);
    });

    type MRow = { user_id: string; full_name: string; city: string; active: boolean; staff_roles: { role: StaffRole }[] | null };
    const staff: StaffRow[] = ((members as MRow[] | null) ?? []).map((m) => {
      const u = users.get(m.user_id);
      return {
        userId: m.user_id,
        fullName: m.full_name,
        login: emailToLogin(u?.email ?? ""),
        city: m.city,
        roles: (m.staff_roles ?? []).map((r) => r.role).sort((a, b) => STAFF_ROLES.indexOf(a) - STAFF_ROLES.indexOf(b)),
        active: m.active,
        groups: groupsByUser.get(m.user_id) ?? [],
        lastSignInAt: u?.last_sign_in_at ?? null,
        mustChangePassword: Boolean(u?.user_metadata?.must_change_password),
      };
    });

    type GRow = { id: string; name: string; course_id: string; streams: { name: string } | null };
    const groupOptions: GroupOption[] = ((groups as unknown as GRow[] | null) ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      courseId: g.course_id,
      streamName: g.streams?.name ?? "",
    }));

    type LRow = { id: number; actor_name: string; target_name: string; action: string; details: Record<string, unknown>; created_at: string };
    const auditRows: StaffAuditRow[] = ((log as LRow[] | null) ?? []).map((l) => ({
      id: l.id,
      actorName: l.actor_name,
      targetName: l.target_name,
      action: l.action,
      details: l.details ?? {},
      createdAt: l.created_at,
    }));

    return Response.json({ staff, groups: groupOptions, audit: auditRows, me: caller.userId });
  } catch (err) {
    return errorResponse(err);
  }
}

interface NewStaff {
  fullName?: string;
  login?: string;
  roles?: unknown;
  city?: string;
  groups?: { groupId?: string; role?: string }[];
}

interface Created {
  fullName: string;
  login: string;
  password?: string;
  roles: StaffRole[];
  error?: string;
}

async function createOne(caller: Caller, item: NewStaff, autoLogin: boolean): Promise<Created> {
  const { admin } = caller;
  const fullName = item.fullName?.trim().replace(/\s+/g, " ") ?? "";
  const roles = cleanRoles(item.roles);
  let login = (item.login?.trim().toLowerCase() || suggestLogin(fullName)).replace(/\s+/g, "");
  const base: Created = { fullName, login, roles };

  if (!fullName) return { ...base, error: "Укажите ФИО" };
  if (roles.length === 0) return { ...base, error: "Выберите хотя бы одну роль" };
  if (!login.includes("@") && !LOGIN_RE.test(login)) {
    return { ...base, error: "Логин: латиница, цифры, точка, дефис — от 3 символов" };
  }

  const password = generatePassword();
  let userId: string | null = null;
  // При массовом создании занятый логин получает номер: ivan.petrov2
  for (let attempt = 0; attempt < (autoLogin ? 9 : 1); attempt++) {
    const tryLogin = attempt === 0 ? login : `${login}${attempt + 1}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: loginToEmail(tryLogin),
      password,
      email_confirm: true,
      app_metadata: { account_type: "staff" },
      user_metadata: { full_name: fullName, must_change_password: true },
    });
    if (!error && data.user) {
      userId = data.user.id;
      login = tryLogin;
      break;
    }
    const exists = error?.message.toLowerCase().includes("already");
    if (!exists) return { ...base, error: error?.message ?? "Не удалось создать вход" };
    if (!autoLogin) return { ...base, error: "Такой логин уже занят" };
  }
  if (!userId) return { ...base, error: "Все варианты логина заняты — задайте свой" };

  try {
    // Если база создала пустую карточку ученика (старый триггер) — убираем её
    const { data: profile } = await admin.from("profiles").select("student_id").eq("id", userId).maybeSingle();
    const studentId = (profile as { student_id?: string | null } | null)?.student_id;
    await admin.from("profiles").upsert({ id: userId, role: "staff", full_name: fullName, student_id: null });
    if (studentId) await admin.from("students").delete().eq("id", studentId);

    const { error: mErr } = await admin
      .from("staff_members")
      .insert({ user_id: userId, full_name: fullName, city: item.city?.trim() ?? "" });
    if (mErr) throw mErr;
    const { error: rErr } = await admin.from("staff_roles").insert(roles.map((role) => ({ user_id: userId, role })));
    if (rErr) throw rErr;

    const groups = (item.groups ?? []).filter((g) => g.groupId);
    if (groups.length) {
      const { error: gErr } = await admin.from("group_staff").insert(
        groups.map((g) => ({
          group_id: g.groupId,
          user_id: userId,
          role: g.role === "curator" ? "curator" : "teacher",
          starts_on: today(),
          created_by: caller.userId,
        })),
      );
      if (gErr) throw gErr;
    }
    await audit(admin, caller, { id: userId, name: fullName }, "create", {
      login,
      roles,
      groups: groups.map((g) => g.groupId),
    });
    return { fullName, login: emailToLogin(loginToEmail(login)), password, roles };
  } catch (err) {
    // Не оставляем полусозданный аккаунт
    await admin.auth.admin.deleteUser(userId);
    return { ...base, error: dbMessage(err as { message?: string }) };
  }
}

/** Создать сотрудника (или сразу нескольких — массовое создание). */
export async function POST(request: Request) {
  try {
    const caller = await requireHead(request);
    const body = (await request.json()) as { items?: NewStaff[] };
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    if (items.length === 0) throw new HttpError(400, "bad_request", "Нет сотрудников для создания");
    const auto = items.length > 1;
    const results: Created[] = [];
    for (const item of items) {
      results.push(await createOne(caller, item, auto || !item.login));
    }
    return Response.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Изменить роли / данные, сбросить пароль, отключить или включить. */
export async function PATCH(request: Request) {
  try {
    const caller = await requireHead(request);
    const { admin } = caller;
    const body = (await request.json()) as {
      userId?: string;
      action?: "roles" | "update" | "reset_password" | "disable" | "enable";
      roles?: unknown;
      fullName?: string;
      city?: string;
    };
    const userId = body.userId ?? "";
    if (!userId) throw new HttpError(400, "bad_request", "Нет userId");
    const name = await memberName(admin, userId);
    if (!name && body.action !== "update") throw new HttpError(404, "not_found", "Сотрудник не найден");
    const self = userId === caller.userId;

    switch (body.action) {
      case "roles": {
        const roles = cleanRoles(body.roles);
        if (roles.length === 0) throw new HttpError(400, "bad_request", "Оставьте хотя бы одну роль или отключите сотрудника");
        if (self && !roles.includes("head")) {
          throw new HttpError(400, "self", "Нельзя снять роль руководителя с себя — попросите другого руководителя");
        }
        const { data: current } = await admin.from("staff_roles").select("role").eq("user_id", userId);
        const before = ((current as { role: StaffRole }[] | null) ?? []).map((r) => r.role);
        const add = roles.filter((r) => !before.includes(r));
        const remove = before.filter((r) => !roles.includes(r));
        // Сначала добавляем, потом убираем — чтобы не остаться без руководителя по пути
        if (add.length) {
          const { error } = await admin.from("staff_roles").insert(add.map((role) => ({ user_id: userId, role })));
          if (error) throw new HttpError(400, "db", dbMessage(error));
        }
        if (remove.length) {
          const { error } = await admin.from("staff_roles").delete().eq("user_id", userId).in("role", remove);
          if (error) throw new HttpError(400, "db", dbMessage(error));
        }
        if (add.length || remove.length) {
          await audit(admin, caller, { id: userId, name }, "roles", { before, after: roles });
        }
        return Response.json({ ok: true });
      }
      case "update": {
        const fullName = body.fullName?.trim().replace(/\s+/g, " ") ?? "";
        if (!fullName) throw new HttpError(400, "bad_request", "Укажите ФИО");
        const city = body.city?.trim() ?? "";
        const { error } = await admin.from("staff_members").update({ full_name: fullName, city }).eq("user_id", userId);
        if (error) throw new HttpError(400, "db", dbMessage(error));
        await admin.from("profiles").update({ full_name: fullName }).eq("id", userId);
        await audit(admin, caller, { id: userId, name: fullName }, "update", { before: name, fullName, city });
        return Response.json({ ok: true });
      }
      case "reset_password": {
        if (self) throw new HttpError(400, "self", "Свой пароль меняйте при входе");
        const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId);
        if (getErr || !target.user) throw new HttpError(404, "not_found", "Аккаунт не найден");
        const password = generatePassword();
        const { error } = await admin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { ...(target.user.user_metadata ?? {}), must_change_password: true },
        });
        if (error) throw error;
        await audit(admin, caller, { id: userId, name }, "reset_password");
        return Response.json({ login: emailToLogin(target.user.email ?? ""), password });
      }
      case "disable":
      case "enable": {
        const active = body.action === "enable";
        if (self && !active) throw new HttpError(400, "self", "Нельзя отключить самого себя");
        const { error } = await admin
          .from("staff_members")
          .update({ active, disabled_at: active ? null : new Date().toISOString() })
          .eq("user_id", userId);
        if (error) throw new HttpError(400, "db", dbMessage(error));
        // Отключённый не может войти; история и данные остаются
        const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: active ? "none" : "876000h",
        });
        if (banErr) console.error("ban", banErr);
        await audit(admin, caller, { id: userId, name }, body.action);
        return Response.json({ ok: true });
      }
      default:
        throw new HttpError(400, "bad_request", "Неизвестное действие");
    }
  } catch (err) {
    return errorResponse(err);
  }
}
