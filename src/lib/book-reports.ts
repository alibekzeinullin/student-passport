import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { cached, peek } from "@/lib/cache";

export type BookReportStatus = "submitted" | "accepted" | "revision";

export const BOOK_REPORT_LABELS: Record<BookReportStatus, string> = {
  submitted: "На проверке",
  accepted: "Засчитано",
  revision: "Вернули",
};

/** Минимум символов в отзыве (то же правило стоит в базе). */
export const REVIEW_MIN_CHARS = 40;

export const BOOK_TIERS = [
  { goal: 3, title: "3 книги", rare: false },
  { goal: 5, title: "Книжный червь", rare: false },
  { goal: 10, title: "10 книг", rare: true },
] as const;

export interface BookReport {
  id: string;
  studentId: string;
  bookId: string;
  title: string;
  author: string;
  review: string;
  status: BookReportStatus;
  mentorComment: string;
  submittedAt: string;
  reviewedAt: string | null;
}

interface DbBookReport {
  id: string;
  student_id: string;
  book_id: string;
  title: string;
  author: string;
  review: string | null;
  status: BookReportStatus;
  mentor_comment: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

function map(r: DbBookReport): BookReport {
  return {
    id: r.id,
    studentId: r.student_id,
    bookId: r.book_id,
    title: r.title ?? "",
    author: r.author ?? "",
    review: r.review ?? "",
    status: r.status,
    mentorComment: r.mentor_comment ?? "",
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
  };
}

async function fetchRaw(studentId?: string): Promise<BookReport[]> {
  if (!isSupabaseConfigured()) return [];
  let q = createClient().from("book_reports").select("*");
  if (studentId) q = q.eq("student_id", studentId);
  const { data, error } = await q.order("submitted_at");
  if (error) throw error;
  return ((data as DbBookReport[]) ?? []).map(map);
}

export const fetchBookReports = (studentId?: string) =>
  cached(`books:${studentId ?? "all"}`, () => fetchRaw(studentId));
export const peekBookReports = (studentId?: string) => peek<BookReport[]>(`books:${studentId ?? "all"}`);

export const fetchBookReportsByParentToken = (token: string) =>
  cached(`books:parent:${token}`, async () => {
    if (!isSupabaseConfigured() || !token) return [] as BookReport[];
    const { data, error } = await createClient().rpc("get_book_reports_by_parent_token", { p_token: token });
    if (error) throw error;
    return ((data as DbBookReport[]) ?? []).map(map);
  });

export interface BookRank {
  accepted: number;
  place: number;
  totalStudents: number;
}

export async function fetchMyBookRank(): Promise<BookRank | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await createClient().rpc("my_book_rank");
  if (error) throw error;
  const row = (data as { accepted: number; place: number; total_students: number }[] | null)?.[0];
  return row ? { accepted: row.accepted, place: row.place, totalStudents: row.total_students } : null;
}

/** Ученик отправляет (или переотправляет) отзыв. */
export async function submitBookReport(params: {
  existingId?: string;
  studentId: string;
  bookId: string;
  title: string;
  author: string;
  review: string;
}): Promise<void> {
  const supabase = createClient();
  const row = { title: params.title.trim(), author: params.author.trim(), review: params.review.trim(), status: "submitted" };
  const { error } = params.existingId
    ? await supabase.from("book_reports").update(row).eq("id", params.existingId)
    : await supabase.from("book_reports").insert({ ...row, student_id: params.studentId, book_id: params.bookId });
  if (error) throw error;
}

/** Ментор: засчитать или вернуть с комментарием. */
export async function reviewBookReport(id: string, status: "accepted" | "revision", comment: string): Promise<void> {
  const { error } = await createClient()
    .from("book_reports")
    .update({ status, mentor_comment: comment.trim() })
    .eq("id", id);
  if (error) throw error;
}

/** Ментор: засчитать без отзыва (например, обсудили на встрече). */
export async function acceptBookDirectly(params: {
  studentId: string;
  bookId: string;
  title: string;
  author: string;
  comment?: string;
}): Promise<void> {
  const { error } = await createClient()
    .from("book_reports")
    .upsert(
      {
        student_id: params.studentId,
        book_id: params.bookId,
        title: params.title.trim(),
        author: params.author.trim(),
        status: "accepted",
        mentor_comment: params.comment?.trim() || "Засчитано ментором после обсуждения",
      },
      { onConflict: "student_id,book_id" },
    );
  if (error) throw error;
}

export async function deleteBookReport(id: string): Promise<void> {
  const { error } = await createClient().from("book_reports").delete().eq("id", id);
  if (error) throw error;
}

export const acceptedCount = (reports: BookReport[] | null | undefined) =>
  (reports ?? []).filter((r) => r.status === "accepted").length;
