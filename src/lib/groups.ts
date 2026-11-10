"use client";

import { createClient } from "@/lib/supabase/client";
import type { GroupStaffRole } from "@/lib/staff";

export interface StreamRow {
  id: string;
  course_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
}

export interface GroupRow {
  id: string;
  course_id: string;
  stream_id: string | null;
  name: string;
  city: string;
  note: string;
  archived: boolean;
}

export interface GroupStaffRow {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupStaffRole;
  starts_on: string;
  ends_on: string | null;
}

export interface StaffOption {
  user_id: string;
  full_name: string;
  active: boolean;
  roles: string[];
}

export interface RosterRow {
  enrollment_id: string;
  student_id: string;
  full_name: string;
  class_name: string;
  school: string;
  group_id: string | null;
  starts_on: string;
  target_score: number | null;
  sat_date: string | null;
  note: string;
}

export interface StudentHit {
  id: string;
  full_name: string;
  class_name: string;
  school: string;
}

export interface GroupsData {
  streams: StreamRow[];
  groups: GroupRow[];
  staffLinks: GroupStaffRow[];
  staff: StaffOption[];
  roster: RosterRow[];
}

function fail(error: { message: string; code?: string } | null): never | void {
  if (!error) return;
  const msg = error.message ?? "";
  if (error.code === "42P01" || error.code === "PGRST205" || msg.includes("does not exist") || msg.includes("Could not find")) {
    throw new Error("В базе нет таблиц групп — выполните supabase/setup-all.sql (Ещё → База и копии)");
  }
  throw new Error(friendly(msg));
}

export function friendly(msg: string): string {
  if (msg.includes("enrollments_one_active_idx")) return "Ученик уже в другой SAT-группе — используйте «Перевести»";
  if (msg.includes("row-level security")) return "Недостаточно прав для этого действия";
  if (msg.includes("enrollments_group_id_fkey")) return "В группе есть ученики (в том числе в истории) — её можно только архивировать";
  return msg;
}

export async function loadGroupsData(): Promise<GroupsData> {
  const supabase = createClient();
  const [streams, groups, links, members, roster] = await Promise.all([
    supabase.from("streams").select("id, course_id, name, starts_on, ends_on").eq("course_id", "sat").order("created_at"),
    supabase.from("groups").select("id, course_id, stream_id, name, city, note, archived").eq("course_id", "sat").order("name"),
    supabase.from("group_staff").select("id, group_id, user_id, role, starts_on, ends_on").order("starts_on"),
    supabase.from("staff_members").select("user_id, full_name, active, staff_roles(role)").order("full_name"),
    supabase.rpc("sat_roster"),
  ]);
  fail(streams.error);
  fail(groups.error);
  fail(links.error);
  fail(members.error);
  fail(roster.error);
  type M = { user_id: string; full_name: string; active: boolean; staff_roles: { role: string }[] | null };
  return {
    streams: (streams.data as StreamRow[]) ?? [],
    groups: (groups.data as GroupRow[]) ?? [],
    staffLinks: (links.data as GroupStaffRow[]) ?? [],
    staff: ((members.data as M[]) ?? []).map((m) => ({
      user_id: m.user_id,
      full_name: m.full_name,
      active: m.active,
      roles: (m.staff_roles ?? []).map((r) => r.role),
    })),
    roster: (roster.data as RosterRow[]) ?? [],
  };
}

export async function createStream(name: string, startsOn: string | null) {
  const { error } = await createClient().from("streams").insert({ course_id: "sat", name: name.trim(), starts_on: startsOn || null });
  fail(error);
}

export async function createGroup(input: { name: string; streamId: string | null; city: string }) {
  const { error } = await createClient()
    .from("groups")
    .insert({ course_id: "sat", name: input.name.trim(), stream_id: input.streamId || null, city: input.city.trim() });
  fail(error);
}

export async function updateGroup(id: string, patch: Partial<Pick<GroupRow, "name" | "city" | "note" | "archived" | "stream_id">>) {
  const { error } = await createClient().from("groups").update(patch).eq("id", id);
  fail(error);
}

export async function replaceGroupStaff(groupId: string, role: GroupStaffRole, userId: string | null, date: string) {
  const { error } = await createClient().rpc("replace_group_staff", {
    p_group: groupId,
    p_role: role,
    p_user: userId,
    p_date: date,
  });
  fail(error);
}

/** Добавить ещё одного учителя/куратора, не снимая текущих. */
export async function addGroupStaff(groupId: string, role: GroupStaffRole, userId: string, date: string) {
  const { error } = await createClient().from("group_staff").insert({ group_id: groupId, role, user_id: userId, starts_on: date });
  fail(error);
}

export async function endGroupStaff(linkId: string, date: string) {
  const { error } = await createClient().from("group_staff").update({ ends_on: date }).eq("id", linkId);
  fail(error);
}

export async function searchStudents(query: string): Promise<StudentHit[]> {
  const { data, error } = await createClient().rpc("search_students_for_enrollment", { p_query: query });
  fail(error);
  return (data as StudentHit[]) ?? [];
}

export async function enrollStudent(input: {
  studentId: string;
  groupId: string;
  startsOn: string;
  targetScore: number | null;
  satDate: string | null;
}) {
  const { error } = await createClient().from("enrollments").insert({
    student_id: input.studentId,
    course_id: "sat",
    group_id: input.groupId,
    starts_on: input.startsOn,
    target_score: input.targetScore,
    sat_date: input.satDate,
  });
  fail(error);
}

export async function updateEnrollment(id: string, patch: { target_score?: number | null; sat_date?: string | null; note?: string }) {
  const { error } = await createClient().from("enrollments").update(patch).eq("id", id);
  fail(error);
}

export async function endEnrollment(id: string, date: string, reason: "left" | "finished") {
  const { error } = await createClient().from("enrollments").update({ ends_on: date, end_reason: reason }).eq("id", id);
  fail(error);
}

export async function transferEnrollment(id: string, groupId: string, date: string) {
  const { error } = await createClient().rpc("transfer_enrollment", { p_enrollment: id, p_group: groupId, p_date: date });
  fail(error);
}

/** Кто сейчас ведёт группу (на дату). */
export function activeLinks(links: GroupStaffRow[], groupId: string, date: string) {
  return links.filter((l) => l.group_id === groupId && l.starts_on <= date && (!l.ends_on || l.ends_on >= date));
}

/** Назначения, которые начнутся позже (запланированная замена). */
export function upcomingLinks(links: GroupStaffRow[], groupId: string, date: string) {
  return links.filter((l) => l.group_id === groupId && l.starts_on > date);
}

export function parseScore(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 400 && n <= 1600 ? n : null;
}
