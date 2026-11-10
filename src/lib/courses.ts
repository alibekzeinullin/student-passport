"use client";

import { createClient } from "@/lib/supabase/client";

export interface StudentCourse {
  enrollment_id: string;
  course_id: string;
  course_name: string;
  group_name: string | null;
  stream_name: string | null;
  teacher_name: string | null;
  curator_name: string | null;
  starts_on: string;
  target_score: number | null;
  sat_date: string | null;
}

/** Действующие курсы ученика. До migration-sat-1.sql — пустой список (только менторство). */
export async function loadStudentCourses(studentId: string): Promise<StudentCourse[]> {
  const { data, error } = await createClient().rpc("student_courses", { p_student: studentId });
  if (error) return [];
  return (data as StudentCourse[]) ?? [];
}

/** Менторство показываем, если ученик зачислен на него или ни на что не зачислен (все прежние ученики). */
export function hasMentoring(courses: StudentCourse[]): boolean {
  return courses.length === 0 || courses.some((c) => c.course_id === "mentoring");
}
